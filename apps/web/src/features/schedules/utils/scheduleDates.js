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
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.Now?.plainDateISO) {
    return TemporalApi.Now.plainDateISO().toString();
  }

  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getNextDateForWeekday(weekdayName, baseIso) {
  const targetWeekday = WEEKDAY_NAME_TO_INDEX[weekdayName] ?? 0;
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
  const targetWeekday = WEEKDAY_NAME_TO_INDEX[weekdayName];
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
