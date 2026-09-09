-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  gmail_connected BOOLEAN DEFAULT FALSE,
  last_gmail_sync TIMESTAMP,
  CONSTRAINT email_not_empty CHECK (email != '')
);

-- Folders table
CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_default BOOLEAN DEFAULT FALSE,
  CONSTRAINT name_not_empty CHECK (name != '')
);

-- Tags table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT name_not_empty CHECK (name != '')
);

-- Meeting Summaries table
CREATE TABLE meeting_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  original_email_id TEXT NOT NULL UNIQUE,
  meeting_date DATE,
  meeting_time TIME,
  folder_id UUID NOT NULL REFERENCES folders(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  source TEXT CHECK (source IN ('gmail', 'manual')) DEFAULT 'gmail',
  completeness_score INTEGER DEFAULT 0,
  missing_data TEXT[] DEFAULT '{}',
  CONSTRAINT title_not_empty CHECK (title != ''),
  CONSTRAINT content_not_empty CHECK (content != '')
);

-- Meeting Summary Tags (junction table)
CREATE TABLE meeting_summary_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES meeting_summaries(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(summary_id, tag_id)
);

-- Extracted Data table
CREATE TABLE extracted_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL UNIQUE REFERENCES meeting_summaries(id) ON DELETE CASCADE,
  participants TEXT[] DEFAULT '{}',
  companies TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  action_items TEXT[] DEFAULT '{}',
  decisions TEXT[] DEFAULT '{}',
  extracted_at TIMESTAMP DEFAULT NOW()
);

-- Audit Logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_meeting_summaries_folder_id ON meeting_summaries(folder_id);
CREATE INDEX idx_meeting_summaries_created_by ON meeting_summaries(created_by);
CREATE INDEX idx_meeting_summaries_meeting_date ON meeting_summaries(meeting_date);
CREATE INDEX idx_meeting_summary_tags_summary_id ON meeting_summary_tags(summary_id);
CREATE INDEX idx_meeting_summary_tags_tag_id ON meeting_summary_tags(tag_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_extracted_data_summary_id ON extracted_data(summary_id);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_summary_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Insert default folders
INSERT INTO folders (name, "order", is_default) VALUES
  ('General', 0, TRUE),
  ('Investors', 1, FALSE),
  ('Projects', 2, FALSE),
  ('Partners', 3, FALSE),
  ('Legal', 4, FALSE),
  ('Finance', 5, FALSE);

-- Insert default tags
INSERT INTO tags (name) VALUES
  ('CM4'),
  ('ORVE'),
  ('RZS'),
  ('JOSE ANTONIO'),
  ('SINVER'),
  ('DAVID'),
  ('DANIEL');
