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

/** Find a folder named `name` directly under `parentId`, creating it if missing. */
export async function ensureFolder(userId: string, parentId: string, name: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name)',
    pageSize: '1',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const existing = await googleFetch<{ files: { id: string; name: string }[] }>(userId, `${DRIVE_BASE}/files?${params}`);
  if (existing.files.length > 0) return existing.files[0].id;

  const created = await googleFetch<{ id: string }>(userId, `${DRIVE_BASE}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return created.id;
}

/** Create (or reuse) a chain of nested folders, e.g. ['Data Manager', 'Summaries']. */
export async function ensureFolderPath(userId: string, rootId: string, segments: string[]): Promise<string> {
  let current = rootId;
  for (const segment of segments) {
    current = await ensureFolder(userId, current, segment);
  }
  return current;
}

/**
 * Create a new Google Doc (when `fileId` is omitted) or replace the content
 * of an existing one, from plain text. Uses a multipart upload so Drive
 * converts the text into a native Google Doc. Parents are only applied on
 * creation; an existing file's folder placement is left untouched.
 */
export async function createOrUpdateDoc(
  userId: string,
  params: { fileId?: string; name: string; parents?: string[]; text: string }
): Promise<{ id: string }> {
  const boundary = `driveDoc${Math.random().toString(36).slice(2)}`;
  const metadata: Record<string, unknown> = { name: params.name, mimeType: 'application/vnd.google-apps.document' };
  if (!params.fileId && params.parents) metadata.parents = params.parents;

  const body =
    `--${boundary}
Content-Type: application/json; charset=UTF-8

${JSON.stringify(metadata)}
` +
    `--${boundary}
Content-Type: text/plain; charset=UTF-8

${params.text}
` +
    `--${boundary}--`;

  const url = params.fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${params.fileId}?uploadType=multipart&supportsAllDrives=true&fields=id`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`;

  return googleFetch<{ id: string }>(userId, url, {
    method: params.fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

/**
 * Make a file's Drive parents match `desiredParents` exactly, adding and
 * removing only what's needed. Used to move an exported summary between tag
 * folders when its tags change, without duplicating or losing it elsewhere.
 */
export async function setDocParents(userId: string, fileId: string, desiredParents: string[]): Promise<void> {
  const current = await getFile(userId, fileId);
  const currentParents = new Set(current.parents ?? []);
  const desired = new Set(desiredParents);
  const toAdd = [...desired].filter((id) => !currentParents.has(id));
  const toRemove = [...currentParents].filter((id) => !desired.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return;

  const params = new URLSearchParams({ supportsAllDrives: 'true' });
  if (toAdd.length > 0) params.set('addParents', toAdd.join(','));
  if (toRemove.length > 0) params.set('removeParents', toRemove.join(','));

  await googleFetch(userId, `${DRIVE_BASE}/files/${fileId}?${params}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

/** Grant read access to everyone on `domain` for a file/folder, unless already present. */
export async function ensureDomainReaderAccess(userId: string, fileId: string, domain: string): Promise<void> {
  try {
    const existing = await googleFetch<{ permissions: { type: string; domain?: string }[] }>(
      userId,
      `${DRIVE_BASE}/files/${fileId}/permissions?fields=permissions(type,domain)&supportsAllDrives=true`
    );
    if (existing.permissions?.some((p) => p.type === 'domain' && p.domain === domain)) return;
  } catch (error) {
    console.error('Could not read permissions for', fileId, error);
  }
  try {
    await googleFetch(userId, `${DRIVE_BASE}/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'domain', domain, role: 'reader' }),
    });
  } catch (error) {
    console.error('Failed to grant domain access on', fileId, error);
  }
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
