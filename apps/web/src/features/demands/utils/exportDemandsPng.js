import { PLATFORM_URL } from "@/features/schedules/utils/exportSchedulePng";
import { generateQrMatrix } from "@/features/schedules/utils/qrCode";
import {
  APP_TIME_ZONE,
  MONTH_FULL_PT,
  WEEKDAY_FULL_PT,
  extractDateAndTimeInZone,
  getTodayIsoInZone,
  getWeekdayIndex,
  parseIsoDateParts,
} from "@/features/schedules/utils/scheduleDates";

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
  completedAccent: "#1f7a4c",
  completedBadgeBg: "#e3f5ea",
  completedBadgeBorder: "#a7dec0",
  completedBadgeInk: "#1b6e42",
  completedDarkChipBg: "#163325",
  completedDarkChipBorder: "#2d6a4f",
  completedDarkChipText: "#8ce2b5",
  overdueInk: "#b42318",
  qrBg: "#ffffff",
};

const FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const STATUS_LABELS = {
  ALL: "Todas",
  IN_PROGRESS: "Em progresso",
  COMPLETED: "Finalizadas",
};

function fontSpec(weight, sizePx) {
  return `${weight} ${sizePx}px ${FONT_STACK}`;
}

function slugifyFilePart(value, fallback = "demandas") {
  return (
    String(value ?? fallback)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

function formatDayAndMonth(parts) {
  const day = String(parts.day).padStart(2, "0");
  return `${day} de ${MONTH_FULL_PT[parts.month - 1] || ""}`;
}

function formatExportPeriod(startParts, endParts) {
  if (!startParts || !endParts) return "";

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

function resolveWeekdayLabel(dateIso) {
  const parts = parseIsoDateParts(dateIso);
  if (!parts) return "";
  return WEEKDAY_FULL_PT[getWeekdayIndex(dateIso)] || "";
}

function formatDeadlineDate(dueDateIso, referenceYear) {
  const parts = parseIsoDateParts(dueDateIso);
  if (!parts) return "";
  const day = String(parts.day).padStart(2, "0");
  const month = String(parts.month).padStart(2, "0");
  if (referenceYear && parts.year !== referenceYear) {
    return `${day}/${month}/${parts.year}`;
  }
  return `${day}/${month}`;
}

export function buildDemandsExportPayload({
  demands = [],
  scopeTitle = "Demandas",
  statusFilter = "ALL",
  filterHint = "",
  todayIso: todayOverride,
} = {}) {
  const todayIso = todayOverride || getTodayIsoInZone(APP_TIME_ZONE);
  const todayParts = parseIsoDateParts(todayIso);
  const referenceYear = todayParts?.year;

  const ministrySet = new Set();
  const daysMap = new Map();
  let inProgressCount = 0;
  let completedCount = 0;

  for (const demand of Array.isArray(demands) ? demands : []) {
    if (!demand) continue;

    const ministryName = String(demand.department?.name || "").trim();
    if (ministryName) {
      ministrySet.add(ministryName);
    }

    const extractedCreated = demand.createdAt
      ? extractDateAndTimeInZone(demand.createdAt, APP_TIME_ZONE).dateIso
      : "";
    const createdDateIso = parseIsoDateParts(extractedCreated)
      ? extractedCreated
      : todayIso;

    const extractedDue = demand.dueAt
      ? extractDateAndTimeInZone(demand.dueAt, APP_TIME_ZONE).dateIso
      : "";
    const dueDateIso = parseIsoDateParts(extractedDue) ? extractedDue : "";
    const dueDateLabel = dueDateIso
      ? formatDeadlineDate(dueDateIso, referenceYear)
      : "Sem prazo";

    const isCompleted = demand.status === "COMPLETED";
    if (isCompleted) {
      completedCount += 1;
    } else {
      inProgressCount += 1;
    }

    const isOverdue = !isCompleted && Boolean(dueDateIso) && dueDateIso < todayIso;

    const assigneeNames = (Array.isArray(demand.assignees) ? demand.assignees : [])
      .filter((person) => person?.name && person.role !== "DEVELOPER")
      .map((person) => String(person.name).trim())
      .filter(Boolean);

    if (!daysMap.has(createdDateIso)) {
      const parts = parseIsoDateParts(createdDateIso);
      const dateShort = parts
        ? `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}`
        : createdDateIso;
      daysMap.set(createdDateIso, {
        dateIso: createdDateIso,
        dateShort,
        weekdayLabel: resolveWeekdayLabel(createdDateIso),
        items: [],
      });
    }

    daysMap.get(createdDateIso).items.push({
      id: demand.id,
      title: String(demand.title || "Demanda").trim(),
      ministryName,
      dueDateIso,
      dueDateLabel,
      isCompleted,
      isOverdue,
      assigneeNames,
    });
  }

  const days = [...daysMap.values()].sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso)
  );

  for (const day of days) {
    day.items.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) {
        return Number(a.isCompleted) - Number(b.isCompleted);
      }
      const dueCmp = (a.dueDateIso || "9999-12-31").localeCompare(
        b.dueDateIso || "9999-12-31"
      );
      if (dueCmp !== 0) return dueCmp;
      return a.title.localeCompare(b.title, "pt-BR");
    });
  }

  const firstParts =
    days.length > 0 ? parseIsoDateParts(days[0].dateIso) : todayParts;
  const lastParts =
    days.length > 0
      ? parseIsoDateParts(days[days.length - 1].dateIso)
      : todayParts;

  const periodLabel = formatExportPeriod(firstParts, lastParts);
  const normalizedStatus = STATUS_LABELS[statusFilter] ? statusFilter : "ALL";

  return {
    scopeTitle: String(scopeTitle || "Demandas").trim(),
    statusFilter: normalizedStatus,
    statusLabel: STATUS_LABELS[normalizedStatus],
    filterHint: String(filterHint || "").trim(),
    todayIso,
    periodLabel,
    days,
    hasMultipleMinistries: ministrySet.size > 1,
    totalDemands: inProgressCount + completedCount,
    inProgressCount,
    completedCount,
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

function buildPillsForDemand(item) {
  if (item.assigneeNames.length === 0) {
    return [
      {
        text: "Sem responsável",
        bg: COLORS.mutedPillBg,
        border: COLORS.mutedPillBorder,
        color: COLORS.inkMuted,
        weight: 600,
        fontSize: 12,
        padX: 12,
      },
    ];
  }

  return item.assigneeNames.map((fullName) => ({
    text: fullName,
    bg: COLORS.pillBg,
    border: "",
    color: COLORS.pillText,
    weight: 600,
    fontSize: 12.5,
    padX: 12,
  }));
}

function renderDemandsDocument(ctx, payload, { draw }) {
  let y = OUTER_PAD_Y;

  // 1. Header Card
  const headerPadX = 28;
  const headerPadY = 22;
  const headerInnerW = CONTENT_WIDTH - headerPadX * 2;

  ctx.font = fontSpec(700, 26);
  const titleLines = wrapLines(
    ctx,
    `Demandas - ${payload.scopeTitle}`,
    headerInnerW
  );
  const titleLineH = 32;

  const periodStatusText =
    payload.statusFilter !== "ALL"
      ? payload.periodLabel
        ? `${payload.periodLabel}  ·  Status: ${payload.statusLabel}`
        : `Status: ${payload.statusLabel}`
      : payload.periodLabel;

  ctx.font = fontSpec(600, 16);
  const periodLines = periodStatusText
    ? wrapLines(ctx, periodStatusText, headerInnerW)
    : [];
  const periodLineH = 22;

  ctx.font = fontSpec(500, 13);
  const filterLines = payload.filterHint
    ? wrapLines(ctx, `Busca aplicada: "${payload.filterHint}"`, headerInnerW)
    : [];
  const filterLineH = 18;

  const summaryChips = [
    {
      text:
        payload.totalDemands === 1
          ? "1 demanda"
          : `${payload.totalDemands} demandas`,
      bg: COLORS.darkSurface,
      border: COLORS.darkBorder,
      color: COLORS.inkOnDark,
    },
  ];

  if (
    payload.inProgressCount > 0 &&
    (payload.statusFilter === "ALL" || payload.completedCount > 0)
  ) {
    summaryChips.push({
      text: `${payload.inProgressCount} em progresso`,
      bg: COLORS.darkSurface,
      border: COLORS.darkBorder,
      color: COLORS.inkOnDarkMuted,
    });
  }

  if (payload.completedCount > 0) {
    summaryChips.push({
      text:
        payload.completedCount === 1
          ? "1 finalizada"
          : `${payload.completedCount} finalizadas`,
      bg: COLORS.completedDarkChipBg,
      border: COLORS.completedDarkChipBorder,
      color: COLORS.completedDarkChipText,
    });
  }

  const headerHeight =
    headerPadY +
    18 +
    8 +
    titleLines.length * titleLineH +
    (periodLines.length > 0 ? 6 + periodLines.length * periodLineH : 0) +
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

    if (periodLines.length > 0) {
      hy += 6;
      ctx.font = fontSpec(600, 16);
      ctx.fillStyle = COLORS.inkOnDark;
      for (const line of periodLines) {
        ctx.fillText(line, OUTER_PAD_X + headerPadX, hy);
        hy += periodLineH;
      }
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

  // 2. Date Cards (grouped by demand creation date + weekday)
  const cardPadLeft = 22;
  const cardPadRight = 18;
  const cardPadTop = 13;
  const cardPadBottom = 11;
  const dayTitleLineH = 22;
  const dayDividerGap = 8;
  const innerCardW = CONTENT_WIDTH - cardPadLeft - cardPadRight;

  const rowPadX = 10;
  const rowPadY = 8;
  const deadlineColW = 86;
  const titleColW = 252;
  const gapDeadlineTitle = 12;
  const gapTitlePills = 14;
  const innerRowW = innerCardW - rowPadX * 2;
  const pillsColW =
    innerRowW - deadlineColW - gapDeadlineTitle - titleColW - gapTitlePills;

  for (const day of payload.days) {
    const rowLayouts = [];
    let rowsTotalH = 0;

    for (let i = 0; i < day.items.length; i += 1) {
      const item = day.items[i];

      ctx.font = fontSpec(600, 14);
      const titleLinesForRow = wrapLines(ctx, item.title, titleColW);
      const titleLineH = 19;
      let middleH = Math.max(1, titleLinesForRow.length) * titleLineH;

      if (payload.hasMultipleMinistries && item.ministryName) {
        middleH += 16;
      }

      // Status pill below demand title
      middleH += 25;

      const pills = buildPillsForDemand(item);
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

      const deadlineMinH = item.dueDateIso ? 30 : 26;
      const contentH = Math.max(deadlineMinH, middleH, pillsH);
      const rowHeight = rowPadY * 2 + contentH;

      rowLayouts.push({
        item,
        titleLines: titleLinesForRow,
        titleLineH,
        placedPills: placed,
        rowHeight,
      });

      rowsTotalH += rowHeight;
      if (i < day.items.length - 1) {
        rowsTotalH += 2;
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

      const allCompletedOnDay =
        day.items.length > 0 && day.items.every((item) => item.isCompleted);

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
      ctx.fillStyle = allCompletedOnDay ? COLORS.completedAccent : COLORS.darkBg;
      ctx.fillRect(OUTER_PAD_X, y, 4, totalDayCardH);
      ctx.restore();

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

      const dividerY = y + cardPadTop + dayTitleLineH + dayDividerGap;
      ctx.strokeStyle = COLORS.rowDivider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(headingX, dividerY);
      ctx.lineTo(OUTER_PAD_X + CONTENT_WIDTH - cardPadRight, dividerY);
      ctx.stroke();

      let rowY = dividerY + 4;
      const rowLeftX = headingX;

      for (let i = 0; i < rowLayouts.length; i += 1) {
        const layout = rowLayouts[i];
        const { item } = layout;

        if (i > 0) {
          ctx.strokeStyle = COLORS.rowDivider;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(rowLeftX + rowPadX, rowY);
          ctx.lineTo(rowLeftX + innerCardW - rowPadX, rowY);
          ctx.stroke();
        }

        const innerX = rowLeftX + rowPadX;
        const contentTopY = rowY + rowPadY;

        // Column 1: Deadline date
        if (item.dueDateIso) {
          ctx.textBaseline = "top";
          ctx.font = fontSpec(700, 9.5);
          ctx.fillStyle = item.isOverdue ? COLORS.overdueInk : COLORS.inkMuted;
          ctx.fillText(
            item.isOverdue ? "ATRASADA" : "PRAZO",
            innerX,
            contentTopY + 1
          );

          ctx.font = fontSpec(700, 13.5);
          ctx.fillStyle = item.isOverdue
            ? COLORS.overdueInk
            : COLORS.inkPrimary;
          ctx.fillText(item.dueDateLabel, innerX, contentTopY + 14);
        } else {
          ctx.textBaseline = "middle";
          ctx.font = fontSpec(600, 12);
          ctx.fillStyle = COLORS.inkMuted;
          ctx.fillText("Sem prazo", innerX, contentTopY + 13);
        }

        // Column 2: Demand title (+ optional ministry + status pill)
        const titleX = innerX + deadlineColW + gapDeadlineTitle;
        ctx.textBaseline = "top";
        ctx.font = fontSpec(600, 14);
        ctx.fillStyle = COLORS.inkPrimary;
        let middleCursorY = contentTopY + 3;
        for (const line of layout.titleLines) {
          ctx.fillText(line, titleX, middleCursorY);
          middleCursorY += layout.titleLineH;
        }

        if (payload.hasMultipleMinistries && item.ministryName) {
          ctx.font = fontSpec(500, 11.5);
          ctx.fillStyle = COLORS.inkMuted;
          ctx.fillText(
            truncateText(ctx, item.ministryName, titleColW),
            titleX,
            middleCursorY
          );
          middleCursorY += 16;
        }

        const badgeY = middleCursorY + 3;
        const badgeText = item.isCompleted ? "Finalizada" : "Em progresso";
        ctx.font = fontSpec(700, 11);
        const badgeW = Math.ceil(ctx.measureText(badgeText).width + 16);
        fillRoundedRect(
          ctx,
          titleX,
          badgeY,
          badgeW,
          20,
          999,
          item.isCompleted ? COLORS.completedBadgeBg : COLORS.mutedPillBg
        );
        strokeRoundedRect(
          ctx,
          titleX,
          badgeY,
          badgeW,
          20,
          999,
          item.isCompleted ? COLORS.completedBadgeBorder : COLORS.mutedPillBorder,
          1
        );
        ctx.fillStyle = item.isCompleted
          ? COLORS.completedBadgeInk
          : COLORS.inkSecondary;
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, titleX + 8, badgeY + 10.5);

        // Column 3: Assignees right-aligned pills
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
              1
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
        rowY += layout.rowHeight + (i < rowLayouts.length - 1 ? 2 : 0);
      }
    }

    y += totalDayCardH + 10;
  }

  // 3. Footer Card with QR Code
  const qrMatrix = generateQrMatrix(PLATFORM_URL);
  const qrCardSize = 128;
  const footerPadX = 26;
  const footerPadY = 20;
  const footerTextW = CONTENT_WIDTH - footerPadX * 2 - qrCardSize - 24;

  ctx.font = fontSpec(700, 17.5);
  const footerHeadingLines = wrapLines(
    ctx,
    "Acesse a plataforma para acompanhar as demandas",
    footerTextW
  );
  ctx.font = fontSpec(500, 13);
  const footerDescLines = wrapLines(
    ctx,
    "Escaneie o QR Code ao lado ou acesse o link abaixo para ver detalhes, atualizar prazos ou finalizar suas entregas.",
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
    ctx.fillText("PAINEL DE DEMANDAS", fx, fy);
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

export async function exportDemandsPng(payload) {
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
    renderDemandsDocument(measureCtx, payload, { draw: false })
  );

  canvas.width = LOGICAL_WIDTH * SCALE;
  canvas.height = totalHeight * SCALE;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível desenhar a imagem das demandas.");
  }

  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = COLORS.canvasBg;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, totalHeight);

  renderDemandsDocument(ctx, payload, { draw: true });

  const statusSuffix =
    payload.statusFilter && payload.statusFilter !== "ALL"
      ? `-${slugifyFilePart(payload.statusLabel)}`
      : "";
  const fileName = `demandas-${payload.todayIso}-${slugifyFilePart(payload.scopeTitle)}${statusSuffix}.png`;

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
