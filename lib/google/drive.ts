import { googleFetch, GoogleAuthError } from './oauth';

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
  parents?: string[];
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

/**
 * Walk a folder's parent chain up to (but not including) the implicit Drive
 * root, returning ancestors ordered root-first with the folder itself last.
 * Used to render a full breadcrumb like Google Drive's own UI. Resilient to
 * permission gaps or cycles: stops and returns what it found so far.
 */
export async function getAncestors(userId: string, folderId: string): Promise<{ id: string; name: string }[]> {
  if (!folderId || folderId === 'root') return [];
  const chain: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  let current: string | null = folderId;

  while (current && current !== 'root' && !seen.has(current) && chain.length < 12) {
    seen.add(current);
    let file: DriveFile;
    try {
      file = await getFile(userId, current);
    } catch {
      break;
    }
    chain.unshift({ id: file.id, name: file.name });
    current = file.parents && file.parents.length > 0 ? file.parents[0] : null;
  }
  return chain;
}

/**
 * Accept whatever an admin pastes for the Drive root: a full folder URL
 * ("https://drive.google.com/drive/folders/<id>" or "...?id=<id>"), a bare
 * folder ID, or the literal "root". Returns the resolved folder ID.
 */
export function extractFolderId(raw: string): string {
  const value = raw.trim();
  if (!value || value.toLowerCase() === 'root') return 'root';

  const folderUrlMatch = value.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderUrlMatch) return folderUrlMatch[1];

  const idParamMatch = value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch) return idParamMatch[1];

  // Strip any trailing URL bits from a bare ID pasted with query params.
  return value.split(/[?#]/)[0];
}

/**
 * Resolve a pasted Drive root value to a folder ID and, when possible,
 * verify it exists and is actually a folder — using the given user's own
 * Drive access as the check. If that user has no Google connection the
 * value is accepted unverified (the field is still sanitised).
 */
export async function resolveDriveRootId(userId: string, raw: string): Promise<string> {
  const id = extractFolderId(raw);
  if (id === 'root') return 'root';

  let file: DriveFile;
  try {
    file = await getFile(userId, id);
  } catch (error) {
    if (error instanceof GoogleAuthError) return id; // can't verify; accept as-is
    if (error instanceof Error && error.message.startsWith('Google API 404')) {
      throw new Error('Could not find that folder in Drive. Paste the folder link or its ID.');
    }
    throw error;
  }
  if (!file.isFolder) throw new Error(`"${file.name}" is a file, not a folder. Paste a folder link instead.`);
  return id;
}
