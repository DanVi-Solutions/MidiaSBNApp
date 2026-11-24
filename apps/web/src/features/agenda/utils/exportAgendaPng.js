import {
  lastDayOfMonthIso,
  monthLabelOf,
} from "@/features/agenda/utils/agendaDates";
import {
  COLORS,
  CONTENT_WIDTH,
  OUTER_PAD_X,
  OUTER_PAD_Y,
  drawQrFooter,
  drawRoundedRectPath,
  fillRoundedRect,
  fontSpec,
  formatExportPeriod,
  layoutPillsRightAligned,
  renderPngDocument,
  strokeRoundedRect,
  truncateText,
  wrapLines,
} from "@/features/schedules/utils/exportSchedulePng";
import {
  WEEKDAY_FULL_PT,
  compareScheduleEvents,
  getWeekdayIndex,
  parseIsoDateParts,
} from "@/features/schedules/utils/scheduleDates";

export const PUBLIC_AGENDA_URL =
  "https://midiasbn.vercel.app/agenda-sobrenatural";

export const EXPORT_MODE = Object.freeze({ MONTH: "month", WEEK: "week" });

const dateShortOf = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function buildAgendaExportPayload({
  events,
  mode,
  monthKey,
  weekStart,
  weekEnd,
  includeMinistries = true,
}) {
  const from = mode === EXPORT_MODE.WEEK ? weekStart : `${monthKey}-01`;
  const until =
    mode === EXPORT_MODE.WEEK ? weekEnd : lastDayOfMonthIso(monthKey);
  const inRange = events
    .filter(
      (event) =>
        event.published && event.dateIso >= from && event.dateIso <= until,
    )
    .sort(compareScheduleEvents);

  const days = new Map();
  for (const event of inRange) {
    if (!days.has(event.dateIso)) {
      days.set(event.dateIso, {
        dateIso: event.dateIso,
        dateShort: dateShortOf(event.dateIso),
        weekdayLabel: WEEKDAY_FULL_PT[getWeekdayIndex(event.dateIso)] || "",
        items: [],
      });
    }
    days.get(event.dateIso).items.push({
      id: event.id,
      time: event.time,
      name: event.name,
      location: event.location,
      ministries: includeMinistries
        ? event.departments.map((department) => department.name)
        : [],
    });
  }

  return {
    mode,
    from,
    until,
    periodLabel:
      mode === EXPORT_MODE.WEEK
        ? `Semana de ${formatExportPeriod(parseIsoDateParts(weekStart), parseIsoDateParts(weekEnd))}`
        : monthLabelOf(monthKey),
    days: [...days.values()],
    total: inRange.length,
    includeMinistries,
  };
}

function renderHeader(ctx, payload, y, draw) {
  const padX = 28;
  const padY = 22;
  const innerW = CONTENT_WIDTH - padX * 2;

  ctx.font = fontSpec(600, 16);
  const periodLines = wrapLines(ctx, payload.periodLabel, innerW);
  const height =
    padY + 18 + 8 + 32 + 6 + periodLines.length * 22 + 14 + 28 + padY;
  if (!draw) return height;

  fillRoundedRect(
    ctx,
    OUTER_PAD_X,
    y,
    CONTENT_WIDTH,
    height,
    18,
    COLORS.darkBg,
  );
  ctx.save();
  drawRoundedRectPath(ctx, OUTER_PAD_X, y, CONTENT_WIDTH, height, 18);
  ctx.clip();
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(OUTER_PAD_X, y, CONTENT_WIDTH, 5);
  ctx.restore();

  let hy = y + padY;
  const x = OUTER_PAD_X + padX;
  ctx.textBaseline = "top";
  ctx.font = fontSpec(700, 11.5);
  ctx.fillStyle = COLORS.accent;
  ctx.fillText("MÍDIA SOBRENATURAL", x, hy);
  hy += 26;

  ctx.font = fontSpec(700, 26);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Agenda Sobrenatural", x, hy);
  hy += 38;

  ctx.font = fontSpec(600, 16);
  ctx.fillStyle = COLORS.inkOnDark;
  for (const line of periodLines) {
    ctx.fillText(line, x, hy);
    hy += 22;
  }

  hy += 14;
  const chipText =
    payload.total === 1 ? "1 evento" : `${payload.total} eventos`;
  ctx.font = fontSpec(600, 12.5);
  const chipW = Math.ceil(ctx.measureText(chipText).width + 24);
  fillRoundedRect(ctx, x, hy, chipW, 28, 999, COLORS.darkSurface);
  strokeRoundedRect(ctx, x, hy, chipW, 28, 999, COLORS.darkBorder, 1);
  ctx.fillStyle = COLORS.inkOnDark;
  ctx.textBaseline = "middle";
  ctx.fillText(chipText, x + 12, hy + 14.5);
  ctx.textBaseline = "top";
  return height;
}

const ministryPill = (name) => ({
  text: name,
  bg: COLORS.pillBg,
  border: "",
  color: COLORS.pillText,
  weight: 600,
  fontSize: 12.5,
  padX: 12,
});

function renderDay(ctx, day, y, draw, includeMinistries) {
  const padLeft = 22;
  const padRight = 18;
  const padTop = 13;
  const padBottom = 11;
  const headingH = 22;
  const dividerGap = 8;
  const innerW = CONTENT_WIDTH - padLeft - padRight;
  const rowPadX = 10;
  const rowPadY = 8;
  const timeColW = 58;
  const gapTimeName = 12;
  const gapNamePills = 14;
  const innerRowW = innerW - rowPadX * 2;
  const nameColW = includeMinistries ? 260 : innerRowW - timeColW - gapTimeName;
  const pillsColW =
    innerRowW - timeColW - gapTimeName - nameColW - gapNamePills;

  const rows = day.items.map((item) => {
    ctx.font = fontSpec(600, 14);
    const nameLines = wrapLines(ctx, item.name, nameColW);
    const middleH =
      Math.max(1, nameLines.length) * 19 + (item.location ? 17 : 0);
    const { placed, totalHeight: pillsH } = layoutPillsRightAligned(
      ctx,
      item.ministries.map(ministryPill),
      innerRowW,
      pillsColW,
      6,
      6,
      26,
    );
    const contentH = Math.max(26, middleH, pillsH);
    return { item, nameLines, placed, rowHeight: rowPadY * 2 + contentH };
  });

  const rowsH =
    rows.reduce((sum, row) => sum + row.rowHeight, 0) +
    Math.max(0, rows.length - 1) * 2;
  const height = padTop + headingH + dividerGap + 4 + rowsH + padBottom;
  if (!draw) return height;

  fillRoundedRect(
    ctx,
    OUTER_PAD_X,
    y,
    CONTENT_WIDTH,
    height,
    14,
    COLORS.cardBg,
  );
  strokeRoundedRect(
    ctx,
    OUTER_PAD_X,
    y,
    CONTENT_WIDTH,
    height,
    14,
    COLORS.cardBorder,
    1,
  );
  ctx.save();
  drawRoundedRectPath(ctx, OUTER_PAD_X, y, CONTENT_WIDTH, height, 14);
  ctx.clip();
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(OUTER_PAD_X, y, 4, height);
  ctx.restore();

  const headingX = OUTER_PAD_X + padLeft;
  const headingCenterY = y + padTop + headingH / 2;
  ctx.textBaseline = "middle";
  ctx.font = fontSpec(700, 15.5);
  ctx.fillStyle = COLORS.inkPrimary;
  ctx.fillText(day.dateShort, headingX, headingCenterY);
  const dateW = ctx.measureText(day.dateShort).width;
  ctx.font = fontSpec(500, 13.5);
  ctx.fillStyle = COLORS.inkSecondary;
  ctx.fillText(`  ${day.weekdayLabel}`, headingX + dateW, headingCenterY);

  const dividerY = y + padTop + headingH + dividerGap;
  ctx.strokeStyle = COLORS.rowDivider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(headingX, dividerY);
  ctx.lineTo(OUTER_PAD_X + CONTENT_WIDTH - padRight, dividerY);
  ctx.stroke();

  let rowY = dividerY + 4;
  rows.forEach((row, index) => {
    if (index > 0) {
      ctx.strokeStyle = COLORS.rowDivider;
      ctx.beginPath();
      ctx.moveTo(headingX + rowPadX, rowY);
      ctx.lineTo(headingX + innerW - rowPadX, rowY);
      ctx.stroke();
    }

    const innerX = headingX + rowPadX;
    const contentTopY = rowY + rowPadY;

    ctx.textBaseline = "middle";
    ctx.font = fontSpec(700, 13.5);
    ctx.fillStyle = COLORS.inkPrimary;
    ctx.fillText(row.item.time, innerX, contentTopY + 13);

    const nameX = innerX + timeColW + gapTimeName;
    let cursorY = contentTopY + 3;
    ctx.textBaseline = "top";
    ctx.font = fontSpec(600, 14);
    ctx.fillStyle = COLORS.inkPrimary;
    for (const line of row.nameLines) {
      ctx.fillText(line, nameX, cursorY);
      cursorY += 19;
    }
    if (row.item.location) {
      ctx.font = fontSpec(500, 12);
      ctx.fillStyle = COLORS.inkMuted;
      ctx.fillText(
        truncateText(ctx, row.item.location, nameColW),
        nameX,
        cursorY + 1,
      );
    }

    ctx.textBaseline = "middle";
    for (const pill of row.placed) {
      const px = innerX + pill.x;
      const py = contentTopY + pill.yOffset;
      fillRoundedRect(ctx, px, py, pill.width, pill.height, 999, pill.bg);
      ctx.font = fontSpec(pill.weight, pill.fontSize);
      ctx.fillStyle = pill.color;
      ctx.fillText(
        truncateText(ctx, pill.text, pill.width - pill.padX * 2),
        px + pill.padX,
        py + pill.height / 2 + 0.5,
      );
    }
    ctx.textBaseline = "top";
    rowY += row.rowHeight + 2;
  });

  return height;
}

function renderAgendaDocument(ctx, payload, { draw }) {
  let y = OUTER_PAD_Y;
  y += renderHeader(ctx, payload, y, draw) + 12;
  for (const day of payload.days) {
    y += renderDay(ctx, day, y, draw, payload.includeMinistries) + 10;
  }
  y = drawQrFooter(ctx, y, {
    url: PUBLIC_AGENDA_URL,
    eyebrow: "AGENDA SOBRENATURAL",
    heading: "Acompanhe a agenda da igreja",
    description:
      "Escaneie o QR Code ao lado ou acesse o link abaixo para ver todos os eventos do ano.",
    draw,
  });
  return y + OUTER_PAD_Y;
}

export function exportAgendaPng(payload) {
  const fileName = `agenda-sobrenatural-${payload.from}-a-${payload.until}.png`;
  return renderPngDocument(
    (ctx, options) => renderAgendaDocument(ctx, payload, options),
    fileName,
  );
}
