import type { ShowEvent } from '../../types/domain';

export function getLocalDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function formatEventPeriod(event: Pick<ShowEvent, 'startDate' | 'endDate'>) {
  return event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} to ${event.endDate}`;
}

export type ShowEventTiming = 'current' | 'upcoming' | 'past';

export function getShowEventTiming(event: Pick<ShowEvent, 'startDate' | 'endDate'>, today = getLocalDateInputValue()): ShowEventTiming {
  if (event.endDate < today) return 'past';
  if (event.startDate > today) return 'upcoming';
  return 'current';
}

export function formatShowEventOptionLabel(
  event: Pick<ShowEvent, 'name' | 'startDate' | 'endDate' | 'location'>,
  options: { includeLocation?: boolean } = {}
) {
  const location = options.includeLocation && event.location ? ` / ${event.location}` : '';
  return `${event.name} / ${formatEventPeriod(event)}${location}`;
}

export function sortShowEventOptions<T extends Pick<ShowEvent, 'startDate' | 'endDate' | 'name'>>(events: T[]) {
  const timingRank: Record<ShowEventTiming, number> = { current: 0, upcoming: 1, past: 2 };
  return [...events].sort((left, right) => {
    const leftTiming = getShowEventTiming(left);
    const rightTiming = getShowEventTiming(right);
    if (leftTiming !== rightTiming) return timingRank[leftTiming] - timingRank[rightTiming];
    if (leftTiming === 'past') return right.startDate.localeCompare(left.startDate);
    const dateSort = left.startDate.localeCompare(right.startDate);
    return dateSort || left.name.localeCompare(right.name);
  });
}
