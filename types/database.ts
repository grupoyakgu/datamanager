export type UserRole = 'admin' | 'user';
export type Language = 'en' | 'es';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  gmail_connected: boolean;
  last_gmail_sync: string | null;
  language: Language;
  theme: ThemePreference;
  status: 'active' | 'suspended';
  gmail_status: 'disconnected' | 'connected' | 'authorization_required';
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

export interface FolderRule {
  id: string;
  tag_id: string;
  folder_id: string;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  content: string;
  original_email_id: string;
  gmail_message_id: string | null;
  email_from: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  meeting_date: string | null;
  meeting_time: string | null;
  folder_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  source: 'gmail' | 'manual';
  completeness_score: number;
  missing_data: string[];
  language: string | null;
  processing_status: 'pending' | 'processed' | 'failed';
  processing_error: string | null;
}

export interface ExtractedData {
  id: string;
  summary_id: string;
  participants: string[];
  companies: string[];
  topics: string[];
  action_items: string[];
  decisions: string[];
  detected_tags: string[];
  meeting_time: string | null;
  model: string | null;
  extracted_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  changes: Record<string, unknown> | null;
  created_at: string;
}

/** Summary shape returned by the API for lists and detail pages. */
export interface SummaryView {
  id: string;
  title: string;
  content: string;
  meeting_date: string | null;
  meeting_time: string | null;
  source: 'gmail' | 'manual';
  completeness_score: number;
  missing_data: string[];
  language: string | null;
  processing_status: 'pending' | 'processed' | 'failed';
  processing_error: string | null;
  drive_doc_url: string | null;
  drive_sync_error: string | null;
  needs_folder_review: boolean;
  attachments: { id: string; filename: string; driveUrl: string | null }[];
  created_at: string;
  updated_at: string;
  email_from: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  participants: string[];
  companies: string[];
  topics: string[];
  action_items: string[];
  decisions: string[];
  created_by: { id: string; name: string | null; email: string } | null;
  is_favorite: boolean;
  similarity?: number;
}
