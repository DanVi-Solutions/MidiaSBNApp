import { MONTH_FULL_PT } from "@/features/schedules/utils/scheduleDates";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDate = (iso) => new Date(`${iso}T12:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);

export function addDaysIso(iso, days) {
  return toIso(new Date(toUtcDate(iso).getTime() + days * ONE_DAY_MS));
}

export function monthLabelOf(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_FULL_PT[month - 1]} ${year}`;
}

export function shortMonthLabelOf(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_FULL_PT[month - 1]}/${year}`;
}

export function monthsBetween(firstMonthKey, lastMonthKey) {
  const months = [];
  let [year, month] = firstMonthKey.split("-").map(Number);
  const [lastYear, lastMonth] = lastMonthKey.split("-").map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function lastDayOfMonthIso(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${monthKey}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function weekStartOf(iso) {
  return addDaysIso(iso, -toUtcDate(iso).getUTCDay());
}

const dayAndMonth = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function weeksOfMonth(monthKey) {
  const lastDay = lastDayOfMonthIso(monthKey);
  const weeks = [];
  for (
    let start = weekStartOf(`${monthKey}-01`);
    start <= lastDay;
    start = addDaysIso(start, 7)
  ) {
    const end = addDaysIso(start, 6);
    weeks.push({
      start,
      end,
      label: `${dayAndMonth(start)} a ${dayAndMonth(end)}`,
    });
  }
  return weeks;
}

export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const MAX_CALENDAR_DOTS = 3;

export const normalizeSearch = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function groupByMonth(events) {
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.monthKey)) groups.set(event.monthKey, []);
    groups.get(event.monthKey).push(event);
  }
  return [...groups.entries()].map(([monthKey, items]) => ({ monthKey, label: monthLabelOf(monthKey), items }));
}

export function calendarCellsOf(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}
