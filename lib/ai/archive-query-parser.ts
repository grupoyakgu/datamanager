import { generateJson, isAiConfigured } from './gemini';

export interface ParsedArchiveQuery {
  tags: string[];
  senderQuery: string | null;
  textQuery: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Turn a free-text question about archived files/emails into structured search filters. */
export async function parseArchiveQuery(question: string, tagNames: string[], now = new Date()): Promise<ParsedArchiveQuery> {
  const fallback: ParsedArchiveQuery = {
    tags: tagNames.filter((t) => question.toLowerCase().includes(t.toLowerCase())),
    senderQuery: null,
    textQuery: question,
    dateFrom: null,
    dateTo: null,
  };
  if (!isAiConfigured()) return fallback;

  const system = `You convert a user's question about an archive of emails and their file attachments into search filters.
Today is ${now.toISOString().slice(0, 10)}.
Return ONLY a JSON object with these keys:
- tags: array of tag names from this list that the question refers to: ${tagNames.join(', ') || '(none)'}.
- sender_query: a person's name, or part of an email address, the question says the file/email came from, was sent by, or forwarded by — or null if none is mentioned.
- text_query: remaining free-text keywords to match against the email's subject or body (e.g. a project code, a topic), or null if there's nothing beyond the tags/sender.
- date_from / date_to: explicit "YYYY-MM-DD" bounds if the question names specific dates or a relative period ("last week", "this month"), else null for both.
The question may be in Hebrew, Spanish or English. Never invent a tag name that isn't in the list above.`;

  try {
    const raw = await generateJson(system, question);
    const tags = Array.isArray(raw.tags)
      ? (raw.tags as unknown[])
          .map((t) => tagNames.find((n) => typeof t === 'string' && n.toLowerCase() === t.toLowerCase()))
          .filter((t): t is string => !!t)
      : [];
    const validDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

    return {
      tags: Array.from(new Set([...tags, ...fallback.tags])),
      senderQuery: typeof raw.sender_query === 'string' && raw.sender_query.trim() ? raw.sender_query.trim() : null,
      textQuery: typeof raw.text_query === 'string' && raw.text_query.trim() ? raw.text_query.trim() : null,
      dateFrom: validDate(raw.date_from),
      dateTo: validDate(raw.date_to),
    };
  } catch (error) {
    console.error('Archive query parsing failed, using fallback:', error);
    return fallback;
  }
}
