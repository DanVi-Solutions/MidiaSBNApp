"use client";

import { useId, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  CheckCircleIcon,
  DownloadIcon,
  FilterIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  REPORT_FILTER_OPTIONS,
  REPORTS_BY_SCOPE,
} from "@/features/reports/data/mockReportsData";
import styles from "./ReportsView.module.css";

function buildCsvSummary(report) {
  const lines = [
    ["Indicador", "Valor", "Detalhe"],
    ["Visualização", report.viewLabel, ""],
    ["Taxa de presença", `${report.attendanceRate}%`, report.attendanceDelta],
    [
      "Voluntários ativos",
      String(report.activeVolunteers),
      report.activeVolunteersDetail,
    ],
    [
      "Escalas encontradas",
      String(report.schedulesFound),
      report.schedulesFoundDetail,
    ],
    [],
    ["Mês", "Presença (%)"],
    ...report.monthlyAttendance.map((item) => [item.month, `${item.value}%`]),
    [],
    ["Área", "Cobertura (%)"],
    ...report.areaCoverage.map((area) => [area.name, `${area.coverage}%`]),
  ];

  return lines
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")
    )
    .join("\r\n");
}

export function ReportsView() {
  const toast = useToast();
  const filterSelectId = useId();
  const teamChartTitleId = useId();
  const coverageTitleId = useId();

  const [selectedScope, setSelectedScope] = useState("all");

  const report = REPORTS_BY_SCOPE[selectedScope] ?? REPORTS_BY_SCOPE.all;

  const handleExportSummary = () => {
    const csv = `\uFEFF${buildCsvSummary(report)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-midia-${selectedScope}.csv`;
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
          <p className={styles.pageSubtitle}>
            Acompanhe participação, cobertura e saúde da equipe.
          </p>
        </div>

        <button
          type="button"
          className={styles.exportButton}
          onClick={handleExportSummary}
        >
          <DownloadIcon />
          <span>Exportar resumo</span>
        </button>
      </header>

      <section className={styles.filterCard} aria-label="Filtro do relatório">
        <div className={styles.filterLead}>
          <span className={styles.filterIconWrap} aria-hidden="true">
            <FilterIcon />
          </span>
          <div className={styles.filterMeta}>
            <span className={styles.filterEyebrow}>VISUALIZAÇÃO ATUAL</span>
            <span className={styles.filterCurrentLabel}>
              {report.viewLabel}
            </span>
          </div>
        </div>

        <div className={styles.filterControlWrap}>
          <label htmlFor={filterSelectId} className="visually-hidden">
            Filtrar relatório por ministério
          </label>
          <select
            id={filterSelectId}
            name="reportScope"
            value={selectedScope}
            className={styles.filterSelect}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setSelectedScope(next);
              const nextLabel =
                REPORTS_BY_SCOPE[next]?.viewLabel ?? "Visão geral";
              announce(`Exibindo indicadores para ${nextLabel}.`);
            }}
          >
            {REPORT_FILTER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={styles.kpiGrid} aria-label="Indicadores principais">
        <article className={`${styles.kpiCard} ${styles.kpiCardDark}`}>
          <div className={styles.kpiTopRow}>
            <h2 className={styles.kpiLabelDark}>Taxa de presença</h2>
            <span className={styles.kpiBadgeLime} aria-hidden="true">
              <TrendingUpIcon />
            </span>
          </div>
          <p className={styles.kpiValueDark}>{report.attendanceRate}%</p>
          <p className={styles.kpiDeltaDark}>{report.attendanceDelta}</p>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <h2 className={styles.kpiLabel}>Voluntários ativos</h2>
            <span className={styles.kpiBadgeNeutral} aria-hidden="true">
              <UsersIcon />
            </span>
          </div>
          <p className={styles.kpiValue}>{report.activeVolunteers}</p>
          <p className={styles.kpiDetail}>{report.activeVolunteersDetail}</p>
        </article>

        <article className={styles.kpiCard}>
          <div className={styles.kpiTopRow}>
            <h2 className={styles.kpiLabel}>Escalas encontradas</h2>
            <span className={styles.kpiBadgeNeutral} aria-hidden="true">
              <CheckCircleIcon />
            </span>
          </div>
          <p className={styles.kpiValue}>{report.schedulesFound}</p>
          <p className={styles.kpiDetail}>{report.schedulesFoundDetail}</p>
        </article>
      </section>

      <div className={styles.analyticsGrid}>
        <section
          className={styles.panelCard}
          aria-labelledby={teamChartTitleId}
        >
          <div className={styles.panelHeaderRow}>
            <div>
              <p className={styles.panelEyebrow}>ÚLTIMOS 6 MESES</p>
              <h2 id={teamChartTitleId} className={styles.panelTitle}>
                Presença da equipe
              </h2>
            </div>

            <span className={styles.scopePill}>
              <span className={styles.scopeDot} aria-hidden="true" />
              {report.viewLabel}
            </span>
          </div>

          <ul
            className={styles.barChart}
            aria-label="Presença percentual por mês"
          >
            {report.monthlyAttendance.map((item) => (
              <li key={item.month} className={styles.barColumn}>
                <span className={styles.barValue}>{item.value}%</span>
                <div className={styles.barTrack}>
                  <span
                    className={`${styles.barFill} ${
                      item.highlight ? styles.barFillCurrent : ""
                    }`}
                    style={{ "--bar-height": `${item.value}%` }}
                  />
                </div>
                <span className={styles.barMonth}>{item.month}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={styles.panelCard}
          aria-labelledby={coverageTitleId}
        >
          <div className={styles.panelHeaderStacked}>
            <p className={styles.panelEyebrow}>POR ÁREA</p>
            <h2 id={coverageTitleId} className={styles.panelTitle}>
              Cobertura das escalas
            </h2>
          </div>

          <ul
            className={styles.coverageList}
            aria-label="Cobertura das escalas por ministério"
          >
            {report.areaCoverage.map((area) => (
              <li key={area.id} className={styles.coverageItem}>
                <div className={styles.coverageLabels}>
                  <span className={styles.coverageName}>{area.name}</span>
                  <span className={styles.coveragePercent}>
                    {area.coverage}%
                  </span>
                </div>
                <progress
                  max={100}
                  value={area.coverage}
                  aria-label={`${area.name}: ${area.coverage}%`}
                  className={styles.coverageProgress}
                  style={{ "--progress-bar-fill": area.color }}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
