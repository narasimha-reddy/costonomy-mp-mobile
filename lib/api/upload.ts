import { API_BASE_URL } from './config';
import { ApiError, NetworkError, UploadTimeoutError } from './errors';

/**
 * Upload a file as multipart.
 *
 * <p>Its own function rather than a flag on `apiRequest`, because almost
 * everything that request does is wrong here: it sets a JSON content type,
 * `JSON.stringify`s the body, and retries. A multipart body must set no
 * `Content-Type` at all — the runtime writes it, and the boundary it appends is
 * the only reason the server can parse the parts. Setting the header by hand is
 * the classic way to produce a request that looks right and cannot be read.
 *
 * <p>It also does not retry. A retried upload is a second object in the bucket.
 */
export interface UploadedFile {
  url: string;
  key: string;
  contentType: string;
  bytes: number;
}

export async function uploadFile(
  path: string,
  file: { uri: string; name: string; type: string },
  token: string,
): Promise<UploadedFile> {
  const form = new FormData();

  if (file.uri.startsWith('data:') || file.uri.startsWith('blob:')) {
    // Web: the picker hands back a blob or data URL, and React Native's
    // {uri,name,type} shape means nothing to a browser's FormData.
    const blob = await (await fetch(file.uri)).blob();
    form.append('file', blob, file.name);
  } else {
    // Native: this shape is what the platform's form-data implementation reads.
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as never);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new NetworkError();
  }

  const text = await response.text();
  let envelope: { data?: UploadedFile; error?: { code: string; message: string } } | null = null;
  try {
    envelope = text ? JSON.parse(text) : null;
  } catch {
    envelope = null;
  }

  if (!response.ok) {
    throw new ApiError({
      code: envelope?.error?.code ?? 'UNEXPECTED_ERROR',
      message: envelope?.error?.message ?? 'Could not upload that image.',
      status: response.status,
    });
  }

  return envelope?.data as UploadedFile;
}

export interface UploadPart {
  uri: string;
  name: string;
  type: string;
}

export const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Upload several files as parts named `file`, reporting progress, and return the unwrapped `data`.
 *
 * <p>XMLHttpRequest rather than `fetch`, because `fetch` cannot report how much of the body has
 * gone. Like `uploadFile` it sets no Content-Type (the runtime writes the boundary) and does not
 * retry: a retried upload could be a second bill. A request that runs past the timeout is an
 * `UploadTimeoutError`; one that never connects is a `NetworkError`.
 */
export async function uploadParts<T>(
  path: string,
  files: UploadPart[],
  token: string,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const form = new FormData();
  for (const file of files) {
    if (file.uri.startsWith('data:') || file.uri.startsWith('blob:')) {
      const blob = await (await fetch(file.uri)).blob();
      form.append('file', blob, file.name);
    } else {
      form.append('file', { uri: file.uri, name: file.name, type: file.type } as never);
    }
  }

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }
    xhr.onerror = () => reject(new NetworkError());
    xhr.ontimeout = () => reject(new UploadTimeoutError());
    xhr.onload = () => {
      let envelope: { data?: T; error?: { code: string; message: string } } | null = null;
      try {
        envelope = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        envelope = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(envelope?.data as T);
        return;
      }
      const retryAfter = xhr.getResponseHeader?.('Retry-After');
      reject(new ApiError({
        code: envelope?.error?.code ?? 'UNEXPECTED_ERROR',
        message: envelope?.error?.message ?? 'Could not upload that file.',
        status: xhr.status,
        retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined,
      }));
    };
    xhr.send(form);
  });
}
