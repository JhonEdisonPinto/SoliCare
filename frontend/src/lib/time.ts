const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat('es-CO', { numeric: 'always', style: 'short' });
const clock = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const dateClock = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const full = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short' });

export function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** "hace 5 min", "hace 2 h", "hace 3 d". Returns "sin reportes" when there is no timestamp. */
export function timeAgo(iso: string | null | undefined, now: number): string {
  const ms = toMs(iso);
  if (ms === null) return 'sin reportes';
  const elapsed = Math.max(0, now - ms);
  if (elapsed < MINUTE) return 'hace menos de 1 min';
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
  return relative.format(-Math.floor(elapsed / DAY), 'day');
}

/** "47 min", "2 h 5 min", "3 d 4 h". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / MINUTE));
  if (total < 1) return 'menos de 1 min';
  if (total < 60) return `${total} min`;
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  const minutes = total % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

/** Clock time for today ("2:32 p. m."), date and time otherwise ("17 nov, 2:32 p. m."). */
export function formatWhen(iso: string, now: number): string {
  const ms = toMs(iso);
  if (ms === null) return '';
  const date = new Date(ms);
  const today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? clock.format(date) : dateClock.format(date);
}

/** formatWhen split for narrow columns: day is null for today ("2:32 p. m."), otherwise "17 nov" plus the clock time. */
export function formatWhenParts(iso: string, now: number): { day: string | null; time: string } {
  const ms = toMs(iso);
  if (ms === null) return { day: null, time: '' };
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return { day: sameDay ? null : day.format(date), time: clock.format(date) };
}

/** Long form for tooltips and accessible names. */
export function formatFull(iso: string): string {
  const ms = toMs(iso);
  return ms === null ? '' : full.format(new Date(ms));
}

const clockSeconds = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

const dayClockSeconds = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** Time of a reading with seconds: "2:32:05 p. m." today, "17 nov, 2:32:05 p. m." on another day. */
export function formatReadingTime(iso: string, now: number): string {
  const ms = toMs(iso);
  if (ms === null) return '';
  const sameDay = new Date(ms).toDateString() === new Date(now).toDateString();
  return (sameDay ? clockSeconds : dayClockSeconds).format(new Date(ms));
}

/** Time of day with seconds ("2:32:05 p. m."), for readings that arrive every 30 s. */
export function formatClockSeconds(iso: string): string {
  const ms = toMs(iso);
  return ms === null ? '' : clockSeconds.format(new Date(ms));
}
