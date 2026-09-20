-- Records why a summary's extracted_data.model is 'heuristic' instead of the
-- configured Gemini model, e.g. a transient Gemini 503, so the UI can tell
-- the user AI extraction failed rather than silently showing thinner data.
ALTER TABLE extracted_data
  ADD COLUMN IF NOT EXISTS ai_error TEXT;
