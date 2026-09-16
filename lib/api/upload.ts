import { API_BASE_URL } from './config';
import { ApiError, NetworkError } from './errors';

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
