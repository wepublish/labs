// coJournalist-Lite constants

// Frequency options for scouts
export const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
] as const;

// Extended frequency options (for scout creation wizard)
export const FREQUENCY_OPTIONS_EXTENDED = [
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'biweekly', label: 'Alle 2 Wochen' },
  { value: 'monthly', label: 'Monatlich' },
] as const;

// Day of week options
export const DAY_OF_WEEK_OPTIONS = [
  { value: 'monday', label: 'Montag' },
  { value: 'tuesday', label: 'Dienstag' },
  { value: 'wednesday', label: 'Mittwoch' },
  { value: 'thursday', label: 'Donnerstag' },
  { value: 'friday', label: 'Freitag' },
  { value: 'saturday', label: 'Samstag' },
  { value: 'sunday', label: 'Sonntag' },
] as const;

// Unit type labels
export const UNIT_TYPE_LABELS: Record<string, string> = {
  fact: 'Fakt',
  event: 'Ereignis',
  entity_update: 'Aktualisierung',
};

// Execution status labels
export const EXECUTION_STATUS_LABELS: Record<string, string> = {
  running: 'Läuft',
  completed: 'Abgeschlossen',
  failed: 'Fehlgeschlagen',
};

// Change status labels
export const CHANGE_STATUS_LABELS: Record<string, string> = {
  changed: 'Geändert',
  same: 'Unverändert',
  error: 'Fehler',
  first_run: 'Erster Lauf',
};

// Compose style options
export const COMPOSE_STYLE_OPTIONS = [
  { value: 'news', label: 'Nachrichtenartikel' },
  { value: 'summary', label: 'Zusammenfassung' },
  { value: 'analysis', label: 'Analyse' },
] as const;

// Preset test users
export const PRESET_USERS = [
  { id: 'journalist-1', name: 'Journalist Berlin' },
  { id: 'journalist-2', name: 'Journalist Hamburg' },
  { id: 'tester-1', name: 'Tester' },
];

// Date formatting for German locale
export function formatDate(date: string | null): string {
  if (!date) return 'Nie';
  return new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  return formatDate(date);
}
