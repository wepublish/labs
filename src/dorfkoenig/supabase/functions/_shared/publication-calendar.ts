const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function addDaysIsoDate(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function zurichTodayIso(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
}

export function isWeekdayPublicationDate(isoDate: string): boolean {
  if (!isIsoDate(isoDate)) return false;
  const day = parseIsoDate(isoDate).getUTCDay();
  return day >= 1 && day <= 5;
}

export function nextPublicationDateFromZurichRunDate(runDate: string): string | null {
  const nextDay = addDaysIsoDate(runDate, 1);
  return isWeekdayPublicationDate(nextDay) ? nextDay : null;
}

export function nextValidPublicationDateAfter(runDate: string): string {
  let candidate = addDaysIsoDate(runDate, 1);
  while (!isWeekdayPublicationDate(candidate)) {
    candidate = addDaysIsoDate(candidate, 1);
  }
  return candidate;
}

export function formatZurichGeneratedAt(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return new Intl.DateTimeFormat('de-CH', {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function parseIsoDate(isoDate: string): Date {
  if (!isIsoDate(isoDate)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return new Date(`${isoDate}T00:00:00Z`);
}
