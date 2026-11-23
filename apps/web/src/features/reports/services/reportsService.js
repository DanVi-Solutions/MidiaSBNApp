import {
  getCredentialWeeklyAvailability,
  getMyWeeklyAvailability,
  listCredentialUnavailabilities,
  listDepartmentUnavailabilities,
  listDepartmentWeeklyAvailabilities,
  listMyUnavailabilities,
} from "@/features/availability/services/availabilityService";
import { addDaysIso } from "@/features/availability/utils/calendarDates";
import {
  formatScheduleForUi,
  getScheduleById,
  getScheduleWindow,
  listMyAssignments,
  listMyChangeRequests,
  listSchedules,
} from "@/features/schedules/services/schedulesService";
import {
  APP_TIME_ZONE,
  buildIsoDateTimeInZone,
  extractDateAndTimeInZone,
  getMonthsOfWindow,
  getTodayIsoInZone,
} from "@/features/schedules/utils/scheduleDates";
import {
  CREDENTIAL_STATUS,
  getDepartmentIds,
  isAdmin,
  isAtLeast,
  resolveRoleCode,
  ROLES,
} from "@/lib/roles";

const SHORT_MONTH_LABELS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const SERIES_COLORS = [
  "#c8f03d",
  "#75ccfc",
  "#ccaafc",
  "#ffb66b",
  "#f57ea1",
  "#85e3c1",
];

function formatShortMonthPt(yearMonth) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth ?? ""));
  if (!match) return String(yearMonth ?? "");
  const idx = Number(match[2]) - 1;
  return SHORT_MONTH_LABELS_PT[idx] || yearMonth;
}

export function getReportDateRange(scheduleWindow) {
  const todayIso = getTodayIsoInZone(APP_TIME_ZONE);
  const startMonth = scheduleWindow?.cycleMonth || todayIso.slice(0, 7);
  const from =
    scheduleWindow?.purgeBefore ||
    buildIsoDateTimeInZone(`${startMonth}-01`, "00:00", APP_TIME_ZONE);
  const monthStartIso = buildIsoDateTimeInZone(
    todayIso,
    "00:00",
    APP_TIME_ZONE
  );
  const endDayIso = scheduleWindow?.lastEditableDay
    ? addDaysIso(scheduleWindow.lastEditableDay, 1)
    : addDaysIso(todayIso, 60);
  const to = buildIsoDateTimeInZone(endDayIso, "00:00", APP_TIME_ZONE);

  return { from, monthStartIso, to, todayIso };
}

export async function fetchReportDataset({ currentUser, departments = [] }) {
  const roleCode = resolveRoleCode(currentUser);
  const isVolunteer = roleCode === ROLES.VOLUNTEER;
  const userIsAdmin = isAdmin(currentUser);
  const isManagementOnly = isAtLeast(currentUser, ROLES.GENERAL_MANAGER);

  const windowRes = await getScheduleWindow();
  const scheduleWindow = windowRes.ok ? windowRes.data : null;
  const { from, monthStartIso, to } = getReportDateRange(scheduleWindow);

  if (isVolunteer) {
    const [mineRes, weekRes, unavailRes, crRes] = await Promise.all([
      listMyAssignments({ from }),
      getMyWeeklyAvailability(),
      listMyUnavailabilities({ from: monthStartIso, to }),
      listMyChangeRequests(),
    ]);

    if (!mineRes.ok && !weekRes.ok) {
      return {
        ok: false,
        error: mineRes.error || weekRes.error || "Não foi possível carregar os relatórios.",
      };
    }

    return {
      ok: true,
      data: {
        scheduleWindow,
        range: { from, monthStartIso, to },
        schedules: [],
        myAssignments:
          mineRes.ok && Array.isArray(mineRes.data) ? mineRes.data : [],
        myWeek: weekRes.ok && Array.isArray(weekRes.data) ? weekRes.data : [],
        myUnavailabilities:
          unavailRes.ok && Array.isArray(unavailRes.data) ? unavailRes.data : [],
        myChangeRequests:
          crRes.ok && crRes.data
            ? crRes.data
            : { received: [], sent: [] },
        deptAvailabilitiesByDept: {},
        deptUnavailabilitiesByDept: {},
      },
    };
  }

  const targetDeptIds = userIsAdmin
    ? departments.map((d) => d.id).filter(Boolean)
    : getDepartmentIds(currentUser);

  const [
    listRes,
    mineRes,
    myWeekRes,
    myUnavailRes,
    crRes,
    ...deptResults
  ] = await Promise.all([
    listSchedules({ from }),
    isManagementOnly
      ? Promise.resolve({ ok: true, data: [] })
      : listMyAssignments({ from }),
    isManagementOnly
      ? Promise.resolve({ ok: true, data: [] })
      : getMyWeeklyAvailability(),
    isManagementOnly
      ? Promise.resolve({ ok: true, data: [] })
      : listMyUnavailabilities({ from: monthStartIso, to }),
    isManagementOnly
      ? Promise.resolve({ ok: true, data: { received: [], sent: [] } })
      : listMyChangeRequests(),
    ...targetDeptIds.flatMap((deptId) => [
      listDepartmentWeeklyAvailabilities(deptId).then((res) => ({
        kind: "avail",
        deptId,
        res,
      })),
      listDepartmentUnavailabilities(deptId, { from: monthStartIso, to }).then(
        (res) => ({
          kind: "unavail",
          deptId,
          res,
        })
      ),
    ]),
  ]);

  if (!listRes.ok || !Array.isArray(listRes.data)) {
    return {
      ok: false,
      error: listRes.error || "Não foi possível carregar as escalas.",
    };
  }

  const hydratedRaw = await Promise.all(
    listRes.data.map(async (summary) => {
      if ((summary.assignedCount ?? 0) === 0) {
        return { ...summary, assignments: [] };
      }
      const detailRes = await getScheduleById(summary.id);
      return detailRes.ok && detailRes.data ? detailRes.data : summary;
    })
  );

  const schedules = hydratedRaw.map(formatScheduleForUi).filter(Boolean);

  const deptAvailabilitiesByDept = {};
  const deptUnavailabilitiesByDept = {};

  for (const item of deptResults) {
    if (item.kind === "avail") {
      deptAvailabilitiesByDept[item.deptId] =
        item.res.ok && Array.isArray(item.res.data) ? item.res.data : [];
    } else if (item.kind === "unavail") {
      deptUnavailabilitiesByDept[item.deptId] =
        item.res.ok && Array.isArray(item.res.data) ? item.res.data : [];
    }
  }

  return {
    ok: true,
    data: {
      scheduleWindow,
      range: { from, monthStartIso, to },
      schedules,
      myAssignments:
        mineRes.ok && Array.isArray(mineRes.data) ? mineRes.data : [],
      myWeek: myWeekRes.ok && Array.isArray(myWeekRes.data) ? myWeekRes.data : [],
      myUnavailabilities:
        myUnavailRes.ok && Array.isArray(myUnavailRes.data)
          ? myUnavailRes.data
          : [],
      myChangeRequests:
        crRes.ok && crRes.data ? crRes.data : { received: [], sent: [] },
      deptAvailabilitiesByDept,
      deptUnavailabilitiesByDept,
    },
  };
}

export async function fetchMemberReportExtras(
  credentialId,
  { from, to } = {}
) {
  if (!credentialId) {
    return { week: [], unavailabilities: [], error: "" };
  }

  const [weekRes, unavailRes] = await Promise.all([
    getCredentialWeeklyAvailability(credentialId),
    listCredentialUnavailabilities(credentialId, { from, to }),
  ]);

  if (!weekRes.ok && !unavailRes.ok) {
    return {
      week: [],
      unavailabilities: [],
      error:
        weekRes.error ||
        unavailRes.error ||
        "Não foi possível carregar a disponibilidade deste participante.",
    };
  }

  return {
    week: weekRes.ok && Array.isArray(weekRes.data) ? weekRes.data : [],
    unavailabilities:
      unavailRes.ok && Array.isArray(unavailRes.data) ? unavailRes.data : [],
    error: "",
  };
}

export function buildCycleMonths(scheduleWindow, scheduleDates = []) {
  const todayIso = getTodayIsoInZone(APP_TIME_ZONE);
  const currentMonth = todayIso.slice(0, 7);

  const monthSet = new Set();
  if (scheduleWindow?.cycleMonth && scheduleWindow?.lastEditableDay) {
    for (const ym of getMonthsOfWindow(
      buildIsoDateTimeInZone(
        `${scheduleWindow.cycleMonth}-01`,
        "00:00",
        APP_TIME_ZONE
      ),
      scheduleWindow.lastEditableDay
    )) {
      monthSet.add(ym);
    }
  } else {
    monthSet.add(currentMonth);
  }

  for (const dateIso of scheduleDates) {
    const ym = String(dateIso ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      monthSet.add(ym);
    }
  }

  return [...monthSet]
    .sort()
    .map((yearMonth) => ({
      yearMonth,
      month: formatShortMonthPt(yearMonth),
      isCurrent: yearMonth === currentMonth,
    }));
}

function scheduleFillRatio(schedule) {
  if (!schedule) return 0;
  if (schedule.selfSignup && schedule.volunteersNeeded > 0) {
    return Math.min(1, (schedule.assignedCount || 0) / schedule.volunteersNeeded);
  }
  return (schedule.assignedCount || 0) > 0 ? 1 : 0;
}

function hasAnyWeeklySlot(week = []) {
  return Array.isArray(week)
    ? week.some((day) => day?.morning || day?.afternoon || day?.night)
    : false;
}

export function computeTeamReport({
  schedules = [],
  departmentsInScope = [],
  membersInScope = [],
  deptAvailabilitiesByDept = {},
  deptUnavailabilitiesByDept = {},
  scheduleWindow = null,
  viewLabel = "Visão geral",
  mode = "all",
}) {
  const deptIdsSet = new Set(departmentsInScope.map((d) => d.id));
  const scopedSchedules = schedules.filter((s) => deptIdsSet.has(s.ministryId));

  const totalSchedules = scopedSchedules.length;
  const filledSchedules = scopedSchedules.filter(
    (s) => scheduleFillRatio(s) >= 1
  ).length;
  const coverageRate =
    totalSchedules > 0
      ? Math.round(
          (scopedSchedules.reduce((sum, s) => sum + scheduleFillRatio(s), 0) /
            totalSchedules) *
            100
        )
      : 0;

  const publishedCount = scopedSchedules.filter((s) => s.published).length;
  const draftCount = totalSchedules - publishedCount;
  const totalAssignments = scopedSchedules.reduce(
    (sum, s) => sum + (s.assignedCount || 0),
    0
  );
  const pendingChangesCount = scopedSchedules.reduce(
    (sum, s) =>
      sum +
      (s.assignments || []).filter((a) => a.changeStatus === "REQUESTED")
        .length,
    0
  );

  const visibleMemberIds = new Set(membersInScope.map((m) => m.id));
  const availabilityByMemberId = new Map();
  const unavailabilitiesCount = departmentsInScope.reduce((total, dept) => {
    const entries = deptUnavailabilitiesByDept[dept.id] || [];
    return total + entries.length;
  }, 0);

  for (const dept of departmentsInScope) {
    for (const entry of deptAvailabilitiesByDept[dept.id] || []) {
      const credId = entry?.credential?.id;
      if (!credId) continue;
      if (visibleMemberIds.size > 0 && !visibleMemberIds.has(credId)) continue;
      if (!availabilityByMemberId.has(credId)) {
        availabilityByMemberId.set(credId, entry.week || []);
      }
    }
  }

  const activeMembersCount = membersInScope.length;
  const membersWithAvailabilityCount = [...availabilityByMemberId.values()].filter(
    hasAnyWeeklySlot
  ).length;

  const months = buildCycleMonths(
    scheduleWindow,
    scopedSchedules.map((s) => s.dateIso)
  );

  const monthlyBars = months.map((m) => {
    const monthSchedules = scopedSchedules.filter((s) =>
      s.dateIso.startsWith(m.yearMonth)
    );
    const monthRate =
      monthSchedules.length > 0
        ? Math.round(
            (monthSchedules.reduce((sum, s) => sum + scheduleFillRatio(s), 0) /
              monthSchedules.length) *
              100
          )
        : 0;

    return {
      key: m.yearMonth,
      month: m.month,
      subLabel:
        monthSchedules.length > 0
          ? `${monthSchedules.length} esc.`
          : "0 esc.",
      value: monthRate,
      displayValue: `${monthRate}%`,
      highlight: m.isCurrent,
    };
  });

  let breakdownTitle = "Cobertura por ministério";
  let breakdownEyebrow = "POR MINISTÉRIO";
  let breakdownItems = [];

  if (mode === "all") {
    breakdownItems = departmentsInScope.map((dept, index) => {
      const deptSchedules = scopedSchedules.filter(
        (s) => s.ministryId === dept.id
      );
      const deptMembers = membersInScope.filter((m) =>
        m.departmentIds?.includes(dept.id)
      );
      const deptCoverage =
        deptSchedules.length > 0
          ? Math.round(
              (deptSchedules.reduce((sum, s) => sum + scheduleFillRatio(s), 0) /
                deptSchedules.length) *
                100
            )
          : 0;

      return {
        id: dept.id,
        name: dept.name,
        meta: `${deptSchedules.length} escala(s) · ${deptMembers.length} ativo(s)`,
        valueText: `${deptCoverage}%`,
        percent: deptCoverage,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      };
    });
  } else {
    breakdownEyebrow = "NO MINISTÉRIO";
    breakdownTitle = "Participação por membro";

    const countsByMember = new Map();
    for (const sched of scopedSchedules) {
      for (const asg of sched.assignments || []) {
        countsByMember.set(
          asg.memberId,
          (countsByMember.get(asg.memberId) || 0) + 1
        );
      }
    }

    const sortedMembers = [...membersInScope].sort(
      (a, b) =>
        (countsByMember.get(b.id) || 0) - (countsByMember.get(a.id) || 0) ||
        a.name.localeCompare(b.name, "pt-BR")
    );
    const maxCount = Math.max(
      1,
      ...sortedMembers.map((m) => countsByMember.get(m.id) || 0)
    );

    breakdownItems = sortedMembers.map((member, index) => {
      const count = countsByMember.get(member.id) || 0;
      const memberWeek = availabilityByMemberId.get(member.id) || [];
      const availableDays = memberWeek.filter(
        (d) => d?.morning || d?.afternoon || d?.night
      ).length;
      const percent = count > 0 ? Math.round((count / maxCount) * 100) : 0;

      return {
        id: member.id,
        name: member.name,
        meta:
          availableDays > 0
            ? `${availableDays}/7 dias disponíveis`
            : "Sem grade semanal",
        valueText: `${count} escala(s)`,
        percent,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      };
    });
  }

  return {
    kind: "team",
    viewLabel,
    primaryKpi: {
      label: "Cobertura das escalas",
      value: `${coverageRate}%`,
      detail:
        totalSchedules > 0
          ? `${filledSchedules} de ${totalSchedules} escala(s) preenchida(s) · ${publishedCount} publicada(s)`
          : "Nenhuma escala cadastrada neste filtro",
    },
    secondaryKpi: {
      label: "Participantes ativos",
      value: String(activeMembersCount),
      detail: `${membersWithAvailabilityCount} com disponibilidade semanal · ${unavailabilitiesCount} ausência(s)`,
    },
    tertiaryKpi: {
      label: "Escalas no ciclo",
      value: String(totalSchedules),
      detail:
        totalSchedules > 0
          ? `${totalAssignments} escalação(ões) · ${draftCount} rascunho(s) · ${pendingChangesCount} troca(s)`
          : "Nenhuma escala no período",
    },
    chartEyebrow: "POR MÊS DO CICLO",
    chartTitle: "Cobertura das escalas",
    monthlyBars,
    breakdownEyebrow,
    breakdownTitle,
    breakdownItems,
  };
}

export function computeMemberReport({
  member,
  schedules = [],
  myAssignments = [],
  week = [],
  unavailabilities = [],
  scheduleWindow = null,
  viewLabel,
  isSelf = false,
  isVolunteer = false,
}) {
  const nowMs = Date.now();
  const normalizedAssignments = [];

  if (isVolunteer) {
    for (const item of myAssignments) {
      if (!item?.schedule?.scheduleAt) continue;
      const { dateIso } = extractDateAndTimeInZone(
        item.schedule.scheduleAt,
        APP_TIME_ZONE
      );
      normalizedAssignments.push({
        scheduleId: item.schedule.id,
        scheduleAt: item.schedule.scheduleAt,
        dateIso,
        ministryName: item.schedule.department?.name || "Ministério",
        changeStatus: item.changeStatus || "NONE",
      });
    }
  } else {
    const seenScheduleIds = new Set();
    for (const sched of schedules) {
      const match = (sched.assignments || []).find(
        (a) => a.memberId === member?.id
      );
      if (!match) continue;
      seenScheduleIds.add(sched.id);
      normalizedAssignments.push({
        scheduleId: sched.id,
        scheduleAt: sched.scheduleAt,
        dateIso: sched.dateIso,
        ministryName: sched.ministryName,
        changeStatus: match.changeStatus || "NONE",
      });
    }

    if (isSelf) {
      for (const item of myAssignments) {
        if (!item?.schedule?.id || seenScheduleIds.has(item.schedule.id)) {
          continue;
        }
        const { dateIso } = extractDateAndTimeInZone(
          item.schedule.scheduleAt,
          APP_TIME_ZONE
        );
        normalizedAssignments.push({
          scheduleId: item.schedule.id,
          scheduleAt: item.schedule.scheduleAt,
          dateIso,
          ministryName: item.schedule.department?.name || "Ministério",
          changeStatus: item.changeStatus || "NONE",
        });
      }
    }
  }

  const totalAssignments = normalizedAssignments.length;
  const confirmedCount = normalizedAssignments.filter(
    (a) => a.changeStatus !== "REQUESTED" && a.changeStatus !== "REJECTED"
  ).length;
  const pendingChangeCount = normalizedAssignments.filter(
    (a) => a.changeStatus === "REQUESTED"
  ).length;
  const confirmationRate =
    totalAssignments > 0
      ? Math.round((confirmedCount / totalAssignments) * 100)
      : 0;

  const upcomingCount = normalizedAssignments.filter(
    (a) => new Date(a.scheduleAt).getTime() >= nowMs
  ).length;
  const pastCount = totalAssignments - upcomingCount;

  const daysList = Array.isArray(week) ? week : [];
  const morningDays = daysList.filter((d) => d?.morning).length;
  const afternoonDays = daysList.filter((d) => d?.afternoon).length;
  const nightDays = daysList.filter((d) => d?.night).length;
  const availableDays = daysList.filter(
    (d) => d?.morning || d?.afternoon || d?.night
  ).length;
  const availableSlots = morningDays + afternoonDays + nightDays;

  const months = buildCycleMonths(
    scheduleWindow,
    normalizedAssignments.map((a) => a.dateIso)
  );
  const countsByMonth = months.map(
    (m) =>
      normalizedAssignments.filter((a) => a.dateIso.startsWith(m.yearMonth))
        .length
  );
  const maxMonthCount = Math.max(1, ...countsByMonth);

  const monthlyBars = months.map((m, idx) => {
    const count = countsByMonth[idx];
    return {
      key: m.yearMonth,
      month: m.month,
      subLabel: count === 1 ? "1 esc." : `${count} esc.`,
      value: count > 0 ? Math.round((count / maxMonthCount) * 100) : 0,
      displayValue: String(count),
      highlight: m.isCurrent,
    };
  });

  const breakdownItems = [
    {
      id: "morning",
      name: "Manhã (00h–12h)",
      meta: "Disponibilidade semanal",
      valueText: `${morningDays}/7 dias`,
      percent: Math.round((morningDays / 7) * 100),
      color: "#c8f03d",
    },
    {
      id: "afternoon",
      name: "Tarde (12h–18h)",
      meta: "Disponibilidade semanal",
      valueText: `${afternoonDays}/7 dias`,
      percent: Math.round((afternoonDays / 7) * 100),
      color: "#75ccfc",
    },
    {
      id: "night",
      name: "Noite (18h–00h)",
      meta: "Disponibilidade semanal",
      valueText: `${nightDays}/7 dias`,
      percent: Math.round((nightDays / 7) * 100),
      color: "#ccaafc",
    },
  ];

  return {
    kind: "member",
    viewLabel: viewLabel || member?.name || "Meu relatório",
    primaryKpi: {
      label: "Taxa de confirmação",
      value: `${confirmationRate}%`,
      detail:
        totalAssignments > 0
          ? `${confirmedCount} de ${totalAssignments} escala(s) confirmada(s)${
              pendingChangeCount > 0
                ? ` · ${pendingChangeCount} troca(s) pendente(s)`
                : ""
            }`
          : "Nenhuma escala atribuída neste período",
    },
    secondaryKpi: {
      label: "Disponibilidade semanal",
      value: `${availableSlots}/21`,
      detail: `${availableDays} de 7 dia(s) · ${unavailabilities.length} ausência(s) registrada(s)`,
    },
    tertiaryKpi: {
      label: "Escalas no ciclo",
      value: String(totalAssignments),
      detail:
        totalAssignments > 0
          ? `${upcomingCount} próxima(s) · ${pastCount} realizada(s)`
          : "Aguardando novas escalas",
    },
    chartEyebrow: "POR MÊS DO CICLO",
    chartTitle: "Escalas por mês",
    monthlyBars,
    breakdownEyebrow: "DISPONIBILIDADE",
    breakdownTitle: "Turnos semanais",
    breakdownItems,
  };
}

export function isActiveReportMember(person) {
  if (!person || isAtLeast(person, ROLES.GENERAL_MANAGER)) return false;
  return (
    person.status === CREDENTIAL_STATUS.ACTIVE ||
    person.status === CREDENTIAL_STATUS.RECOVERING
  );
}
