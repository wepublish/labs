const GENERIC_PATHS = new Set([
  '',
  '/',
  '/de',
  '/de/',
  '/aktuell',
  '/aktuell/',
  '/aktuelles',
  '/aktuelles/',
  '/news',
  '/news/',
]);

/**
 * Treat homepages and generic index/listing paths as weak provenance.
 * Manual uploads can still pass structured citation metadata separately.
 */
export function isArticleLevelUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (GENERIC_PATHS.has(path)) return false;
    const segments = path.split('/').filter(Boolean);
    if (segments.length >= 2) return true;
    if (segments.length === 1) return true;
    return /\.[a-z0-9]{2,5}$/i.test(path);
  } catch {
    return false;
  }
}
