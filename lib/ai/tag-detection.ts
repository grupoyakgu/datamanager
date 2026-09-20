import { generateJson, isAiConfigured } from './gemini';
import { detectTagsByKeyword, type TagDefinition } from './extraction';

/**
 * Choose which of the application's existing tags apply to a piece of text.
 * Always starts with a deterministic keyword/alias match against the tags
 * already defined in the app; when Gemini is configured, it also asks the
 * model to pick from that same fixed list (never inventing new tags) and
 * merges the two. Falls back to the keyword-only result on any AI failure.
 */
export async function detectContentTags(text: string, tags: TagDefinition[]): Promise<string[]> {
  const keywordTags = detectTagsByKeyword(text, tags);
  if (!isAiConfigured() || tags.length === 0) return keywordTags;

  const tagDictionary = tags.map((t) => (t.aliases.length > 0 ? `${t.name} (aliases: ${t.aliases.join(', ')})` : t.name)).join('\n');
  const system = `You choose which of these existing tags apply to a piece of text (an archived email, in Hebrew, Spanish or English). Only choose a tag when it is clearly mentioned or the content clearly relates to it — never invent a tag that isn't in this list.
Tags:
${tagDictionary || '(empty)'}
Return ONLY a JSON object: { "tags": ["Tag Name", ...] } using tag names exactly as given above. Return an empty array if none clearly apply.`;

  try {
    const raw = await generateJson(system, text.slice(0, 20_000));
    const allowed = new Set(tags.map((t) => t.name.toLowerCase()));
    const aiTags = Array.isArray(raw.tags)
      ? (raw.tags as unknown[])
          .map((t) => (typeof t === 'string' ? tags.find((tag) => tag.name.toLowerCase() === t.toLowerCase())?.name : undefined))
          .filter((name): name is string => !!name && allowed.has(name.toLowerCase()))
      : [];
    return Array.from(new Set([...keywordTags, ...aiTags]));
  } catch (error) {
    console.error('AI tag detection failed, using keyword match only:', error);
    return keywordTags;
  }
}
