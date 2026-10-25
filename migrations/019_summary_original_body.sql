-- Summaries trim their stored `content` to start at the forwarded message's own "From:" header, dropping the forwarder's preamble where a sender-declared "tags:a, b" line usually lives. Keep the full, untrimmed body separately so inline tag parsing can still find it.
ALTER TABLE meeting_summaries ADD COLUMN IF NOT EXISTS original_body TEXT;
