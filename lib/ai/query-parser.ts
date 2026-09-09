import { CHAT_MODEL, getOpenAI, isAiConfigured } from './openai';

export interface ParsedQuery {
  semanticQuery: string;
  dateFrom: string | null;
  dateTo: string | null;
  participant: string | null;
  tags: string[];
  folder: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve relative periods without AI so basic phrases work offline. */
export function resolvePeriod(period: string | null, now = new Date()): { from: string | null; to: string | null } {
  if (!period) return { from: null, to: null };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = 86_400_000;
  switch (period) {
    case 'today':
      return { from: isoDate(today), to: isoDate(today) };
    case 'yesterday':
      return { from: isoDate(new Date(today.getTime() - day)), to: isoDate(new Date(today.getTime() - day)) };
    case 'this_week': {
      const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
      return { from: isoDate(new Date(today.getTime() - dow * day)), to: isoDate(today) };
    }
    case 'last_7_days':
      return { from: isoDate(new Date(today.getTime() - 7 * day)), to: isoDate(today) };
    case 'this_month':
      return { from: isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: isoDate(today) };
    case 'last_month': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: isoDate(first), to: isoDate(last) };
    }
    case 'last_30_days':
      return { from: isoDate(new Date(today.getTime() - 30 * day)), to: isoDate(today) };
    default:
      return { from: null, to: null };
  }
}

export async function parseNaturalQuery(
  question: string,
  context: { tagNames: string[]; folderNames: string[]; now?: Date }
): Promise<ParsedQuery> {
  const fallback: ParsedQuery = {
    semanticQuery: question,
    dateFrom: null,
    dateTo: null,
    participant: null,
    tags: context.tagNames.filter((t) => question.toLowerCase().includes(t.toLowerCase())),
    folder: null,
  };
  if (!isAiConfigured()) return fallback;

  const now = context.now ?? new Date();
  const system = `You convert a user's question about company meeting summaries into search filters.
Today is ${now.toISOString().slice(0, 10)}.
Return ONLY JSON with keys:
- semantic_query: the core topic to search for, in the language of the question (string, never empty).
- period: one of "today", "yesterday", "this_week", "last_7_days", "this_month", "last_month", "last_30_days" or null.
- date_from / date_to: explicit "YYYY-MM-DD" range when the question names specific dates or months (e.g. "August" => the most recent August); null otherwise.
- participant: a person's name mentioned as a meeting participant, or null.
- tags: array of tag names from this list that the question refers to: ${context.tagNames.join(', ') || '(none)'}.
- folder: one folder name from this list if explicitly referenced, else null: ${context.folderNames.join(', ') || '(none)'}.
The question may be in Hebrew, Spanish or English.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question },
      ],
    });
    const raw = JSON.parse(response.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
    const period = resolvePeriod(typeof raw.period === 'string' ? raw.period : null, now);
    const validDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const tags = Array.isArray(raw.tags)
      ? (raw.tags as unknown[])
          .map((t) => context.tagNames.find((n) => typeof t === 'string' && n.toLowerCase() === t.toLowerCase()))
          .filter((t): t is string => !!t)
      : [];

    return {
      semanticQuery: typeof raw.semantic_query === 'string' && raw.semantic_query.trim() ? raw.semantic_query : question,
      dateFrom: validDate(raw.date_from) ?? period.from,
      dateTo: validDate(raw.date_to) ?? period.to,
      participant: typeof raw.participant === 'string' && raw.participant.trim() ? raw.participant.trim() : null,
      tags: Array.from(new Set([...tags, ...fallback.tags])),
      folder:
        typeof raw.folder === 'string'
          ? context.folderNames.find((f) => f.toLowerCase() === (raw.folder as string).toLowerCase()) ?? null
          : null,
    };
  } catch (error) {
    console.error('Natural query parsing failed, using fallback:', error);
    return fallback;
  }
}
