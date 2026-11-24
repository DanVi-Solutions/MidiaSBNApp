import { generateQrMatrix } from "@/features/schedules/utils/qrCode";
import {
  APP_TIME_ZONE,
  MONTH_FULL_PT,
  WEEKDAY_FULL_PT,
  compareScheduleEvents,
  getTodayIsoInZone,
  getWeekdayIndex,
  parseIsoDateParts,
} from "@/features/schedules/utils/scheduleDates";

export const PLATFORM_URL = "https://midiasbn.vercel.app/";

const LOGICAL_WIDTH = 860;
const OUTER_PAD_X = 32;
const OUTER_PAD_Y = 30;
const CONTENT_WIDTH = LOGICAL_WIDTH - OUTER_PAD_X * 2;
const SCALE = 2;

const COLORS = {
  canvasBg: "#f4f1ec",
  cardBg: "#ffffff",
  cardBorder: "#e4e0d8",
  darkBg: "#1a1a1f",
  darkSurface: "#25252d",
  darkBorder: "#32323d",
  accent: "#f4543a",
  accentSoft: "#fbe0d5",
  inkPrimary: "#1a1a1f",
  inkSecondary: "#5e5b56",
  inkMuted: "#7d7973",
  inkOnDark: "#f4f1ec",
  inkOnDarkMuted: "#b7b3ab",
  rowDivider: "#efece5",
  pillBg: "#1a1a1f",
  pillText: "#f4f1ec",
  mutedPillBg: "#f2efe9",
  mutedPillBorder: "#e2ddd4",
  openRowBg: "#fff9ec",
  openRowBorder: "#e0b45c",
  openRowAccent: "#d49a2e",
  openBadgeBg: "#ffe5aa",
  openBadgeInk: "#7a4d09",
  openPillBg: "#fdf0d5",
  openPillBorder: "#ebd29a",
  openSlotBg: "#fffdf8",
  openSlotBorder: "#d49a2e",
  qrBg: "#ffffff",
};

const FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function fontSpec(weight, sizePx) {
  return `${weight} ${sizePx}px ${FONT_STACK}`;
}

function slugifyFilePart(value) {
  return (
    String(value ?? "escala")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "escala"
  );
}

function formatDayAndMonth(parts) {
  const day = String(parts.day).padStart(2, "0");
  return `${day} de ${MONTH_FULL_PT[parts.month - 1] || ""}`;
}

function formatExportPeriod(startParts, endParts) {
  const sameYear = startParts.year === endParts.year;
  const sameMonth = sameYear && startParts.month === endParts.month;

  if (sameMonth && startParts.day >= endParts.day) {
    return `${formatDayAndMonth(startParts)} de ${startParts.year}`;
  }
  if (sameMonth) {
    return `${String(startParts.day).padStart(2, "0")} a ${formatDayAndMonth(endParts)} de ${endParts.year}`;
  }
  if (sameYear) {
    return `${formatDayAndMonth(startParts)} a ${formatDayAndMonth(endParts)} de ${endParts.year}`;
  }
  return `${formatDayAndMonth(startParts)} de ${startParts.year} a ${formatDayAndMonth(endParts)} de ${endParts.year}`;
}

function endOfMonthIsoOf(parts) {
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function resolveWeekdayLabel(dateIso) {
  const parts = parseIsoDateParts(dateIso);
  if (!parts) return "";
  return WEEKDAY_FULL_PT[getWeekdayIndex(dateIso)] || "";
}

export function buildMonthlyExportPayload({
  events = [],
  scopeTitle = "Escala",
  filterHint = "",
  todayIso: todayOverride,
  lastDayIso,
} = {}) {
  const todayIso = todayOverride || getTodayIsoInZone(APP_TIME_ZONE);
  const todayParts = parseIsoDateParts(todayIso);

  if (!todayParts) {
    return {
      scopeTitle,
      filterHint,
      todayIso,
      endIso: todayIso,
      periodLabel: "",
      days: [],
      hasMultipleMinistries: false,
      totalSchedules: 0,
      openSchedulesCount: 0,
    };
  }

  const endParts = parseIsoDateParts(lastDayIso);
  const endIso = endParts && lastDayIso >= todayIso ? lastDayIso : endOfMonthIsoOf(todayParts);
  const periodLabel = formatExportPeriod(todayParts, parseIsoDateParts(endIso));

  const inRangePublished = events
    .filter(
      (ev) =>
        Boolean(ev?.published) &&
        ev?.dateIso &&
        ev.dateIso >= todayIso &&
        ev.dateIso <= endIso
    )
    .sort(compareScheduleEvents);

  const ministrySet = new Set();
  const daysMap = new Map();
  let openSchedulesCount = 0;

  for (const ev of inRangePublished) {
    if (ev.ministryName) {
      ministrySet.add(ev.ministryName);
    }

    const activeAssignments = (ev.assignments || []).filter(
      (person) => person?.name && person.changeStatus !== "DECLINED"
    );
    const assignedNames = activeAssignments.map((person) =>
      String(person.name).trim()
    );
    const declinedCount = (ev.assignments || []).filter(
      (person) => person?.changeStatus === "DECLINED"
    ).length;

    const computedFree =
      typeof ev.freeSlots === "number"
        ? ev.freeSlots
        : ev.volunteersNeeded
          ? Math.max(0, ev.volunteersNeeded - assignedNames.length)
          : 0;
    const remainingSlots = ev.selfSignup ? Math.max(0, computedFree) : 0;
    const isOpenForVolunteering = Boolean(ev.selfSignup && remainingSlots > 0);

    if (isOpenForVolunteering) {
      openSchedulesCount += 1;
    }

    if (!daysMap.has(ev.dateIso)) {
      const parts = parseIsoDateParts(ev.dateIso);
      const dateShort = parts
        ? `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`
        : ev.dateIso;
      daysMap.set(ev.dateIso, {
        dateIso: ev.dateIso,
        dateShort,
        weekdayLabel: ev.weekdayFull || resolveWeekdayLabel(ev.dateIso),
        items: [],
      });
    }

    daysMap.get(ev.dateIso).items.push({
      id: ev.id,
      time: ev.time || "--:--",
      title: ev.title || ev.name || "Evento",
      ministryName: ev.ministryName || "",
      assignedNames,
      declinedCount,
      isOpenForVolunteering,
      remainingSlots,
    });
  }

  return {
    scopeTitle: String(scopeTitle || "Escala").trim(),
    filterHint: String(filterHint || "").trim(),
    todayIso,
    endIso,
    periodLabel,
    days: [...daysMap.values()],
    hasMultipleMinistries: ministrySet.size > 1,
    totalSchedules: inRangePublished.length,
    openSchedulesCount,
  };
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, w, h, r, fillStyle) {
  drawRoundedRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(
  ctx,
  x,
  y,
  w,
  h,
  r,
  strokeStyle,
  lineWidth = 1,
  dash = []
) {
  ctx.save();
  drawRoundedRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  if (dash.length > 0) {
    ctx.setLineDash(dash);
  }
  ctx.stroke();
  ctx.restore();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function truncateText(ctx, text, maxWidth) {
  const raw = String(text ?? "");
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  const ellipsis = "…";
  let trimmed = raw;
  while (
    trimmed.length > 1 &&
    ctx.measureText(`${trimmed}${ellipsis}`).width > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}${ellipsis}`;
}

function layoutPillsRightAligned(
  ctx,
  pills,
  rightEdgeX,
  maxWidth,
  rowGap = 6,
  colGap = 6,
  pillHeight = 26
) {
  if (pills.length === 0) {
    return { placed: [], totalHeight: 0 };
  }

  const lines = [];
  let currentLine = [];
  let currentLineW = 0;

  for (const pill of pills) {
    ctx.font = fontSpec(pill.weight || 600, pill.fontSize || 12.5);
    const padX = pill.padX ?? 12;
    const width = Math.min(
      maxWidth,
      Math.ceil(ctx.measureText(pill.text).width + padX * 2)
    );
    const nextW =
      currentLine.length === 0 ? width : currentLineW + colGap + width;

    if (currentLine.length > 0 && nextW > maxWidth) {
      lines.push({ items: currentLine, totalW: currentLineW });
      currentLine = [{ ...pill, width, padX }];
      currentLineW = width;
    } else {
      currentLine.push({ ...pill, width, padX });
      currentLineW = nextW;
    }
  }

  if (currentLine.length > 0) {
    lines.push({ items: currentLine, totalW: currentLineW });
  }

  const placed = [];
  let yOffset = 0;

  for (const line of lines) {
    let cursorX = rightEdgeX - line.totalW;
    for (const pill of line.items) {
      placed.push({
        ...pill,
        x: cursorX,
        yOffset,
        height: pillHeight,
      });
      cursorX += pill.width + colGap;
    }
    yOffset += pillHeight + rowGap;
  }

  return {
    placed,
    totalHeight: lines.length * pillHeight + (lines.length - 1) * rowGap,
  };
}

function buildPillsForSchedule(item) {
  const pills = [];

  for (const fullName of item.assignedNames) {
    pills.push({
      text: fullName,
      bg: item.isOpenForVolunteering ? COLORS.openPillBg : COLORS.pillBg,
      border: item.isOpenForVolunteering ? COLORS.openPillBorder : "",
      color: item.isOpenForVolunteering ? COLORS.inkPrimary : COLORS.pillText,
      dashed: false,
      weight: 600,
      fontSize: 12.5,
      padX: 12,
    });
  }

  if (item.isOpenForVolunteering) {
    const slotText =
      item.assignedNames.length > 0
        ? `+ ${item.remainingSlots} ${
            item.remainingSlots === 1 ? "vaga aberta" : "vagas abertas"
          }`
        : `${item.remainingSlots} ${
            item.remainingSlots === 1 ? "vaga aberta" : "vagas abertas"
          }`;

    pills.push({
      text: slotText,
      bg: COLORS.openSlotBg,
      border: COLORS.openSlotBorder,
      color: COLORS.openBadgeInk,
      dashed: true,
      weight: 700,
      fontSize: 12,
      padX: 12,
    });
  } else if (pills.length === 0) {
    pills.push({
      text:
        item.declinedCount > 0
          ? "Substituição pendente"
          : "A definir",
      bg: COLORS.mutedPillBg,
      border: COLORS.mutedPillBorder,
      color: COLORS.inkMuted,
      dashed: false,
      weight: 600,
      fontSize: 12,
      padX: 12,
    });
  }

  return pills;
}

function renderScheduleDocument(ctx, payload, { draw }) {
  let y = OUTER_PAD_Y;

  // 1. Header Card
  const headerPadX = 28;
  const headerPadY = 22;
  const headerInnerW = CONTENT_WIDTH - headerPadX * 2;

  ctx.font = fontSpec(700, 26);
  const titleLines = wrapLines(
    ctx,
    `Escala - ${payload.scopeTitle}`,
    headerInnerW
  );
  const titleLineH = 32;

  ctx.font = fontSpec(600, 16);
  const periodLines = wrapLines(ctx, payload.periodLabel, headerInnerW);
  const periodLineH = 22;

  ctx.font = fontSpec(500, 13);
  const filterLines = payload.filterHint
    ? wrapLines(ctx, `Filtro aplicado: "${payload.filterHint}"`, headerInnerW)
    : [];
  const filterLineH = 18;

  const summaryChips = [
    {
      text:
        payload.totalSchedules === 1
          ? "1 escala"
          : `${payload.totalSchedules} escalas`,
      bg: COLORS.darkSurface,
      border: COLORS.darkBorder,
      color: COLORS.inkOnDark,
    },
  ];
  if (payload.openSchedulesCount > 0) {
    summaryChips.push({
      text:
        payload.openSchedulesCount === 1
          ? "1 aberta para voluntariar"
          : `${payload.openSchedulesCount} abertas para voluntariar`,
      bg: "#3b2c12",
      border: "#9c6812",
      color: "#ffd982",
    });
  }

  const headerHeight =
    headerPadY +
    18 +
    8 +
    titleLines.length * titleLineH +
    6 +
    periodLines.length * periodLineH +
    (filterLines.length > 0 ? 6 + filterLines.length * filterLineH : 0) +
    14 +
    28 +
    headerPadY;

  if (draw) {
    fillRoundedRect(
      ctx,
      OUTER_PAD_X,
      y,
      CONTENT_WIDTH,
      headerHeight,
      18,
      COLORS.darkBg
    );

    ctx.save();
    drawRoundedRectPath(ctx, OUTER_PAD_X, y, CONTENT_WIDTH, headerHeight, 18);
    ctx.clip();
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(OUTER_PAD_X, y, CONTENT_WIDTH, 5);
    ctx.restore();

    let hy = y + headerPadY;
    ctx.textBaseline = "top";
    ctx.font = fontSpec(700, 11.5);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("MÍDIA SOBRENATURAL", OUTER_PAD_X + headerPadX, hy);
    hy += 18 + 8;

    ctx.font = fontSpec(700, 26);
    ctx.fillStyle = "#ffffff";
    for (const line of titleLines) {
      ctx.fillText(line, OUTER_PAD_X + headerPadX, hy);
      hy += titleLineH;
    }
    hy += 6;

    ctx.font = fontSpec(600, 16);
    ctx.fillStyle = COLORS.inkOnDark;
    for (const line of periodLines) {
      ctx.fillText(line, OUTER_PAD_X + headerPadX, hy);
      hy += periodLineH;
    }

    if (filterLines.length > 0) {
      hy += 6;
      ctx.font = fontSpec(500, 13);
      ctx.fillStyle = COLORS.inkOnDarkMuted;
      for (const line of filterLines) {
        ctx.fillText(line, OUTER_PAD_X + headerPadX, hy);
        hy += filterLineH;
      }
    }

    hy += 14;
    let chipX = OUTER_PAD_X + headerPadX;
    for (const chip of summaryChips) {
      ctx.font = fontSpec(600, 12.5);
      const chipW = Math.ceil(ctx.measureText(chip.text).width + 24);
      fillRoundedRect(ctx, chipX, hy, chipW, 28, 999, chip.bg);
      strokeRoundedRect(ctx, chipX, hy, chipW, 28, 999, chip.border, 1);
      ctx.fillStyle = chip.color;
      ctx.textBaseline = "middle";
      ctx.fillText(chip.text, chipX + 12, hy + 14.5);
      chipX += chipW + 8;
    }
    ctx.textBaseline = "top";
  }

  y += headerHeight + 12;

  // 2. Legend strip when open-for-volunteering slots exist
  if (payload.openSchedulesCount > 0) {
    const legendHeight = 38;
    if (draw) {
      fillRoundedRect(
        ctx,
        OUTER_PAD_X,
        y,
        CONTENT_WIDTH,
        legendHeight,
        12,
        COLORS.cardBg
      );
      strokeRoundedRect(
        ctx,
        OUTER_PAD_X,
        y,
        CONTENT_WIDTH,
        legendHeight,
        12,
        COLORS.cardBorder,
        1
      );

      let lx = OUTER_PAD_X + 18;
      const ly = y + legendHeight / 2;

      fillRoundedRect(ctx, lx, ly - 6, 22, 12, 999, COLORS.darkBg);
      ctx.font = fontSpec(600, 12.5);
      ctx.fillStyle = COLORS.inkSecondary;
      ctx.textBaseline = "middle";
      ctx.fillText("Escalado", lx + 30, ly);

      lx += 30 + ctx.measureText("Escalado").width + 24;

      fillRoundedRect(ctx, lx, ly - 7, 14, 14, 4, COLORS.openRowBg);
      strokeRoundedRect(
        ctx,
        lx,
        ly - 7,
        14,
        14,
        4,
        COLORS.openRowBorder,
        1.25,
        [3, 2]
      );
      ctx.fillStyle = COLORS.openBadgeInk;
      ctx.fillText("Aberta para voluntariar", lx + 22, ly);
      ctx.textBaseline = "top";
    }
    y += legendHeight + 12;
  }

  // 3. Compact Table Date Cards (only dates with published schedules)
  const cardPadLeft = 22;
  const cardPadRight = 18;
  const cardPadTop = 13;
  const cardPadBottom = 11;
  const dayTitleLineH = 22;
  const dayDividerGap = 8;
  const innerCardW = CONTENT_WIDTH - cardPadLeft - cardPadRight;

  const rowPadX = 10;
  const rowPadY = 8;
  const timeColW = 58;
  const eventColW = 240;
  const gapTimeEvent = 12;
  const gapEventPills = 14;
  const innerRowW = innerCardW - rowPadX * 2;
  const pillsColW = innerRowW - timeColW - gapTimeEvent - eventColW - gapEventPills;

  for (const day of payload.days) {
    const rowLayouts = [];
    let rowsTotalH = 0;

    for (let i = 0; i < day.items.length; i += 1) {
      const item = day.items[i];

      ctx.font = fontSpec(600, 14);
      const titleLinesForRow = wrapLines(ctx, item.title, eventColW);
      const titleLineH = 19;
      let middleH = Math.max(1, titleLinesForRow.length) * titleLineH;

      if (payload.hasMultipleMinistries && item.ministryName) {
        middleH += 16;
      }
      if (item.isOpenForVolunteering) {
        middleH += 23;
      }

      const pills = buildPillsForSchedule(item);
      const rightEdgeLocal = innerRowW;
      const { placed, totalHeight: pillsH } = layoutPillsRightAligned(
        ctx,
        pills,
        rightEdgeLocal,
        pillsColW,
        6,
        6,
        26
      );

      const contentH = Math.max(26, middleH, pillsH);
      const rowHeight = rowPadY * 2 + contentH;

      rowLayouts.push({
        item,
        titleLines: titleLinesForRow,
        titleLineH,
        placedPills: placed,
        rowHeight,
        contentH,
      });

      rowsTotalH += rowHeight;
      if (i < day.items.length - 1) {
        rowsTotalH += item.isOpenForVolunteering || day.items[i + 1].isOpenForVolunteering ? 6 : 2;
      }
    }

    const totalDayCardH =
      cardPadTop + dayTitleLineH + dayDividerGap + 4 + rowsTotalH + cardPadBottom;

    if (draw) {
      fillRoundedRect(
        ctx,
        OUTER_PAD_X,
        y,
        CONTENT_WIDTH,
        totalDayCardH,
        14,
        COLORS.cardBg
      );
      strokeRoundedRect(
        ctx,
        OUTER_PAD_X,
        y,
        CONTENT_WIDTH,
        totalDayCardH,
        14,
        COLORS.cardBorder,
        1
      );

      // Left accent bar inside the card
      const allOpenOnDay = day.items.every((item) => item.isOpenForVolunteering);
      ctx.save();
      drawRoundedRectPath(
        ctx,
        OUTER_PAD_X,
        y,
        CONTENT_WIDTH,
        totalDayCardH,
        14
      );
      ctx.clip();
      ctx.fillStyle = allOpenOnDay ? COLORS.openRowAccent : COLORS.darkBg;
      ctx.fillRect(OUTER_PAD_X, y, 4, totalDayCardH);
      ctx.restore();

      // Compact Day Heading: "08/11  Domingo"
      const headingX = OUTER_PAD_X + cardPadLeft;
      const headingCenterY = y + cardPadTop + dayTitleLineH / 2;

      ctx.textBaseline = "middle";
      ctx.font = fontSpec(700, 15.5);
      ctx.fillStyle = COLORS.inkPrimary;
      ctx.fillText(day.dateShort, headingX, headingCenterY);

      const dateW = ctx.measureText(day.dateShort).width;
      ctx.font = fontSpec(500, 13.5);
      ctx.fillStyle = COLORS.inkSecondary;
      ctx.fillText(`  ${day.weekdayLabel}`, headingX + dateW, headingCenterY);

      // Subtle hairline below day heading
      const dividerY = y + cardPadTop + dayTitleLineH + dayDividerGap;
      ctx.strokeStyle = COLORS.rowDivider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headingX, dividerY);
      ctx.lineTo(OUTER_PAD_X + CONTENT_WIDTH - cardPadRight, dividerY);
      ctx.stroke();

      // Table Rows
      let rowY = dividerY + 4;
      const rowLeftX = headingX;

      for (let i = 0; i < rowLayouts.length; i += 1) {
        const layout = rowLayouts[i];
        const { item } = layout;

        if (item.isOpenForVolunteering) {
          fillRoundedRect(
            ctx,
            rowLeftX,
            rowY,
            innerCardW,
            layout.rowHeight,
            10,
            COLORS.openRowBg
          );
          strokeRoundedRect(
            ctx,
            rowLeftX,
            rowY,
            innerCardW,
            layout.rowHeight,
            10,
            COLORS.openRowBorder,
            1.25,
            [5, 3]
          );

          ctx.save();
          drawRoundedRectPath(
            ctx,
            rowLeftX,
            rowY,
            innerCardW,
            layout.rowHeight,
            10
          );
          ctx.clip();
          ctx.fillStyle = COLORS.openRowAccent;
          ctx.fillRect(rowLeftX, rowY, 3, layout.rowHeight);
          ctx.restore();
        } else if (
          i > 0 &&
          !day.items[i - 1].isOpenForVolunteering
        ) {
          ctx.strokeStyle = COLORS.rowDivider;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(rowLeftX + rowPadX, rowY);
          ctx.lineTo(rowLeftX + innerCardW - rowPadX, rowY);
          ctx.stroke();
        }

        const innerX = rowLeftX + rowPadX;
        const contentTopY = rowY + rowPadY;
        const firstLineCenterY = contentTopY + 13;

        // Column 1: Time
        ctx.textBaseline = "middle";
        ctx.font = fontSpec(700, 13.5);
        ctx.fillStyle = item.isOpenForVolunteering
          ? COLORS.openBadgeInk
          : COLORS.inkPrimary;
        ctx.fillText(item.time, innerX, firstLineCenterY);

        // Column 2: Event name (+ optional ministry + optional open badge)
        const eventX = innerX + timeColW + gapTimeEvent;
        ctx.textBaseline = "top";
        ctx.font = fontSpec(600, 14);
        ctx.fillStyle = COLORS.inkPrimary;
        let middleCursorY = contentTopY + 3;
        for (const line of layout.titleLines) {
          ctx.fillText(line, eventX, middleCursorY);
          middleCursorY += layout.titleLineH;
        }

        if (payload.hasMultipleMinistries && item.ministryName) {
          ctx.font = fontSpec(500, 11.5);
          ctx.fillStyle = COLORS.inkMuted;
          ctx.fillText(
            truncateText(ctx, item.ministryName, eventColW),
            eventX,
            middleCursorY
          );
          middleCursorY += 16;
        }

        if (item.isOpenForVolunteering) {
          const badgeY = middleCursorY + 2;
          const badgeText = "Aberta para voluntariar";
          ctx.font = fontSpec(700, 11);
          const badgeW = Math.ceil(ctx.measureText(badgeText).width + 16);
          fillRoundedRect(
            ctx,
            eventX,
            badgeY,
            badgeW,
            20,
            999,
            COLORS.openBadgeBg
          );
          strokeRoundedRect(
            ctx,
            eventX,
            badgeY,
            badgeW,
            20,
            999,
            COLORS.openRowBorder,
            1
          );
          ctx.fillStyle = COLORS.openBadgeInk;
          ctx.textBaseline = "middle";
          ctx.fillText(badgeText, eventX + 8, badgeY + 10);
        }

        // Column 3: Right-aligned pills (full names only + open slots)
        ctx.textBaseline = "middle";
        for (const pill of layout.placedPills) {
          const px = innerX + pill.x;
          const py = contentTopY + pill.yOffset;
          fillRoundedRect(ctx, px, py, pill.width, pill.height, 999, pill.bg);
          if (pill.border) {
            strokeRoundedRect(
              ctx,
              px,
              py,
              pill.width,
              pill.height,
              999,
              pill.border,
              1,
              pill.dashed ? [4, 3] : []
            );
          }
          ctx.font = fontSpec(pill.weight, pill.fontSize);
          ctx.fillStyle = pill.color;
          ctx.fillText(
            truncateText(ctx, pill.text, pill.width - pill.padX * 2),
            px + pill.padX,
            py + pill.height / 2 + 0.5
          );
        }

        ctx.textBaseline = "top";
        rowY +=
          layout.rowHeight +
          (i < rowLayouts.length - 1
            ? item.isOpenForVolunteering ||
              day.items[i + 1].isOpenForVolunteering
              ? 6
              : 2
            : 0);
      }
    }

    y += totalDayCardH + 10;
  }

  // 4. Footer Card with QR Code to https://midiasbn.vercel.app/
  const qrMatrix = generateQrMatrix(PLATFORM_URL);
  const qrCardSize = 128;
  const footerPadX = 26;
  const footerPadY = 20;
  const footerTextW = CONTENT_WIDTH - footerPadX * 2 - qrCardSize - 24;

  ctx.font = fontSpec(700, 17.5);
  const footerHeadingLines = wrapLines(
    ctx,
    "Acesse a plataforma para confirmar sua escala",
    footerTextW
  );
  ctx.font = fontSpec(500, 13);
  const footerDescLines = wrapLines(
    ctx,
    "Escaneie o QR Code ao lado ou acesse o link abaixo para confirmar sua presença ou se voluntariar nas vagas abertas.",
    footerTextW
  );

  const textBlockHeight =
    18 +
    6 +
    footerHeadingLines.length * 23 +
    6 +
    footerDescLines.length * 18 +
    10 +
    20;

  const footerHeight =
    footerPadY * 2 + Math.max(qrCardSize, textBlockHeight);

  if (draw) {
    y += 4;
    fillRoundedRect(
      ctx,
      OUTER_PAD_X,
      y,
      CONTENT_WIDTH,
      footerHeight,
      18,
      COLORS.darkBg
    );

    const textTopY =
      y + footerPadY + Math.max(0, (qrCardSize - textBlockHeight) / 2);
    let fy = textTopY;
    const fx = OUTER_PAD_X + footerPadX;

    ctx.textBaseline = "top";
    ctx.font = fontSpec(700, 11.5);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText("CONFIRMAÇÃO DE ESCALA", fx, fy);
    fy += 18 + 6;

    ctx.font = fontSpec(700, 17.5);
    ctx.fillStyle = "#ffffff";
    for (const line of footerHeadingLines) {
      ctx.fillText(line, fx, fy);
      fy += 23;
    }
    fy += 6;

    ctx.font = fontSpec(500, 13);
    ctx.fillStyle = COLORS.inkOnDarkMuted;
    for (const line of footerDescLines) {
      ctx.fillText(line, fx, fy);
      fy += 18;
    }
    fy += 10;

    ctx.font = fontSpec(700, 14);
    ctx.fillStyle = COLORS.accentSoft;
    ctx.fillText(PLATFORM_URL, fx, fy);

    const qrX = OUTER_PAD_X + CONTENT_WIDTH - footerPadX - qrCardSize;
    const qrY =
      y + footerPadY + Math.max(0, (textBlockHeight - qrCardSize) / 2);
    fillRoundedRect(ctx, qrX, qrY, qrCardSize, qrCardSize, 12, COLORS.qrBg);

    const quietPad = 10;
    const drawArea = qrCardSize - quietPad * 2;
    const moduleSize = Math.floor(drawArea / qrMatrix.size);
    const actualQrSize = moduleSize * qrMatrix.size;
    const qrOriginX = qrX + Math.floor((qrCardSize - actualQrSize) / 2);
    const qrOriginY = qrY + Math.floor((qrCardSize - actualQrSize) / 2);

    ctx.fillStyle = COLORS.inkPrimary;
    for (let r = 0; r < qrMatrix.size; r += 1) {
      for (let c = 0; c < qrMatrix.size; c += 1) {
        if (qrMatrix.modules[r][c]) {
          ctx.fillRect(
            qrOriginX + c * moduleSize,
            qrOriginY + r * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }
  } else {
    y += 4;
  }

  y += footerHeight + OUTER_PAD_Y;
  return y;
}

async function waitForFontsSafe() {
  if (typeof document === "undefined" || !document.fonts?.ready) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 400)),
    ]);
  } catch {
    // Ignore font readiness failure
  }
}

export async function exportMonthlySchedulePng(payload) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }

  await waitForFontsSafe();

  const canvas = document.createElement("canvas");
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) {
    throw new Error("Não foi possível inicializar a geração da imagem.");
  }

  const totalHeight = Math.ceil(
    renderScheduleDocument(measureCtx, payload, { draw: false })
  );

  canvas.width = LOGICAL_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível desenhar a imagem da escala.");
  }

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = COLORS.canvasBg;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, totalHeight);

  renderScheduleDocument(ctx, payload, { draw: true });

  const fileName = `escala-${payload.todayIso}-a-${payload.endIso}-${slugifyFilePart(payload.scopeTitle)}.png`;

  const blob = await new Promise((resolve) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((result) => resolve(result), "image/png");
    } else {
      resolve(null);
    }
  });

  if (blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  }

  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return fileName;
}
