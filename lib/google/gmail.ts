import { googleFetch } from './oauth';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  messageIdHeader: string;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  bodyText: string;
  attachments: GmailAttachment[];
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailRawMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectBodies(part: GmailPart | undefined, out: { text: string[]; html: string[] }) {
  if (!part) return;
  if (part.body?.data) {
    if (part.mimeType === 'text/plain') out.text.push(decodeBase64Url(part.body.data));
    else if (part.mimeType === 'text/html') out.html.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

/** Attachment parts have a non-empty filename and reference their bytes by attachmentId. */
function collectAttachments(part: GmailPart | undefined, out: GmailAttachment[]) {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out);
}

/** Build a Gmail search query for summary emails. Gmail search is case-insensitive. */
export function buildSummaryQuery(keywords: string[], lookbackDays: number): string {
  const subject = keywords.map((k) => `subject:"${k.replace(/"/g, '')}"`).join(' OR ');
  return `(${subject}) newer_than:${lookbackDays}d -in:spam -in:trash`;
}

export async function listMessageIds(userId: string, query: string, max = 200): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      userId,
      `${GMAIL_BASE}/messages?${params}`
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

export async function getMessage(userId: string, messageId: string): Promise<GmailMessage> {
  const raw = await googleFetch<GmailRawMessage>(userId, `${GMAIL_BASE}/messages/${messageId}?format=full`);
  const headers = raw.payload?.headers ?? [];
  const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const bodies = { text: [] as string[], html: [] as string[] };
  collectBodies(raw.payload, bodies);
  const bodyText = bodies.text.length > 0 ? bodies.text.join('\n').trim() : htmlToText(bodies.html.join('\n'));

  const attachments: GmailAttachment[] = [];
  collectAttachments(raw.payload, attachments);

  return {
    id: raw.id,
    threadId: raw.threadId,
    messageIdHeader: header('Message-ID') || header('Message-Id') || `gmail-${raw.id}`,
    subject: header('Subject'),
    from: header('From'),
    to: header('To'),
    date: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : null,
    bodyText,
    attachments,
  };
}

/** Download one attachment's raw bytes, using the mailbox that received the email. */
export async function getAttachmentData(userId: string, messageId: string, attachmentId: string): Promise<Buffer> {
  const res = await googleFetch<{ data: string; size: number }>(
    userId,
    `${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`
  );
  return Buffer.from(res.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export async function sendEmail(userId: string, email: OutgoingEmail): Promise<{ id: string }> {
  const lines = [
    `To: ${email.to.join(', ')}`,
    ...(email.cc && email.cc.length > 0 ? [`Cc: ${email.cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(email.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(email.text, 'utf8').toString('base64'),
  ];
  const raw = Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return googleFetch<{ id: string }>(userId, `${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}
