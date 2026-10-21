/** Free consumer email providers whose domain alone says nothing about who the sender actually is. */
const GENERIC_EMAIL_DOMAINS = new Set(['gmail.com']);

/** True for a generic/free-provider domain — these shouldn't get their own auto-created per-domain folder. */
export function isGenericEmailDomain(domain: string | null): boolean {
  return !!domain && GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** Catch-all folder name for a sender on a generic domain, until someone moves the item to a real folder. */
export const TEMP_FOLDER_NAME = 'Temp';
