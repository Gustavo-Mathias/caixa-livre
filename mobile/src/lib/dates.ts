/** Datas de lançamento são "AAAA-MM-DD" no fuso do aparelho, sem hora. */

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
}

/** Dias entre a e b (a − b). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** "2026-10" do mês que fica `offset` meses de distância de `today`. */
export function monthKey(today: string, offset = 0): string {
  const d = parseISO(today);
  const m = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export function monthName(key: string): string {
  return MONTHS[Number(key.split('-')[1]) - 1];
}

export function monthShort(key: string): string {
  return MONTHS_SHORT[Number(key.split('-')[1]) - 1];
}

/** "19 out" */
export function dayLabel(iso: string): string {
  const d = parseISO(iso);
  return `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "Ter, 19 out", com "Hoje" e "Ontem" quando couber. */
export function dayHeading(iso: string, today: string): string {
  const k = diffDays(iso, today);
  if (k === 0) return 'Hoje';
  if (k === -1) return 'Ontem';
  const d = parseISO(iso);
  const w = WEEKDAYS_SHORT[d.getDay()];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function endOfMonth(iso: string): string {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Primeiro dia do mês que fica `offset` meses de `today`. */
export function startOfMonth(today: string, offset = 0): string {
  const d = parseISO(today);
  return toISO(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}
