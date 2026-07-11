const MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export function formatMonthYear(isoDate: string): string {
  const d = new Date(isoDate);
  return `${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatMonthYear(startIso);

  const start = new Date(startIso);
  const end = new Date(endIso);

  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return formatMonthYear(startIso);
  }

  return `${formatMonthYear(startIso)} — ${formatMonthYear(endIso)}`;
}
