/**
 * @module subpage-filter
 * Filter extracted links to the subpages we consider safe to fetch during
 * Phase B of the web-scout listing-page follow. Host-lock + denylist are
 * already handled by `extractLinksFromHtml` (civic-utils); this layer adds
 * the subpage-specific rules: path-prefix under the index URL, path
 * traversal block, and a second-pass domain validator.
 */

import { validateDomain } from './civic-utils.ts';

/**
 * Keep only links that:
 *   1. Parse as a valid URL.
 *   2. Have a path under `indexUrl`'s path (strict prefix + separator).
 *   3. Contain no `..` or percent-encoded traversal in the path.
 *   4. Pass `validateDomain` (reject IPs / localhost / reserved names).
 *
 * Pure function; no network, no I/O.
 */
export function filterSubpageUrls(links: string[], indexUrl: string): string[] {
  let indexPath: string;
  try {
    indexPath = new URL(indexUrl).pathname.replace(/\/+$/, '');
  } catch {
    return [];
  }

  return links.filter((url) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPath.startsWith(indexPath + '/')) return false;
    if (cleanPath.includes('..') || cleanPath.toLowerCase().includes('%2e%2e')) return false;
    if (!validateDomain(parsed.hostname).valid) return false;
    return true;
  });
}
