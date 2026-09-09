import { getSupabaseAdmin } from './supabase';

export interface CompletenessWeights {
  meeting_date: number;
  participants: number;
  topics: number;
  tags: number;
  companies: number;
  decisions_or_actions: number;
}

export interface AppSettings {
  admin_emails: string[];
  summary_keywords: string[];
  sync_lookback_days: number;
  completeness_weights: CompletenessWeights;
  extraction_fields: string[];
  drive_root_folder_id: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  admin_emails: ['koby@grupoyakgu.es'],
  summary_keywords: ['סיכום', 'summary', 'resumen'],
  sync_lookback_days: 30,
  completeness_weights: {
    meeting_date: 25,
    participants: 25,
    topics: 15,
    tags: 15,
    companies: 10,
    decisions_or_actions: 10,
  },
  extraction_fields: [
    'meeting_date',
    'meeting_time',
    'participants',
    'companies',
    'topics',
    'action_items',
    'decisions',
    'tags',
  ],
  drive_root_folder_id: 'root',
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];

export async function getSettings(): Promise<AppSettings> {
  const { data } = await getSupabaseAdmin().from('app_settings').select('key, value');
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    if (SETTING_KEYS.includes(row.key as keyof AppSettings)) {
      (settings as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return settings;
}

export async function updateSettings(patch: Partial<AppSettings>) {
  const rows = Object.entries(patch)
    .filter(([key]) => SETTING_KEYS.includes(key as keyof AppSettings))
    .map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
  if (rows.length === 0) return;
  const { error } = await getSupabaseAdmin().from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
