import { generateJson, isAiConfigured } from '../ai/gemini';

export interface ParsedForward {
  isForward: boolean;
  /** Text the forwarder typed themselves, before the quoted original message. */
  forwarderNote: string | null;
  originalSenderName: string | null;
  originalSenderEmail: string | null;
  originalSubject: string | null;
}

const NOT_A_FORWARD: ParsedForward = {
  isForward: false,
  forwarderNote: null,
  originalSenderName: null,
  originalSenderEmail: null,
  originalSubject: null,
};

/** Parse "Name <email@x.com>", a bare email, or a bare display name. */
export function parseAddress(raw: string): { name: string | null; email: string | null } {
  const trimmed = raw.trim().replace(/^"|"$/g, '');
  const angleMatch = trimmed.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^"|"$/g, '');
    return { name: name || null, email: angleMatch[2].trim().toLowerCase() };
  }
  if (/^[^<>\s]+@[^<>\s]+$/.test(trimmed)) return { name: null, email: trimmed.toLowerCase() };
  return { name: trimmed || null, email: null };
}

// Gmail's own forward marker, localized (English, Spanish, Hebrew).
const FORWARD_MARKER = /^-{2,}\s*(forwarded message|mensaje reenviado|הודעה שהועברה)\s*-{2,}\s*$/im;
const FROM_LINE = /^\s*(?:from|de|מאת)\s*:\s*(.+)$/im;
const SUBJECT_LINE = /^\s*(?:subject|asunto|נושא)\s*:\s*(.+)$/im;

/** Deterministic parse of Gmail's default forward format, no AI required. */
export function parseForwardHeuristic(bodyText: string): ParsedForward {
  const marker = bodyText.match(FORWARD_MARKER);
  if (!marker || marker.index === undefined) return NOT_A_FORWARD;

  const before = bodyText.slice(0, marker.index).trim();
  const headerBlock = bodyText.slice(marker.index + marker[0].length, marker.index + marker[0].length + 1000);
  const fromMatch = headerBlock.match(FROM_LINE);
  const subjectMatch = headerBlock.match(SUBJECT_LINE);
  const address = fromMatch ? parseAddress(fromMatch[1]) : { name: null, email: null };

  return {
    isForward: true,
    forwarderNote: before || null,
    originalSenderName: address.name,
    originalSenderEmail: address.email,
    originalSubject: subjectMatch ? subjectMatch[1].trim() : null,
  };
}

/**
 * Identify whether an email body is a forward and, if so, who originally
 * sent it — heuristic first (fast, free, covers Gmail's own forward format
 * in en/es/he), falling back to Gemini only when the heuristic can't find a
 * sender, to also handle other mail clients' forward formats.
 */
export async function parseForward(bodyText: string): Promise<ParsedForward> {
  const heuristic = parseForwardHeuristic(bodyText);
  if (heuristic.isForward && heuristic.originalSenderEmail) return heuristic;
  if (!isAiConfigured()) return heuristic;

  const system = `You read an email body (English, Spanish or Hebrew) that may contain a forwarded/quoted original message and identify who originally sent it.
Return ONLY a JSON object with keys:
- is_forward: true if the body contains a forwarded or quoted original message (look for markers like "Forwarded message", "Mensaje reenviado", "הודעה שהועברה", or a quoted "From:"/"De:"/"מאת:" header block near the top), else false.
- forwarder_note: the text the person forwarding it typed themselves, before the quoted original message, or null if there is none.
- original_sender_name: the original sender's display name from the quoted message header, or null.
- original_sender_email: the original sender's email address from the quoted message header, or null.
- original_subject: the original message's subject line if shown, or null.
If is_forward is false, return null for the other four fields.`;

  try {
    const raw = await generateJson(system, bodyText.slice(0, 6000));
    if (raw.is_forward !== true) return heuristic;
    return {
      isForward: true,
      forwarderNote: typeof raw.forwarder_note === 'string' && raw.forwarder_note.trim() ? raw.forwarder_note.trim() : heuristic.forwarderNote,
      originalSenderName:
        typeof raw.original_sender_name === 'string' && raw.original_sender_name.trim()
          ? raw.original_sender_name.trim()
          : heuristic.originalSenderName,
      originalSenderEmail:
        typeof raw.original_sender_email === 'string' && raw.original_sender_email.trim()
          ? raw.original_sender_email.trim().toLowerCase()
          : heuristic.originalSenderEmail,
      originalSubject:
        typeof raw.original_subject === 'string' && raw.original_subject.trim() ? raw.original_subject.trim() : heuristic.originalSubject,
    };
  } catch (error) {
    console.error('AI forward parsing failed, using heuristic:', error);
    return heuristic;
  }
}
