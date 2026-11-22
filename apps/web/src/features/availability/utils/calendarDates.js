function parseIsoParts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getTemporalApi() {
  return typeof globalThis !== "undefined" ? globalThis.Temporal : undefined;
}

function toEpochDay(iso) {
  const parts = parseIsoParts(iso);
  if (!parts) return 0;
  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000
  );
}

export function compareIsoDates(a, b) {
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    return TemporalApi.PlainDate.compare(
      TemporalApi.PlainDate.from(a),
      TemporalApi.PlainDate.from(b)
    );
  }
  return toEpochDay(a) - toEpochDay(b);
}

export function countInclusiveDays(startIso, endIso) {
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    const start = TemporalApi.PlainDate.from(startIso);
    const end = TemporalApi.PlainDate.from(endIso);
    return start.until(end, { largestUnit: "day" }).days + 1;
  }
  return toEpochDay(endIso) - toEpochDay(startIso) + 1;
}

export function countUniqueUnavailableDays(exceptions) {
  if (!Array.isArray(exceptions) || exceptions.length === 0) return 0;

  const sorted = [...exceptions].sort((left, right) => {
    const startDiff = compareIsoDates(left.startDate, right.startDate);
    if (startDiff !== 0) return startDiff;
    return compareIsoDates(left.endDate, right.endDate);
  });

  const merged = [];
  for (const item of sorted) {
    const last = merged.at(-1);
    if (!last || compareIsoDates(item.startDate, last.endDate) > 0) {
      merged.push({ startDate: item.startDate, endDate: item.endDate });
    } else if (compareIsoDates(item.endDate, last.endDate) > 0) {
      last.endDate = item.endDate;
    }
  }

  return merged.reduce(
    (total, span) => total + countInclusiveDays(span.startDate, span.endDate),
    0
  );
}

export function formatCalendarDatePtBr(iso) {
  const TemporalApi = getTemporalApi();
  if (TemporalApi?.PlainDate) {
    return TemporalApi.PlainDate.from(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const parts = parseIsoParts(iso);
  if (!parts) return String(iso ?? "");
  const dd = String(parts.day).padStart(2, "0");
  const mm = String(parts.month).padStart(2, "0");
  const yyyy = String(parts.year).padStart(4, "0");
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDurationDaysPtBr(days) {
  const safeDays = Math.max(0, Number(days) || 0);

  if (typeof Intl !== "undefined" && typeof Intl.DurationFormat === "function") {
    try {
      const formatter = new Intl.DurationFormat("pt-BR", { style: "long" });
      return formatter.format({ days: safeDays });
    } catch {
      // Fallback below when runtime locale data omits DurationFormat
    }
  }

  return `${safeDays} ${safeDays === 1 ? "dia" : "dias"}`;
}
