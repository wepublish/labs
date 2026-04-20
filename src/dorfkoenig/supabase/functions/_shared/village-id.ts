// Canonical city-name normalization for `information_units.location.city`.
// Stores the gemeinden.json `id` form: lowercase, German umlauts replaced with
// ae/oe/ue/ss (so "Münchenstein" → "muenchenstein"). Both the 18:00 cron and
// the UI's KI Entwurf filter by this form via `.eq('location->>city', …)`.
// Every write path must use this helper; migration 20260421000002 backfills
// the existing rows.

export function normalizeCity(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}
