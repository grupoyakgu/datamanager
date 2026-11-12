import { generateJson, isAiConfigured } from './gemini';

/**
 * Given a free-text search term and the archive's existing tag names,
 * asks Gemini which of those tags are related in meaning to the term —
 * synonyms, translations (the archive is English/Spanish/Hebrew), or
 * closely associated concepts (e.g. "money" relates to "Payments", "lease"
 * relates to "Arras" or "Contracts") — not just a substring match, which
 * the caller already handles separately. Returns tag names copied exactly
 * from `tagNames`; never invents one not already in the archive.
 */
export async function findSimilarTags(query: string, tagNames: string[]): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed || tagNames.length === 0 || !isAiConfigured()) return [];

  const system = `You help search a document archive's existing tags. Given a search term and a list of tag names already in use, return the tags that are related in meaning to the search term — synonyms, translations, or closely associated concepts — even when the wording doesn't match directly.
Tag list: ${tagNames.join(', ')}
Return ONLY a JSON object: {"tags": [...]} containing names copied EXACTLY from that list. Never invent a tag that isn't in the list. Return an empty array if nothing is clearly related.`;

  try {
    const raw = await generateJson(system, trimmed);
    const matched = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [];
    const allowed = new Set(tagNames);
    return matched.filter((t) => allowed.has(t));
  } catch (error) {
    console.error('Tag similarity search failed:', error);
    return [];
  }
}
