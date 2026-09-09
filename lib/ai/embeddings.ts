import { EMBEDDING_MODEL, getOpenAI, isAiConfigured } from './openai';

const MAX_CHARS = 24_000;

export async function embedText(text: string): Promise<number[] | null> {
  if (!isAiConfigured()) return null;
  const input = text.slice(0, MAX_CHARS);
  const response = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input });
  return response.data[0]?.embedding ?? null;
}
