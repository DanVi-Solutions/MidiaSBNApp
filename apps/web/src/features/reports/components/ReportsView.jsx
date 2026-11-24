"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  FilterIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  computeMemberReport,
  computeTeamReport,
  fetchMemberReportExtras,
  fetchReportDataset,
  getReportDateRange,
  isActiveReportMember,
} from "@/features/reports/services/reportsService";
import {
  canViewParticipant,
  getDepartmentIds,
  isAdmin,
  isAtLeast,
  resolveRoleCode,
  ROLES,
} from "@/lib/roles";
import styles from "./ReportsView.module.css";

function buildCsvSummary(report) {
  const lines = [
    ["Indicador", "Valor", "Detalhe"],
    ["Visualização", report.viewLabel, ""],
    [report.primaryKpi.label, report.primaryKpi.value, report.primaryKpi.detail],
    [
      report.secondaryKpi.label,
      report.secondaryKpi.value,
      report.secondaryKpi.detail,
    ],
    [
      report.tertiaryKpi.label,
      report.tertiaryKpi.value,
      report.tertiaryKpi.detail,
    ],
    [],
    ["Mês", report.kind === "member" ? "Escalas" : "Cobertura (%)", "Resumo"],
    ...report.monthlyBars.map((item) => [
      item.month,
      item.displayValue,
      item.subLabel,
    ]),
    [],
    [report.breakdownTitle, "Valor", "Detalhe"],
    ...report.breakdownItems.map((item) => [
      item.name,
      item.valueText,
      item.meta || "",
    ]),
  ];

  return lines
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")
    )
    .join("\r\n");
}

function slugifyFilePart(value) {
  return (
    String(value ?? "geral")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "geral"
  );
}

export function ReportsView() {
  const {
    currentUser,
    activeMinistry,
    departments,
    participants,
    schedulesVersion,
  } = usePrivateWorkspace();
  const toast = useToast();

  const filterSelectId = useId();
  const secondarySelectId = useId();
  const teamChartTitleId = useId();
  const coverageTitleId = useId();
  const announceTimerRef = useRef(null);
  const memberPickerRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const lastDatasetJsonRef = useRef("");

  const roleCode = resolveRoleCode(currentUser);
  const userIsAdmin = isAdmin(currentUser);
  const isVolunteer = roleCode === ROLES.VOLUNTEER;
  const isGeneralManager = roleCode === ROLES.GENERAL_MANAGER;
  const isManagementOnly = isAtLeast(currentUser, ROLES.GENERAL_MANAGER);
  const userDepartmentIds = useMemo(
    () => getDepartmentIds(currentUser),
    [currentUser]
  );

  const myDepartments = useMemo(() => {
    if (userIsAdmin) return departments;
    const allowed = new Set(userDepartmentIds);
    const matched = departments.filter((dept) => allowed.has(dept.id));
    if (matched.length > 0) return matched;
    return Array.isArray(currentUser.departments)
      ? currentUser.departments
      : [];
  }, [currentUser.departments, departments, userDepartmentIds, userIsAdmin]);

  const activeDepartment = useMemo(() => {
    if (!myDepartments.length) return null;
    if (activeMinistry?.id && !activeMinistry.isGlobal) {
      const matched = myDepartments.find(
        (dept) => dept.id === activeMinistry.id
      );
      if (matched) return matched;
    }
    return myDepartments[0];
  }, [activeMinistry, myDepartments]);

  const departmentsKey = useMemo(
    () => myDepartments.map((d) => d.id).join(","),
    [myDepartments]
  );

  const [dataset, setDataset] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [memberExtrasById, setMemberExtrasById] = useState({});
  const [selectedScope, setSelectedScope] = useState("");
  const [selectedMinistryId, setSelectedMinistryId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [isMemberPickerOpen, setIsMemberPickerOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  useEffect(() => {
    if (!isMemberPickerOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        memberPickerRef.current &&
        !memberPickerRef.current.contains(event.target)
      ) {
        setIsMemberPickerOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMemberPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMemberPickerOpen]);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  const announce = useCallback((message) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    setLiveAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setLiveAnnouncement(message);
    }, 200);
  }, []);

  useEffect(() => {
    let active = true;
    const seq = ++fetchSeqRef.current;

    fetchReportDataset({
      currentUser,
      departments,
    }).then((res) => {
      if (!active || seq !== fetchSeqRef.current) return;
      setIsLoading(false);
      if (!res.ok) {
        if (!hasLoadedRef.current) {
          setLoadError(
            res.error || "Não foi possível carregar os dados dos relatórios."
          );
        }
        return;
      }
      hasLoadedRef.current = true;
      setLoadError("");
      const nextJson = JSON.stringify(res.data);
      if (nextJson !== lastDatasetJsonRef.current) {
        lastDatasetJsonRef.current = nextJson;
        setDataset(res.data);
        setMemberExtrasById({});
      }
    });

    return () => {
      active = false;
    };
  }, [
    currentUser,
    departments,
    departmentsKey,
    roleCode,
    schedulesVersion,
  ]);

  const handleRetry = () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setLoadError("");
    fetchReportDataset({
      currentUser,
      departments,
    }).then((res) => {
      if (seq !== fetchSeqRef.current) return;
      setIsLoading(false);
      if (!res.ok) {
        setLoadError(
          res.error || "Não foi possível carregar os dados dos relatórios."
        );
        return;
      }
      hasLoadedRef.current = true;
      setLoadError("");
      lastDatasetJsonRef.current = JSON.stringify(res.data);
      setDataset(res.data);
      setMemberExtrasById({});
    });
  };

  const visibleTeamMembers = useMemo(() => {
    const allowedDepts = new Set(myDepartments.map((d) => d.id));
    return participants.filter((person) => {
      if (!isActiveReportMember(person)) return false;
      if (!canViewParticipant(currentUser, person)) return false;
      if (userIsAdmin) return true;
      return person.departmentIds?.some((id) => allowedDepts.has(id));
    });
  }, [currentUser, myDepartments, participants, userIsAdmin]);

  const selectableMembers = useMemo(() => {
    const nonLeadershipMembers = visibleTeamMembers.filter(
      (person) => !isAtLeast(person, ROLES.GENERAL_MANAGER)
    );
    if (isGeneralManager && activeDepartment?.id) {
      return [...nonLeadershipMembers].sort((a, b) => {
        const aActive = a.departmentIds?.includes(activeDepartment.id) ? 0 : 1;
        const bActive = b.departmentIds?.includes(activeDepartment.id) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return a.name.localeCompare(b.name, "pt-BR");
      });
    }
    if (isManagementOnly) {
      return nonLeadershipMembers;
    }
    return nonLeadershipMembers.filter(
      (person) => person.id !== currentUser.id
    );
  }, [
    activeDepartment,
    currentUser.id,
    isGeneralManager,
    isManagementOnly,
    visibleTeamMembers,
  ]);

  const scopeOptions = useMemo(() => {
    if (isVolunteer) {
      return [{ id: "me", label: "Meu relatório" }];
    }

    if (userIsAdmin) {
      const options = [{ id: "all", label: "Visão geral — Todos os ministérios" }];
      if (myDepartments.length > 0) {
        options.push({ id: "ministry", label: "Ministério específico" });
      }
      if (selectableMembers.length > 0) {
        options.push({ id: "member", label: "Membro específico" });
      }
      return options;
    }

    if (isGeneralManager) {
      const options = [];
      if (activeDepartment) {
        options.push({
          id: "ministry",
          label: `Visão geral — ${activeDepartment.name}`,
        });
      }
      if (myDepartments.length > 1) {
        options.push({
          id: "all",
          label: "Visão geral — Todos os meus ministérios",
        });
      }
      if (selectableMembers.length > 0) {
        options.push({ id: "member", label: "Membro específico" });
      }
      return options.length > 0
        ? options
        : [{ id: "all", label: "Visão geral — Todos os meus ministérios" }];
    }

    const options = [];
    if (myDepartments.length > 1) {
      options.push({ id: "all", label: "Visão geral — Meus ministérios" });
      options.push({ id: "ministry", label: "Ministério específico" });
    } else if (myDepartments.length === 1) {
      options.push({
        id: "ministry",
        label: `Visão geral — ${myDepartments[0].name}`,
      });
    }

    if (!isManagementOnly) {
      options.push({ id: "me", label: "Meu relatório" });
    }

    if (selectableMembers.length > 0) {
      options.push({ id: "member", label: "Membro específico" });
    }

    return options;
  }, [
    activeDepartment,
    isGeneralManager,
    isManagementOnly,
    isVolunteer,
    myDepartments,
    selectableMembers.length,
    userIsAdmin,
  ]);

  const effectiveScope = useMemo(() => {
    if (scopeOptions.some((opt) => opt.id === selectedScope)) {
      return selectedScope;
    }
    return scopeOptions[0]?.id || "me";
  }, [scopeOptions, selectedScope]);

  const effectiveMinistryId = useMemo(() => {
    if (isGeneralManager) {
      return activeDepartment?.id || "";
    }
    if (myDepartments.some((d) => d.id === selectedMinistryId)) {
      return selectedMinistryId;
    }
    return myDepartments[0]?.id || "";
  }, [
    activeDepartment?.id,
    isGeneralManager,
    myDepartments,
    selectedMinistryId,
  ]);

  const effectiveMemberId = useMemo(() => {
    if (selectableMembers.some((m) => m.id === selectedMemberId)) {
      return selectedMemberId;
    }
    return selectableMembers[0]?.id || "";
  }, [selectableMembers, selectedMemberId]);

  const selectedMember = useMemo(
    () =>
      selectableMembers.find((member) => member.id === effectiveMemberId) ||
      null,
    [effectiveMemberId, selectableMembers]
  );

  useEffect(() => {
    if (
      isVolunteer ||
      effectiveScope !== "member" ||
      !effectiveMemberId ||
      effectiveMemberId === currentUser.id ||
      memberExtrasById[effectiveMemberId]
    ) {
      return undefined;
    }

    let active = true;
    const range =
      dataset?.range || getReportDateRange(dataset?.scheduleWindow || null);

    fetchMemberReportExtras(effectiveMemberId, {
      from: range.monthStartIso,
      to: range.to,
    }).then((extras) => {
      if (!active) return;
      setMemberExtrasById((prev) => ({
        ...prev,
        [effectiveMemberId]: extras,
      }));
    });

    return () => {
      active = false;
    };
  }, [
    currentUser.id,
    dataset,
    effectiveMemberId,
    effectiveScope,
    isVolunteer,
    memberExtrasById,
  ]);

  const isLoadingMemberExtras = Boolean(
    !isVolunteer &&
      effectiveScope === "member" &&
      effectiveMemberId &&
      effectiveMemberId !== currentUser.id &&
      !memberExtrasById[effectiveMemberId]
  );

  const selectedMemberExtras =
    effectiveScope === "member" && effectiveMemberId
      ? memberExtrasById[effectiveMemberId] || null
      : null;

  const report = useMemo(() => {
    if (!dataset) return null;

    if (effectiveScope === "me") {
      return computeMemberReport({
        member: currentUser,
        schedules: dataset.schedules,
        myAssignments: dataset.myAssignments,
        week: dataset.myWeek,
        unavailabilities: dataset.myUnavailabilities,
        scheduleWindow: dataset.scheduleWindow,
        viewLabel: `Meu relatório (${currentUser.name})`,
        isSelf: true,
        isVolunteer,
      });
    }

    if (effectiveScope === "member") {
      const targetMember =
        selectableMembers.find((m) => m.id === effectiveMemberId) ||
        currentUser;
      const isSelf = targetMember.id === currentUser.id;
      const extras = isSelf ? null : memberExtrasById[targetMember.id];

      return computeMemberReport({
        member: targetMember,
        schedules: dataset.schedules,
        myAssignments: isSelf ? dataset.myAssignments : [],
        week: isSelf ? dataset.myWeek : extras?.week || [],
        unavailabilities: isSelf
          ? dataset.myUnavailabilities
          : extras?.unavailabilities || [],
        scheduleWindow: dataset.scheduleWindow,
        viewLabel: targetMember.name,
        isSelf,
        isVolunteer: false,
      });
    }

    if (effectiveScope === "ministry") {
      const targetDept =
        myDepartments.find((d) => d.id === effectiveMinistryId) ||
        myDepartments[0] ||
        null;

      const deptMembers = targetDept
        ? visibleTeamMembers.filter((m) =>
            m.departmentIds?.includes(targetDept.id)
          )
        : [];

      return computeTeamReport({
        schedules: dataset.schedules,
        departmentsInScope: targetDept ? [targetDept] : [],
        membersInScope: deptMembers,
        deptAvailabilitiesByDept: dataset.deptAvailabilitiesByDept,
        deptUnavailabilitiesByDept: dataset.deptUnavailabilitiesByDept,
        scheduleWindow: dataset.scheduleWindow,
        viewLabel: targetDept?.name || "Ministério",
        mode: "ministry",
      });
    }

    return computeTeamReport({
      schedules: dataset.schedules,
      departmentsInScope: myDepartments,
      membersInScope: visibleTeamMembers,
      deptAvailabilitiesByDept: dataset.deptAvailabilitiesByDept,
      deptUnavailabilitiesByDept: dataset.deptUnavailabilitiesByDept,
      scheduleWindow: dataset.scheduleWindow,
      viewLabel: userIsAdmin
        ? "Visão geral — Todos os ministérios"
        : "Visão geral — Meus ministérios",
      mode: "all",
    });
  }, [
    currentUser,
    dataset,
    effectiveMemberId,
    effectiveMinistryId,
    effectiveScope,
    isVolunteer,
    memberExtrasById,
    myDepartments,
    selectableMembers,
    userIsAdmin,
    visibleTeamMembers,
  ]);

  const showMinistryPicker =
    userIsAdmin && effectiveScope === "ministry" && myDepartments.length > 1;
  const showMemberPicker =
    !isVolunteer &&
    effectiveScope === "member" &&
    selectableMembers.length > 0;

  const pageSubtitle = isVolunteer
    ? "Acompanhe suas escalas confirmadas e disponibilidade pessoal."
    : userIsAdmin
      ? "Acompanhe participação, cobertura e disponibilidade de toda a equipe."
      : "Acompanhe os indicadores do seu ministério e de sua equipe.";

  const handleExportSummary = () => {
    if (!report) return;
    const csv = `\uFEFF${buildCsvSummary(report)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-midia-${slugifyFilePart(report.viewLabel)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast.success(`Resumo exportado para "${report.viewLabel}".`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>INDICADORES</p>
          <h1 className={styles.pageTitle}>Relatórios</h1>
          <p className={styles.pageSubtitle}>{pageSubtitle}</p>
        </div>

        <button
          type="button"
          disabled={!report || isLoading || isLoadingMemberExtras}
          className={styles.exportButton}
          onClick={handleExportSummary}
        >
          <DownloadIcon />
          <span>Exportar resumo</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <section className={styles.filterCard} aria-label="Filtro do relatório">
        <div className={styles.filterLead}>
          <span className={styles.filterIconWrap} aria-hidden="true">
            <FilterIcon />
          </span>
          <div className={styles.filterMeta}>
            <span className={styles.filterEyebrow}>VISUALIZAÇÃO ATUAL</span>
            <span className={styles.filterCurrentLabel}>
              {report?.viewLabel ||
                (isVolunteer ? currentUser.name : "Carregando...")}
            </span>
          </div>
        </div>

        {isVolunteer ? (
          <span className={styles.filterLockedBadge}>Acesso individual</span>
        ) : (
          <div className={styles.filterControlWrap}>
            <label htmlFor={filterSelectId} className="visually-hidden">
              Escopo do relatório
            </label>
            <select
              id={filterSelectId}
              name="reportScope"
              value={effectiveScope}
              className={styles.filterSelect}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setSelectedScope(next);
                setIsMemberPickerOpen(false);
                const nextOption = scopeOptions.find((o) => o.id === next);
                announce(
                  `Escopo alterado para ${nextOption?.label || "Visão selecionada"}.`
                );
              }}
            >
              {scopeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            {showMinistryPicker && (
              <>
                <label htmlFor={secondarySelectId} className="visually-hidden">
                  Selecionar ministério
                </label>
                <select
                  id={secondarySelectId}
                  name="reportMinistry"
                  value={effectiveMinistryId}
                  className={styles.filterSelect}
                  onChange={(event) => {
                    const nextId = event.currentTarget.value;
                    setSelectedMinistryId(nextId);
                    const dept = myDepartments.find((d) => d.id === nextId);
                    if (dept) {
                      announce(`Exibindo indicadores de ${dept.name}.`);
                    }
                  }}
                >
                  {myDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {showMemberPicker && (
              <div ref={memberPickerRef} className={styles.memberPickerWrap}>
                <button
                  id={secondarySelectId}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isMemberPickerOpen}
                  aria-label="Selecionar participante"
                  className={styles.memberPickerTrigger}
                  onClick={() => setIsMemberPickerOpen((prev) => !prev)}
                >
                  <span className={styles.memberPickerTriggerText}>
                    {selectedMember
                      ? selectedMember.name
                      : "Selecionar participante"}
                  </span>
                  <ChevronDownIcon
                    className={`${styles.memberPickerChevron} ${
                      isMemberPickerOpen ? styles.memberPickerChevronOpen : ""
                    }`}
                  />
                </button>

                {isMemberPickerOpen && (
                  <div
                    role="listbox"
                    aria-label="Selecionar participante"
                    className={styles.memberPickerPanel}
                  >
                    {selectableMembers.map((member) => {
                      const isSelected = member.id === effectiveMemberId;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`${styles.memberOptionCard} ${
                            isSelected ? styles.memberOptionCardSelected : ""
                          }`}
                          onClick={() => {
                            setSelectedMemberId(member.id);
                            setIsMemberPickerOpen(false);
                            announce(`Exibindo relatório de ${member.name}.`);
                          }}
                        >
                          <div className={styles.memberOptionCardBody}>
                            <div className={styles.memberOptionTop}>
                              <span className={styles.memberOptionName}>
                                {member.name}
                              </span>
                              <span className={styles.memberOptionHandle}>
                                {member.handle || "Sem apelido"}
                              </span>
                            </div>

                            <div className={styles.memberOptionMinistries}>
                              {member.ministries?.length > 0 ? (
                                member.ministries.map((ministry) => (
                                  <span
                                    key={ministry}
                                    className={styles.memberOptionMinistryPill}
                                  >
                                    {ministry}
                                  </span>
                                ))
                              ) : (
                                <span className={styles.memberOptionMinistryPill}>
                                  Sem ministério
                                </span>
                              )}
                            </div>
                          </div>

                          {isSelected && (
                            <span
                              className={styles.memberOptionCheck}
                              aria-hidden="true"
                            >
                              <CheckIcon />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {isLoading ? (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>Carregando indicadores reais...</p>
        </div>
      ) : loadError ? (
        <div className={styles.stateBox} role="alert">
          <p className={styles.stateTitle}>{loadError}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={handleRetry}
          >
            Tentar novamente
          </button>
        </div>
      ) : isLoadingMemberExtras ? (
        <div className={styles.stateBox} role="status">
          <p className={styles.stateTitle}>
            Carregando indicadores do participante...
          </p>
        </div>
      ) : selectedMemberExtras?.error ? (
        <div className={styles.stateBox} role="alert">
          <p className={styles.stateTitle}>{selectedMemberExtras.error}</p>
        </div>
      ) : !report ? (
        <div className={styles.stateBox}>
          <p className={styles.stateTitle}>
            Nenhum dado disponível para este filtro ainda.
          </p>
        </div>
      ) : (
        <>
          <section className={styles.kpiGrid} aria-label="Indicadores principais">
            <article className={`${styles.kpiCard} ${styles.kpiCardDark}`}>
              <div className={styles.kpiTopRow}>
                <h2 className={styles.kpiLabelDark}>
                  {report.primaryKpi.label}
                </h2>
                <span className={styles.kpiBadgeLime} aria-hidden="true">
                  <TrendingUpIcon />
                </span>
              </div>
              <p className={styles.kpiValueDark}>{report.primaryKpi.value}</p>
              <p className={styles.kpiDeltaDark}>{report.primaryKpi.detail}</p>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiTopRow}>
                <h2 className={styles.kpiLabel}>{report.secondaryKpi.label}</h2>
                <span className={styles.kpiBadgeNeutral} aria-hidden="true">
                  <UsersIcon />
                </span>
              </div>
              <p className={styles.kpiValue}>{report.secondaryKpi.value}</p>
              <p className={styles.kpiDetail}>{report.secondaryKpi.detail}</p>
            </article>

            <article className={styles.kpiCard}>
              <div className={styles.kpiTopRow}>
                <h2 className={styles.kpiLabel}>{report.tertiaryKpi.label}</h2>
                <span className={styles.kpiBadgeNeutral} aria-hidden="true">
                  <CheckCircleIcon />
                </span>
              </div>
              <p className={styles.kpiValue}>{report.tertiaryKpi.value}</p>
              <p className={styles.kpiDetail}>{report.tertiaryKpi.detail}</p>
            </article>
          </section>

          <div className={styles.analyticsGrid}>
            <section
              className={styles.panelCard}
              aria-labelledby={teamChartTitleId}
            >
              <div className={styles.panelHeaderRow}>
                <div>
                  <p className={styles.panelEyebrow}>{report.chartEyebrow}</p>
                  <h2 id={teamChartTitleId} className={styles.panelTitle}>
                    {report.chartTitle}
                  </h2>
                </div>

                <span className={styles.scopePill}>
                  <span className={styles.scopeDot} aria-hidden="true" />
                  {report.viewLabel}
                </span>
              </div>

              <ul
                className={styles.barChart}
                style={{
                  "--bar-columns": Math.max(1, report.monthlyBars.length),
                }}
                aria-label={report.chartTitle}
              >
                {report.monthlyBars.map((item) => (
                  <li key={item.key} className={styles.barColumn}>
                    <span className={styles.barValue}>{item.displayValue}</span>
                    <div className={styles.barTrack}>
                      <span
                        className={`${styles.barFill} ${
                          item.highlight ? styles.barFillCurrent : ""
                        }`}
                        style={{ "--bar-height": `${item.value}%` }}
                      />
                    </div>
                    <span className={styles.barMonth}>{item.month}</span>
                    <span className={styles.barSubLabel}>{item.subLabel}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section
              className={styles.panelCard}
              aria-labelledby={coverageTitleId}
            >
              <div className={styles.panelHeaderStacked}>
                <p className={styles.panelEyebrow}>{report.breakdownEyebrow}</p>
                <h2 id={coverageTitleId} className={styles.panelTitle}>
                  {report.breakdownTitle}
                </h2>
              </div>

              {report.breakdownItems.length === 0 ? (
                <p className={styles.panelEmptyHint}>
                  Nenhum registro encontrado para este detalhamento ainda.
                </p>
              ) : (
                <ul
                  className={styles.coverageList}
                  aria-label={report.breakdownTitle}
                >
                  {report.breakdownItems.map((area) => (
                    <li key={area.id} className={styles.coverageItem}>
                      <div className={styles.coverageLabels}>
                        <div className={styles.coverageHeadingCol}>
                          <span className={styles.coverageName}>
                            {area.name}
                          </span>
                          {area.meta && (
                            <span className={styles.coverageMeta}>
                              {area.meta}
                            </span>
                          )}
                        </div>
                        <span className={styles.coveragePercent}>
                          {area.valueText}
                        </span>
                      </div>
                      <progress
                        max={100}
                        value={area.percent}
                        aria-label={`${area.name}: ${area.valueText}`}
                        className={styles.coverageProgress}
                        style={{ "--progress-bar-fill": area.color }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
