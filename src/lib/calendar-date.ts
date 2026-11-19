const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function calendarDate(value: string | null | undefined) {
  if (!value) return null;
  const candidate = value.slice(0, 10);
  const match = calendarDatePattern.exec(candidate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? candidate
    : null;
}

export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const parsed = calendarDate(value);
  if (!parsed) return value;
  const [year, month, day] = parsed.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...options,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function calendarDateRange(value: string) {
  const parsed = calendarDate(value);
  if (!parsed) return null;
  const [year, month, day] = parsed.split("-").map(Number);
  const startsAt = new Date(Date.UTC(year, month - 1, day, 14));
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 10 * 60 * 60 * 1000),
  };
}
