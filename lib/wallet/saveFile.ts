/**
 * Hand a downloaded file to the browser's own save dialog.
 *
 * <p>Web only: it needs `document`. Native has no such thing, and the statement
 * screen says so before it gets here rather than failing in this function.
 */
export function saveBlobOnWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // After the click has been handled; revoking at once can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
