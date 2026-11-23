export const APP_TIME_ZONE = "America/Sao_Paulo";

export const MONTH_SHORT_PT = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

export const MONTH_FULL_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const WEEKDAY_SHORT_PT = [
  "DOM.",
  "SEG.",
  "TER.",
  "QUA.",
  "QUI.",
  "SEX.",
  "SÁB.",
];

export const WEEKDAY_FULL_PT = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export const WEEKDAY_NAME_TO_INDEX = {
  Domingo: 0,
  "Segunda-feira": 1,
  "Terça-feira": 2,
  "Quarta-feira": 3,
  "Quinta-feira": 4,
  "Sexta-feira": 5,
  Sábado: 6,
};

export const WEEKDAY_CODE_TO_INDEX = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export const WEEKDAY_SHORT_TITLE_PT = {
  Domingo: "Dom",
  "Segunda-feira": "Seg",
  "Terça-feira": "Ter",
  "Quarta-feira": "Qua",
  "Quinta-feira": "Qui",
  "Sexta-feira": "Sex",
  Sábado: "Sáb",
};

export function formatWeekdayShortTitle(weekdayName) {
  return WEEKDAY_SHORT_TITLE_PT[weekdayName] ?? String(weekdayName ?? "");
}

function getTemporalApi() {
  return typeof globalThis !== "undefined" ? globalThis.Temporal : undefined;
}

export function resolveWeekdayIndex(weekdayCodeOrLabel) {
  if (WEEKDAY_CODE_TO_INDEX[weekdayCodeOrLabel] !== undefined) {
    return WEEKDAY_CODE_TO_INDEX[weekdayCodeOrLabel];
  }
  return WEEKDAY_NAME_TO_INDEX[weekdayCodeOrLabel];
}

export function parseIsoDateParts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function formatIsoDatePtBr(iso) {
  const parts = parseIsoDateParts(iso);
  if (!parts) return String(iso ?? "");
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

export function getWeekdayIndex(iso) {
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    try {
      return TemporalApi.PlainDate.from(iso).dayOfWeek % 7;
    } catch {
      // Fallback below
    }
  }

  const parts = parseIsoDateParts(iso);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function formatScheduleDateDisplay(iso) {
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    try {
      const plainDate = TemporalApi.PlainDate.from(iso);
      const dayNumber = plainDate.day;
      const monthIndex = plainDate.month - 1;
      const weekdayIndex = plainDate.dayOfWeek % 7;
      return {
        day: String(dayNumber).padStart(2, "0"),
        monthShort: MONTH_SHORT_PT[monthIndex] ?? "---",
        weekdayShort: WEEKDAY_SHORT_PT[weekdayIndex] ?? "",
        fullDateLabel: `${WEEKDAY_FULL_PT[weekdayIndex]}, ${String(dayNumber).padStart(2, "0")} de ${MONTH_FULL_PT[monthIndex]}`,
      };
    } catch {
      // Fallback below
    }
  }

  const parts = parseIsoDateParts(iso);
  if (!parts) {
    return {
      day: "--",
      monthShort: "---",
      weekdayShort: "",
      fullDateLabel: String(iso ?? ""),
    };
  }

  const monthIndex = parts.month - 1;
  const weekdayIndex = getWeekdayIndex(iso);
  return {
    day: String(parts.day).padStart(2, "0"),
    monthShort: MONTH_SHORT_PT[monthIndex] ?? "---",
    weekdayShort: WEEKDAY_SHORT_PT[weekdayIndex] ?? "",
    fullDateLabel: `${WEEKDAY_FULL_PT[weekdayIndex]}, ${String(parts.day).padStart(2, "0")} de ${MONTH_FULL_PT[monthIndex]}`,
  };
}

export function normalizeWallTime(rawTime) {
  const trimmed = String(rawTime ?? "").trim();
  if (!trimmed) return "";

  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainTime) {
    try {
      return TemporalApi.PlainTime.from(trimmed).toString({
        smallestUnit: "minute",
      });
    } catch {
      return "";
    }
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(trimmed);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function extractDateAndTimeInZone(
  isoDateTime,
  timeZone = APP_TIME_ZONE
) {
  const dateObj =
    isoDateTime instanceof Date ? isoDateTime : new Date(isoDateTime);
  if (Number.isNaN(dateObj.getTime())) {
    return { dateIso: "", time: "" };
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const partsMap = {};
    for (const part of formatter.formatToParts(dateObj)) {
      if (part.type !== "literal") {
        partsMap[part.type] = part.value;
      }
    }
    const hour = partsMap.hour === "24" ? "00" : partsMap.hour;
    return {
      dateIso: `${partsMap.year}-${partsMap.month}-${partsMap.day}`,
      time: `${hour}:${partsMap.minute}`,
    };
  } catch {
    const iso = dateObj.toISOString();
    return {
      dateIso: iso.slice(0, 10),
      time: iso.slice(11, 16),
    };
  }
}

export function getZoneOffsetString(
  dateObj = new Date(),
  timeZone = APP_TIME_ZONE
) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    });
    const tzPart = formatter
      .formatToParts(dateObj)
      .find((part) => part.type === "timeZoneName")?.value;

    if (!tzPart) return "-03:00";
    if (tzPart === "GMT" || tzPart === "UTC") return "Z";
    const match = /([+-]\d{2}:\d{2})$/.exec(tzPart);
    return match ? match[1] : "-03:00";
  } catch {
    return "-03:00";
  }
}

export function buildIsoDateTimeInZone(
  dateIso,
  timeHm,
  timeZone = APP_TIME_ZONE
) {
  const cleanDate = String(dateIso ?? "").trim();
  const cleanTime = normalizeWallTime(timeHm);
  if (!parseIsoDateParts(cleanDate) || !cleanTime) {
    return "";
  }

  const probeDate = new Date(`${cleanDate}T${cleanTime}:00Z`);
  const offset = getZoneOffsetString(probeDate, timeZone);
  return `${cleanDate}T${cleanTime}:00${offset}`;
}

export function getTodayIsoInZone(timeZone = APP_TIME_ZONE) {
  return extractDateAndTimeInZone(new Date(), timeZone).dateIso;
}

export function getStartOfCurrentMonthIsoInZone(timeZone = APP_TIME_ZONE) {
  const todayIso = getTodayIsoInZone(timeZone);
  const yearMonth = todayIso.slice(0, 7);
  return buildIsoDateTimeInZone(`${yearMonth}-01`, "00:00", timeZone);
}

export function isScheduleAtInsideWindow(scheduleAtIso, scheduleWindow) {
  if (!scheduleAtIso || !scheduleWindow?.editableFrom || !scheduleWindow?.editableUntil) {
    return false;
  }
  const ts = new Date(scheduleAtIso).getTime();
  const fromTs = new Date(scheduleWindow.editableFrom).getTime();
  const untilTs = new Date(scheduleWindow.editableUntil).getTime();
  if (Number.isNaN(ts) || Number.isNaN(fromTs) || Number.isNaN(untilTs)) {
    return false;
  }
  return ts >= fromTs && ts < untilTs;
}

export function getMonthsOfWindow(editableFromIso, lastEditableDay) {
  const firstMonth = editableFromIso
    ? extractDateAndTimeInZone(editableFromIso).dateIso.slice(0, 7)
    : getTodayIsoInZone().slice(0, 7);
  const lastMonth = lastEditableDay
    ? String(lastEditableDay).slice(0, 7)
    : firstMonth;

  const [startYear, startMon] = firstMonth.split("-").map(Number);
  const [endYear, endMon] = lastMonth.split("-").map(Number);
  if (!startYear || !startMon || !endYear || !endMon) {
    return firstMonth ? [firstMonth] : [];
  }

  const months = [];
  let y = startYear;
  let m = startMon;

  while (y < endYear || (y === endYear && m <= endMon)) {
    months.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (months.length > 12) break;
  }

  return months;
}

export function formatYearMonthFullPt(yearMonth) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth ?? "").trim());
  if (!match) return String(yearMonth ?? "");
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const monthName = MONTH_FULL_PT[monthIdx];
  return monthName ? `${monthName} de ${year}` : yearMonth;
}

export function getWindowRecurringOccurrences({
  weekday,
  times,
  month,
  scheduleWindow,
  timeZone = APP_TIME_ZONE,
}) {
  const targetWeekday = resolveWeekdayIndex(weekday);
  if (targetWeekday === undefined) {
    return { slots: [], byDate: [], totalSlots: 0, outsideWindowCount: 0 };
  }

  const rawTimes = Array.isArray(times) ? times : times ? [times] : [];
  const sortedTimes = [
    ...new Set(rawTimes.map(normalizeWallTime).filter(Boolean)),
  ].sort();

  if (sortedTimes.length === 0) {
    return { slots: [], byDate: [], totalSlots: 0, outsideWindowCount: 0 };
  }

  const months = month
    ? [month]
    : scheduleWindow
      ? getMonthsOfWindow(
          scheduleWindow.editableFrom,
          scheduleWindow.lastEditableDay
        )
      : [getTodayIsoInZone(timeZone).slice(0, 7)];

  const slots = [];
  const byDateMap = new Map();
  let outsideWindowCount = 0;

  const fallbackNowMs = Date.now();
  const fallbackTodayIso = getTodayIsoInZone(timeZone);

  for (const ym of months) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(ym));
    if (!match) continue;
    const year = Number(match[1]);
    const monthNum = Number(match[2]);
    const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateIso = `${String(year).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (getWeekdayIndex(dateIso) !== targetWeekday) continue;

      for (const time of sortedTimes) {
        const scheduleAt = buildIsoDateTimeInZone(dateIso, time, timeZone);
        if (!scheduleAt) continue;

        const inside = scheduleWindow
          ? isScheduleAtInsideWindow(scheduleAt, scheduleWindow)
          : new Date(scheduleAt).getTime() >= fallbackNowMs &&
            dateIso.slice(0, 7) === fallbackTodayIso.slice(0, 7);

        if (!inside) {
          outsideWindowCount += 1;
          continue;
        }

        slots.push({ dateIso, time, scheduleAt });
        if (!byDateMap.has(dateIso)) {
          byDateMap.set(dateIso, []);
        }
        byDateMap.get(dateIso).push(time);
      }
    }
  }

  const byDate = [...byDateMap.entries()].map(([dateIso, dateTimes]) => ({
    dateIso,
    times: dateTimes,
  }));

  return {
    slots,
    byDate,
    totalSlots: slots.length,
    outsideWindowCount,
  };
}

function toEpochDay(iso) {
  const parts = parseIsoDateParts(iso);
  if (!parts) return 0;
  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000
  );
}

export function compareScheduleEvents(a, b) {
  const TemporalApi = getTemporalApi();
  const aDate = String(a?.dateIso ?? "");
  const bDate = String(b?.dateIso ?? "");

  let dateDiff = 0;
  if (TemporalApi?.PlainDate && aDate && bDate) {
    try {
      dateDiff = TemporalApi.PlainDate.compare(
        TemporalApi.PlainDate.from(aDate),
        TemporalApi.PlainDate.from(bDate)
      );
    } catch {
      dateDiff = toEpochDay(aDate) - toEpochDay(bDate);
    }
  } else {
    dateDiff = toEpochDay(aDate) - toEpochDay(bDate);
  }

  if (dateDiff !== 0) return dateDiff;

  const aTime = normalizeWallTime(a?.time) || "00:00";
  const bTime = normalizeWallTime(b?.time) || "00:00";

  if (TemporalApi?.PlainTime) {
    try {
      return TemporalApi.PlainTime.compare(
        TemporalApi.PlainTime.from(aTime),
        TemporalApi.PlainTime.from(bTime)
      );
    } catch {
      // Fallback below
    }
  }

  return aTime.localeCompare(bTime);
}

export function getTodayIsoDate() {
  return getTodayIsoInZone(APP_TIME_ZONE);
}

export function getNextDateForWeekday(weekdayName, baseIso) {
  const targetWeekday = resolveWeekdayIndex(weekdayName) ?? 0;
  const base = parseIsoDateParts(baseIso) ? baseIso : getTodayIsoDate();
  const baseWeekday = getWeekdayIndex(base);
  const delta = (targetWeekday - baseWeekday + 7) % 7;

  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    try {
      return TemporalApi.PlainDate.from(base).add({ days: delta }).toString();
    } catch {
      // Fallback below
    }
  }

  const parts = parseIsoDateParts(base);
  if (!parts) return getTodayIsoDate();
  const targetDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + delta)
  );
  const year = String(targetDate.getUTCFullYear()).padStart(4, "0");
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRemainingMonthOccurrencesForWeekday(weekdayName, baseIso) {
  const targetWeekday = resolveWeekdayIndex(weekdayName);
  if (targetWeekday === undefined) return [];

  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate && TemporalApi?.PlainYearMonth) {
    try {
      const startDate = parseIsoDateParts(baseIso)
        ? TemporalApi.PlainDate.from(baseIso)
        : TemporalApi.Now.plainDateISO();
      const currentYearMonth = startDate.toPlainYearMonth();
      const delta = (targetWeekday - (startDate.dayOfWeek % 7) + 7) % 7;
      const dates = [];
      let cursor = startDate.add({ days: delta });

      while (cursor.toPlainYearMonth().equals(currentYearMonth)) {
        dates.push(cursor.toString());
        cursor = cursor.add({ days: 7 });
      }
      return dates;
    } catch {
      // Fallback below
    }
  }

  const base = parseIsoDateParts(baseIso) ? baseIso : getTodayIsoDate();
  const parts = parseIsoDateParts(base);
  if (!parts) return [];

  const daysInMonth = new Date(
    Date.UTC(parts.year, parts.month, 0)
  ).getUTCDate();
  const delta = (targetWeekday - getWeekdayIndex(base) + 7) % 7;
  const yearStr = String(parts.year).padStart(4, "0");
  const monthStr = String(parts.month).padStart(2, "0");
  const dates = [];

  for (let day = parts.day + delta; day <= daysInMonth; day += 7) {
    dates.push(`${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

export function formatRecurringChipDate(iso) {
  const { day, monthShort } = formatScheduleDateDisplay(iso);
  return `${day} de ${monthShort.toLowerCase()}.`;
}

export function formatMonthYearLabel(iso) {
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    try {
      const plainDate = TemporalApi.PlainDate.from(iso);
      const monthName = MONTH_FULL_PT[plainDate.month - 1];
      if (monthName) {
        return `${monthName.toLowerCase()} de ${plainDate.year}`;
      }
    } catch {
      // Fallback below
    }
  }

  const parts = parseIsoDateParts(iso);
  if (!parts) return "";
  const monthName = MONTH_FULL_PT[parts.month - 1];
  return monthName ? `${monthName.toLowerCase()} de ${parts.year}` : "";
}
