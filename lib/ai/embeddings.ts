import { embedWithGemini, isAiConfigured } from './gemini';

const MAX_CHARS = 24_000;

export async function embedText(text: string): Promise<number[] | null> {
  if (!isAiConfigured()) return null;
  return embedWithGemini(text.slice(0, MAX_CHARS));
}
