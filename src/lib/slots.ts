import { AvailabilityRow, MatchRow, PitchBlockRow } from './pitchData';

// Slots start every 30 minutes so a pitch can open on the half hour and a
// booking can start at, say, 17:30.
export const SLOT_STEP_MINUTES = 30;

// Offered lengths for a booking or block, in minutes.
export const DURATION_OPTIONS = [60, 90, 120, 150, 180];

export type BusyRange = { start: Date; end: Date };

export type Slot = {
  /** Minutes from midnight local time, e.g. 17:30 is 1050. */
  startMinutes: number;
  label: string;
  isFree: boolean;
};

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** pitch_availability stores 0 = Monday, whereas Date.getDay() has 0 = Sunday. */
export function mondayFirstDayOfWeek(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function isToday(day: Date) {
  return isSameDay(day, new Date());
}

export function isPastDay(day: Date) {
  return startOfDay(day).getTime() < startOfDay(new Date()).getTime();
}

export function minutesFromMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

/** The first selectable slot boundary at or after the given moment. */
export function nextSlotBoundary(date: Date) {
  return Math.ceil(minutesFromMidnight(date) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
}

export function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, '0')}`;
}

/** Turns a minutes-from-midnight offset into a real Date on the given day. */
export function dateAtMinutes(dayStart: Date, minutes: number) {
  const next = new Date(dayStart);
  next.setHours(0, minutes, 0, 0); // setHours normalises minutes > 59 for us
  return next;
}

/**
 * Every open period configured for this weekday. A day can have several — a
 * morning and an afternoon shift, for instance — and the gap between them is
 * simply time the pitch is not available.
 */
export function rangesForDay(availability: AvailabilityRow[], day: Date) {
  const dayOfWeek = mondayFirstDayOfWeek(day);

  return availability
    .filter((row) => row.day_of_week === dayOfWeek && row.is_available)
    .sort((a, b) => parseTimeToMinutes(a.open_time) - parseTimeToMinutes(b.open_time));
}

/**
 * Times the pitch is already taken. `excludeBlockId` leaves out the booking
 * currently being edited, so it doesn't appear to collide with itself.
 */
export function buildBusyRanges(
  matches: MatchRow[],
  blocks: PitchBlockRow[],
  excludeBlockId?: string
): BusyRange[] {
  return [
    ...matches
      .filter((match) => match.status !== 'cancelled')
      .map((match) => ({ start: new Date(match.starts_at), end: new Date(match.ends_at) })),
    ...blocks
      .filter((block) => block.id !== excludeBlockId)
      .map((block) => ({ start: new Date(block.start_time), end: new Date(block.end_time) })),
  ];
}

export function overlapsBusy(start: Date, end: Date, busy: BusyRange[]) {
  return busy.some((range) => start < range.end && end > range.start);
}

/**
 * The stretch of a day that can still be booked, i.e. the opening span with
 * anything already in the past removed. Returns null when the day has passed,
 * is closed, or is today but already over.
 *
 * `clamped` marks the case where part of today has gone, so the screen can say
 * "the rest of today" rather than claiming to cover the whole day.
 */
export function bookableSpanForDay(
  availability: AvailabilityRow[],
  day: Date,
  now: Date = new Date()
) {
  if (isPastDay(day)) return null;

  const span = dayOpenSpan(availability, day);
  if (!span) return null;

  if (!isToday(day)) return { ...span, clamped: false };

  const earliest = nextSlotBoundary(now);
  const startMinutes = Math.max(span.startMinutes, earliest);

  if (startMinutes >= span.endMinutes) return null;

  return {
    startMinutes,
    endMinutes: span.endMinutes,
    clamped: startMinutes > span.startMinutes,
  };
}

/**
 * The full opening span of a day: from the first period's opening time to the
 * last period's closing time. On a split-shift day this deliberately spans the
 * gap in the middle — "the whole day" means nobody can book any of it, and the
 * gap was already unavailable anyway. Returns null if the day is closed.
 */
export function dayOpenSpan(availability: AvailabilityRow[], day: Date) {
  const ranges = rangesForDay(availability, day);
  if (ranges.length === 0) return null;

  const startMinutes = Math.min(...ranges.map((row) => parseTimeToMinutes(row.open_time)));
  const endMinutes = Math.max(...ranges.map((row) => parseTimeToMinutes(row.close_time)));

  if (endMinutes <= startMinutes) return null;

  return { startMinutes, endMinutes };
}

/** Anything already booked inside the given span, in chronological order. */
export function busyWithinSpan(
  dayStart: Date,
  span: { startMinutes: number; endMinutes: number },
  busy: BusyRange[]
) {
  const start = dateAtMinutes(dayStart, span.startMinutes);
  const end = dateAtMinutes(dayStart, span.endMinutes);

  return busy
    .filter((range) => start < range.end && end > range.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Every valid START point for a fresh booking/block: on a slot boundary,
 * inside an open period, not in the past, and with at least one slot-step of
 * clear room before the next conflict or close time.
 */
export function buildStartOptions(input: {
  availability: AvailabilityRow[];
  day: Date;
  busy: BusyRange[];
  /** Times before this are left out — a booking can't start in the past. */
  notBefore?: Date;
}): number[] {
  const { availability, day, busy, notBefore } = input;
  const dayStart = startOfDay(day);
  const ranges = rangesForDay(availability, dayStart);
  const options: number[] = [];

  ranges.forEach((range) => {
    const open = parseTimeToMinutes(range.open_time);
    const close = parseTimeToMinutes(range.close_time);

    for (let start = open; start + SLOT_STEP_MINUTES <= close; start += SLOT_STEP_MINUTES) {
      const slotStart = dateAtMinutes(dayStart, start);
      if (notBefore && slotStart.getTime() < notBefore.getTime()) continue;

      const minimalEnd = dateAtMinutes(dayStart, start + SLOT_STEP_MINUTES);
      if (overlapsBusy(slotStart, minimalEnd, busy)) continue;

      options.push(start);
    }
  });

  return options.sort((a, b) => a - b);
}

/**
 * Every valid END point for a booking/block starting at `startMinutes` — up
 * to the close of the open period it starts in, or the first conflict,
 * whichever comes first. A single continuous booking can't skip over a
 * conflict in the middle, so nothing past the first one is offered either.
 */
export function buildEndOptions(input: {
  availability: AvailabilityRow[];
  day: Date;
  busy: BusyRange[];
  startMinutes: number;
}): number[] {
  const { availability, day, busy, startMinutes } = input;
  const dayStart = startOfDay(day);
  const ranges = rangesForDay(availability, dayStart);

  const containing = ranges.find((range) => {
    const open = parseTimeToMinutes(range.open_time);
    const close = parseTimeToMinutes(range.close_time);
    return startMinutes >= open && startMinutes < close;
  });

  if (!containing) return [];

  const close = parseTimeToMinutes(containing.close_time);
  const slotStart = dateAtMinutes(dayStart, startMinutes);
  const options: number[] = [];

  for (let end = startMinutes + SLOT_STEP_MINUTES; end <= close; end += SLOT_STEP_MINUTES) {
    const slotEnd = dateAtMinutes(dayStart, end);
    if (overlapsBusy(slotStart, slotEnd, busy)) break;
    options.push(end);
  }

  return options;
}

/**
 * Builds the selectable start times for a day. A slot only appears if the
 * whole booking fits inside one open period — a 2-hour booking can't straddle
 * the gap between a morning and an afternoon shift.
 */
export function buildSlots(input: {
  availability: AvailabilityRow[];
  day: Date;
  durationMinutes: number;
  busy: BusyRange[];
  /**
   * Times before this are left out entirely — bookings can't be made in the
   * past, and showing hours that have already gone is just noise.
   */
  notBefore?: Date;
}): Slot[] {
  const { availability, day, durationMinutes, busy, notBefore } = input;
  const dayStart = startOfDay(day);
  const ranges = rangesForDay(availability, dayStart);

  const slots: Slot[] = [];
  const seen = new Set<number>();

  ranges.forEach((range) => {
    const open = parseTimeToMinutes(range.open_time);
    const close = parseTimeToMinutes(range.close_time);

    for (
      let start = open;
      start + durationMinutes <= close;
      start += SLOT_STEP_MINUTES
    ) {
      if (seen.has(start)) continue;
      seen.add(start);

      const slotStart = dateAtMinutes(dayStart, start);
      const slotEnd = dateAtMinutes(dayStart, start + durationMinutes);

      if (notBefore && slotStart.getTime() < notBefore.getTime()) continue;

      slots.push({
        startMinutes: start,
        label: `${minutesToLabel(start)} – ${minutesToLabel(start + durationMinutes)}`,
        isFree: !overlapsBusy(slotStart, slotEnd, busy),
      });
    }
  });

  return slots.sort((a, b) => a.startMinutes - b.startMinutes);
}
