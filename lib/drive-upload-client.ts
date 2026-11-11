import { api } from './api-client';

/**
 * Upload one file straight to Google Drive from the browser: our server
 * only issues a short-lived resumable upload session (see
 * /api/drive/files/upload-session) — the actual bytes go directly to
 * Google from here, with no proxy through our own serverless function, so
 * there's no risk of hitting its request-body size limit, and the browser
 * gets real upload-progress events (which a plain `fetch` can't give).
 */
export function uploadFileToFolder(folderId: string, file: File, onProgress: (pct: number) => void): Promise<{ id: string }> {
  return api
    .post<{ uploadUrl: string }>('/api/drive/files/upload-session', {
      folderId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
    })
    .then(
      ({ uploadUrl }) =>
        new Promise<{ id: string }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl, true);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText) as { id: string });
              } catch {
                reject(new Error('Unexpected response from Google Drive'));
              }
            } else {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(file);
        })
    );
}
