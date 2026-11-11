import { CHAT_MODEL, generateJson, isAiConfigured } from './gemini';

export interface ArchiveAiMetadataResult {
  documentType: string | null;
  topic: string | null;
  people: string[];
  companies: string[];
  documentDate: string | null;
  keywords: string[];
  model: string;
  aiError: string | null;
  raw: Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
}

const EMPTY_RESULT: Omit<ArchiveAiMetadataResult, 'model' | 'aiError'> = {
  documentType: null,
  topic: null,
  people: [],
  companies: [],
  documentDate: null,
  keywords: [],
  raw: {},
};

/**
 * Best-effort, text-based metadata enrichment for an archived item: subject,
 * body, sender and attachment filenames only — NOT the attachment file
 * contents themselves (no OCR/document parsing here; that's a separate,
 * much larger undertaking deferred for now). Stored separately from the
 * sender's own manually-declared tags (archive_item_tags) so users can tell
 * the two apart and edit either independently.
 */
export async function extractArchiveMetadata(input: {
  subject: string;
  bodyText: string;
  senderEmail: string | null;
  senderName: string | null;
  filenames: string[];
}): Promise<ArchiveAiMetadataResult> {
  if (!isAiConfigured()) {
    return { ...EMPTY_RESULT, model: 'none', aiError: null };
  }

  const system = `You analyze a business email, and the names of its file attachments, to produce searchable metadata for a document archive. The email may be in English, Spanish or Hebrew. Return ONLY a JSON object with keys:
- document_type: a short label such as "plans", "contract", "invoice", "technical report", "correspondence", or null if unclear.
- topic: a short phrase for what the email/attachments are about, or null.
- people: array of person names mentioned (besides the sender), may be empty.
- companies: array of company/organization names mentioned, may be empty.
- document_date: a date (YYYY-MM-DD) the documents or email relate to, if one is evident, else null.
- keywords: array of up to 8 short, lowercase keywords useful for search (don't repeat people/companies), may be empty.`;
  const userText = [
    `Subject: ${input.subject}`,
    `From: ${input.senderName ?? ''} <${input.senderEmail ?? ''}>`,
    `Attachments: ${input.filenames.join(', ') || 'none'}`,
    '',
    'Body:',
    input.bodyText.slice(0, 6000),
  ].join('\n');

  try {
    const raw = await generateJson(system, userText);
    return {
      documentType: typeof raw.document_type === 'string' ? raw.document_type : null,
      topic: typeof raw.topic === 'string' ? raw.topic : null,
      people: stringArray(raw.people),
      companies: stringArray(raw.companies),
      documentDate: typeof raw.document_date === 'string' ? raw.document_date : null,
      keywords: stringArray(raw.keywords),
      model: CHAT_MODEL,
      aiError: null,
      raw,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Archive AI metadata extraction failed:', error);
    return { ...EMPTY_RESULT, model: 'heuristic', aiError: message.slice(0, 500) };
  }
}
