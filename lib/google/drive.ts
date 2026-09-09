import { googleFetch } from './oauth';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,size,webViewLink,iconLink,owners(displayName,emailAddress),parents';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  owners?: { displayName: string; emailAddress: string }[];
  isFolder: boolean;
}

interface DriveListResponse {
  files: Omit<DriveFile, 'isFolder'>[];
  nextPageToken?: string;
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function listFolder(userId: string, folderId: string, pageToken?: string) {
  const params = new URLSearchParams({
    q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
    fields: `nextPageToken,files(${FILE_FIELDS})`,
    orderBy: 'folder,name',
    pageSize: '100',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const data = await googleFetch<DriveListResponse>(userId, `${DRIVE_BASE}/files?${params}`);
  return {
    files: data.files.map((f) => ({ ...f, isFolder: f.mimeType === FOLDER_MIME })),
    nextPageToken: data.nextPageToken,
  };
}

export async function searchFiles(userId: string, query: string) {
  const escaped = query.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `name contains '${escaped}' and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize: '50',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const data = await googleFetch<DriveListResponse>(userId, `${DRIVE_BASE}/files?${params}`);
  return data.files.map((f) => ({ ...f, isFolder: f.mimeType === FOLDER_MIME }));
}

export async function getFile(userId: string, fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const f = await googleFetch<Omit<DriveFile, 'isFolder'>>(userId, `${DRIVE_BASE}/files/${fileId}?${params}`);
  return { ...f, isFolder: f.mimeType === FOLDER_MIME };
}
