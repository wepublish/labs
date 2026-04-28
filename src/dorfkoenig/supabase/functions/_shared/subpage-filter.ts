/**
 * @module subpage-filter
 * Filter extracted links to the subpages we consider safe to fetch during
 * Phase B of the web-scout listing-page follow. Host-lock + denylist are
 * already handled by `extractLinksFromHtml` (civic-utils); this layer adds
 * the subpage-specific rules: path-prefix under the index URL, safe same-host
 * article routes, path traversal block, and a second-pass domain validator.
 */

import { validateDomain } from './civic-utils.ts';

export interface SubpageFilterOptions {
  /**
   * Allow known article routes on the same host even if they are not strict
   * children of the listing path. Needed for CH Media/BZ lists, where a
   * village listing can link to /aargau/fricktal/...-ld.NNN.
   */
  allowSameHostArticles?: boolean;
}

export function isLikelyArticleUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  if (hasTraversal(cleanPath)) return false;
  if (hasStaticAsset(cleanPath)) return false;

  const segments = cleanPath.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';

  if (/(^|-)ld\.\d+$/i.test(last)) return true;
  if (/^ld\.\d+$/i.test(last)) return true;
  if (/\.(php|html?|aspx)$/i.test(last) && segments.length >= 2) return true;
  if (/^\d{5,}$/.test(last) && segments.length >= 2) return true;
  return false;
}

export function looksLikeListingPage(indexUrl: string, candidateUrls: string[]): boolean {
  return candidateUrls.length > 0 && !isLikelyArticleUrl(indexUrl);
}

/**
 * Keep only links that:
 *   1. Parse as a valid URL.
 *   2. Stay on the same host as the index URL.
 *   3. Are strict children of the index path OR known same-host article routes.
 *   4. Contain no `..` or percent-encoded traversal in the path.
 *   5. Pass `validateDomain` (reject IPs / localhost / reserved names).
 *
 * Pure function; no network, no I/O.
 */
export function filterSubpageUrls(
  links: string[],
  indexUrl: string,
  options: SubpageFilterOptions = {},
): string[] {
  let index: URL;
  try {
    index = new URL(indexUrl);
  } catch {
    return [];
  }
  const indexHost = normalizeHost(index.hostname);
  const indexPath = index.pathname.replace(/\/+$/, '');
  const allowSameHostArticles = options.allowSameHostArticles ?? true;

  return links.filter((url) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (normalizeHost(parsed.hostname) !== indexHost) return false;
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (hasTraversal(cleanPath)) return false;
    if (hasStaticAsset(cleanPath)) return false;
    if (!validateDomain(parsed.hostname).valid) return false;
    if (cleanPath.startsWith(indexPath + '/')) return true;
    return allowSameHostArticles && isLikelyArticleUrl(url);
  });
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function hasTraversal(path: string): boolean {
  return path.includes('..') || path.toLowerCase().includes('%2e%2e');
}

function hasStaticAsset(path: string): boolean {
  return /\.(css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map|xml|json)$/i.test(path);
}
