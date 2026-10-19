/**
 * A short, friendly display name for a sender — prefers a real captured
 * display name (not an email-looking string), falling back to Title Case
 * words derived from the email's local part (e.g. "koby" -> "Koby",
 * "jose.antonio" -> "Jose Antonio").
 */
export function prettySenderName(name: string | null, email: string | null): string | null {
  if (name && name.trim() && !name.includes('@')) return name.trim();
  if (!email) return name;
  const local = email.split('@')[0];
  if (!local) return email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
