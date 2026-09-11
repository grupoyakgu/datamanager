import { CHAT_MODEL, getOpenAI, isAiConfigured } from './openai';

export interface TagDefinition {
  id: string;
  name: string;
  aliases: string[];
}

export interface ExtractionResult {
  meetingDate: string | null;
  meetingTime: string | null;
  participants: string[];
  companies: string[];
  topics: string[];
  actionItems: string[];
  decisions: string[];
  tags: string[];
  language: string | null;
  model: string;
  raw: Record<string, unknown>;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Deterministic tag detection: a tag or alias appearing in the text. */
export function detectTagsByKeyword(text: string, tags: TagDefinition[]): string[] {
  const haystack = normalize(text);
  const found: string[] = [];
  for (const tag of tags) {
    const candidates = [tag.name, ...tag.aliases].map(normalize).filter(Boolean);
    if (candidates.some((c) => haystack.includes(c))) found.push(tag.name);
  }
  return found;
}

const MONTH_NAMES: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Best-effort date extraction from free text, used both as the no-AI
 * fallback and to fill in when the model doesn't find a date. Tries, in
 * order: ISO, numeric DD/MM/YYYY or DD.MM.YYYY, "10 de septiembre de 2026"
 * (Spanish), "September 10, 2026" and "10 September 2026" (English/mixed).
 */
export function detectDate(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    if (isValidDate(+y, +m, +d)) return `${y}-${m}-${d}`;
  }

  const dmy = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (dmy) {
    const [, d, m, y] = dmy;
    if (isValidDate(+y, +m, +d)) return `${y}-${pad(+m)}-${pad(+d)}`;
  }

  const dayMonthYear = text.match(/\b(\d{1,2})\s+(?:de\s+|de\s*)?([a-zA-Zá-úñ]+)\s+(?:de\s+|del\s+)?(\d{4})\b/i);
  if (dayMonthYear) {
    const [, d, monthName, y] = dayMonthYear;
    const month = MONTH_NAMES[monthName.toLowerCase()];
    if (month && isValidDate(+y, month, +d)) return `${y}-${pad(month)}-${pad(+d)}`;
  }

  const monthDayYear = text.match(/\b([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthDayYear) {
    const [, monthName, d, y] = monthDayYear;
    const month = MONTH_NAMES[monthName.toLowerCase()];
    if (month && isValidDate(+y, month, +d)) return `${y}-${pad(month)}-${pad(+d)}`;
  }

  return null;
}

/** Try the subject first (often the most deliberate date signal), then the body. */
export function detectDateFromEmail(subject: string, body: string): string | null {
  return detectDate(subject) ?? detectDate(body);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
    .filter((v, i, arr) => arr.findIndex((o) => o.toLowerCase() === v.toLowerCase()) === i);
}

function asDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export async function extractFromSummary(params: {
  title: string;
  content: string;
  emailDate: string | null;
  tags: TagDefinition[];
  fields: string[];
}): Promise<ExtractionResult> {
  const { title, content, emailDate, tags, fields } = params;
  const keywordTags = detectTagsByKeyword(`${title}\n${content}`, tags);

  if (!isAiConfigured()) {
    return {
      meetingDate: detectDateFromEmail(title, content),
      meetingTime: null,
      participants: [],
      companies: [],
      topics: [],
      actionItems: [],
      decisions: [],
      tags: keywordTags,
      language: null,
      model: 'heuristic',
      raw: {},
    };
  }

  const tagDictionary = tags
    .map((t) => (t.aliases.length > 0 ? `${t.name} (aliases: ${t.aliases.join(', ')})` : t.name))
    .join('\n');

  const system = `You extract structured information from meeting summaries written in Hebrew, Spanish or English.
Return ONLY a JSON object with these keys:
- meeting_date: "YYYY-MM-DD" or null. Use the date the meeting took place, not the email date, unless the text clearly refers to the email date. Email received date for reference: ${emailDate ?? 'unknown'}.
- meeting_time: "HH:MM" (24h) or null.
- participants: array of people who attended (full names as written).
- companies: array of companies, projects or organisations mentioned.
- topics: array of short topic labels (3-8 words each).
- action_items: array of tasks agreed, one sentence each.
- decisions: array of decisions taken, one sentence each.
- tags: array of tag names chosen ONLY from this dictionary, when the tag is mentioned or the content clearly relates to it:
${tagDictionary || '(empty)'}
- language: ISO 639-1 code of the summary text (he, es, en, ...).
Requested fields: ${fields.join(', ')}. Return empty arrays or null for fields you cannot determine. Do not invent information.`;

  const response = await getOpenAI().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Title: ${title}\n\nSummary:\n${content.slice(0, 30_000)}` },
    ],
  });

  const raw = JSON.parse(response.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
  const allowedTagNames = new Set(tags.map((t) => t.name.toLowerCase()));
  const aiTags = asStringArray(raw.tags)
    .map((name) => tags.find((t) => t.name.toLowerCase() === name.toLowerCase())?.name)
    .filter((name): name is string => !!name && allowedTagNames.has(name.toLowerCase()));

  const mergedTags = Array.from(new Set([...keywordTags, ...aiTags]));

  return {
    meetingDate: asDate(raw.meeting_date) ?? detectDateFromEmail(title, content),
    meetingTime: asTime(raw.meeting_time),
    participants: asStringArray(raw.participants),
    companies: asStringArray(raw.companies),
    topics: asStringArray(raw.topics),
    actionItems: asStringArray(raw.action_items),
    decisions: asStringArray(raw.decisions),
    tags: mergedTags,
    language: typeof raw.language === 'string' ? raw.language.slice(0, 5) : null,
    model: CHAT_MODEL,
    raw,
  };
}
