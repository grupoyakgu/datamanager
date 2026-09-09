import type { CompletenessWeights } from './settings';

export interface CompletenessInput {
  meetingDate: string | null;
  participants: string[];
  topics: string[];
  tags: string[];
  companies: string[];
  decisions: string[];
  actionItems: string[];
}

export interface CompletenessResult {
  score: number;
  missing: string[];
}

/**
 * Deterministic completeness score: each configured field contributes its
 * weight when present. Participants earn half credit when only one is found.
 */
export function computeCompleteness(
  input: CompletenessInput,
  weights: CompletenessWeights
): CompletenessResult {
  const missing: string[] = [];
  let earned = 0;
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0) || 1;

  if (input.meetingDate) earned += weights.meeting_date;
  else missing.push('meeting_date');

  if (input.participants.length >= 2) earned += weights.participants;
  else if (input.participants.length === 1) {
    earned += weights.participants / 2;
    missing.push('participants_partial');
  } else missing.push('participants');

  if (input.topics.length > 0) earned += weights.topics;
  else missing.push('topics');

  if (input.tags.length > 0) earned += weights.tags;
  else missing.push('tags');

  if (input.companies.length > 0) earned += weights.companies;
  else missing.push('companies');

  if (input.decisions.length > 0 || input.actionItems.length > 0) earned += weights.decisions_or_actions;
  else missing.push('decisions_or_actions');

  return { score: Math.round((earned / total) * 100), missing };
}

export function completenessLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 90) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}
