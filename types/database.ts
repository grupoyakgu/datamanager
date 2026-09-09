export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'user';
  created_at: string;
  updated_at: string;
  gmail_connected: boolean;
  last_gmail_sync: string | null;
}

export interface Folder {
  id: string;
  name: string;
  description: string | null;
  order: number;
  created_at: string;
  updated_at: string;
  is_default: boolean;
}

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  content: string;
  original_email_id: string;
  meeting_date: string | null;
  meeting_time: string | null;
  folder_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  source: 'gmail' | 'manual';
  completeness_score: number;
  missing_data: string[];
}

export interface MeetingSummaryTag {
  id: string;
  summary_id: string;
  tag_id: string;
  created_at: string;
}

export interface ExtractedData {
  id: string;
  summary_id: string;
  participants: string[];
  companies: string[];
  topics: string[];
  action_items: string[];
  decisions: string[];
  extracted_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: Record<string, unknown>;
  created_at: string;
}
