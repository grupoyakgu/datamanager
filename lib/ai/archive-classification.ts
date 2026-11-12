import { generateJson, isAiConfigured } from './gemini';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Asks Gemini which of the admin-configured categories (see
 * archive_classification_categories) apply to one archived item, from its
 * subject/body/sender/attachment filenames only — the same text-based
 * scope as extractArchiveMetadata, no attachment content parsing. Returns
 * the matching category names exactly as given in `categories` (never an
 * invented one), so a caller can apply them as ordinary tags alongside
 * whatever the sender/uploader already declared. An item can match zero,
 * one, or several categories.
 */
export async function classifyArchiveItem(
  categories: string[],
  input: { subject: string; bodyText: string; senderEmail: string | null; senderName: string | null; filenames: string[] }
): Promise<string[]> {
  if (categories.length === 0 || !isAiConfigured()) return [];

  const system = `You classify a business email (and the names of its file attachments) from a real-estate/architecture firm's document archive. The email may be in English, Spanish or Hebrew.
Decide which of these categories apply — zero, one, or several can apply at once:
${categories.map((c) => `- ${c}`).join('\n')}
Return ONLY a JSON object with one key, "categories": an array containing ONLY names copied EXACTLY from that list that genuinely apply to this email. Never invent a category that isn't in the list. Return an empty array if none clearly apply.`;
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
    const matched = stringArray(raw.categories);
    const allowed = new Set(categories);
    return matched.filter((c) => allowed.has(c));
  } catch (error) {
    console.error('Archive AI classification failed:', error);
    return [];
  }
}
