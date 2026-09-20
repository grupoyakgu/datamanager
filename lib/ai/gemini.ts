const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function isAiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function requireApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  return key;
}

export const CHAT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001';
/** Matches the existing pgvector column; gemini-embedding-001 needs manual re-normalization below its native 3072 dims. */
export const EMBEDDING_DIMENSIONS = 1536;

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

async function generateContent(system: string, userText: string, temperature = 0): Promise<string> {
  const apiKey = requireApiKey();
  const response = await fetch(`${API_BASE}/models/${CHAT_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const data = (await response.json()) as GeminiGenerateResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${data.promptFeedback.blockReason}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  return text && text.trim() ? text : '{}';
}

/** Ask Gemini for a JSON object matching the schema described in `system`. */
export async function generateJson(system: string, userText: string): Promise<Record<string, unknown>> {
  const text = await generateContent(system, userText);
  return JSON.parse(text) as Record<string, unknown>;
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
}

/** gemini-embedding-001 only returns a unit vector at its native 3072 dims; renormalize after truncation. */
function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? vector.map((v) => v / norm) : vector;
}

export async function embedWithGemini(text: string): Promise<number[] | null> {
  const apiKey = requireApiKey();
  const response = await fetch(`${API_BASE}/models/${EMBEDDING_MODEL}:embedContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const data = (await response.json()) as GeminiEmbedResponse;
  const values = data.embedding?.values;
  return values && values.length > 0 ? l2Normalize(values) : null;
}
