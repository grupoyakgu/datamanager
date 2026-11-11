import { api } from './api-client';

function putToUploadUrl(
  uploadUrl: string,
  body: Blob | null,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void
): Promise<{ status: number; body: string; range: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText, range: xhr.getResponseHeader('Range') });
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(body ?? undefined);
  });
}

/**
 * Asks Google how much of a resumable upload session it actually received.
 * Used after the browser's own PUT errors out — that error can mean the
 * bytes never arrived, but it can just as easily mean they did and only the
 * response was lost in transit, so failing outright would misreport a
 * completed upload as broken.
 */
async function checkUploadStatus(uploadUrl: string, totalSize: number): Promise<{ done: true; id: string } | { done: false; bytesReceived: number }> {
  const { status, body, range } = await putToUploadUrl(uploadUrl, null, { 'Content-Range': `bytes */${totalSize}` });
  if (status === 200 || status === 201) return { done: true, id: (JSON.parse(body) as { id: string }).id };
  if (status === 308) {
    const match = range?.match(/bytes=0-(\d+)/);
    return { done: false, bytesReceived: match ? Number(match[1]) + 1 : 0 };
  }
  throw new Error(`Upload session check failed (${status})`);
}

/**
 * Upload one file straight to Google Drive from the browser: our server
 * only issues a short-lived resumable upload session (see
 * /api/drive/files/upload-session) — the actual bytes go directly to
 * Google from here, with no proxy through our own serverless function, so
 * there's no risk of hitting its request-body size limit, and the browser
 * gets real upload-progress events (which a plain `fetch` can't give).
 *
 * A network error on that PUT doesn't necessarily mean the upload failed —
 * Google may have received everything and only the response was lost. On
 * error, the session is checked directly instead of giving up immediately:
 * already complete resolves normally, partially received resumes from
 * where it left off (up to a few times), and only a session that's
 * genuinely gone is reported as a failure.
 */
export async function uploadFileToFolder(folderId: string, file: File, onProgress: (pct: number) => void): Promise<{ id: string }> {
  const { uploadUrl } = await api.post<{ uploadUrl: string }>('/api/drive/files/upload-session', {
    folderId,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
  });
  const contentType = file.type || 'application/octet-stream';

  let start = 0;
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const chunk = start > 0 ? file.slice(start) : file;
    const headers: Record<string, string> = { 'Content-Type': contentType };
    if (start > 0) headers['Content-Range'] = `bytes ${start}-${file.size - 1}/${file.size}`;

    try {
      const { status, body } = await putToUploadUrl(uploadUrl, chunk, headers, (pct) =>
        onProgress(Math.round(((start + (pct / 100) * chunk.size) / file.size) * 100))
      );
      if (status >= 200 && status < 300) {
        try {
          return JSON.parse(body) as { id: string };
        } catch {
          throw new Error('Unexpected response from Google Drive');
        }
      }
      throw new Error(`Upload failed (${status})`);
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
      const checked = await checkUploadStatus(uploadUrl, file.size).catch(() => null);
      if (checked?.done) return { id: checked.id };
      if (checked && !checked.done && checked.bytesReceived > start) {
        start = checked.bytesReceived;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Upload failed after retries');
}
