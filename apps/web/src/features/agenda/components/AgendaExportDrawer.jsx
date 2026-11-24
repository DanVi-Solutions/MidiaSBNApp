"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
} from "@/components/ui/icons";
import {
  shortMonthLabelOf,
  weekStartOf,
  weeksOfMonth,
} from "@/features/agenda/utils/agendaDates";
import {
  EXPORT_MODE,
  buildAgendaExportPayload,
  exportAgendaPng,
} from "@/features/agenda/utils/exportAgendaPng";
import {
  APP_TIME_ZONE,
  getTodayIsoInZone,
} from "@/features/schedules/utils/scheduleDates";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import styles from "./AgendaView.module.css";

const MODES = [
  { value: EXPORT_MODE.MONTH, title: "Um mês", sub: "Todos os eventos do mês" },
  { value: EXPORT_MODE.WEEK, title: "Uma semana", sub: "De domingo a sábado" },
];

export function AgendaExportDrawer({
  events = [],
  monthOptions = [],
  defaultMonth,
  onClose,
}) {
  const toast = useToast();
  const titleId = useId();
  const monthSelectId = useId();
  const weekSelectId = useId();
  const dialogRef = useRef(null);
  const isCleaningUpRef = useRef(false);
  const todayIso = useMemo(() => getTodayIsoInZone(APP_TIME_ZONE), []);

  const initialMonth = monthOptions.includes(defaultMonth)
    ? defaultMonth
    : monthOptions[0] || todayIso.slice(0, 7);
  const [mode, setMode] = useState(EXPORT_MODE.MONTH);
  const [monthKey, setMonthKey] = useState(initialMonth);
  const [weekStart, setWeekStart] = useState(weekStartOf(todayIso));
  const [includeMinistries, setIncludeMinistries] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  const weeks = useMemo(() => weeksOfMonth(monthKey), [monthKey]);
  const selectedWeek =
    weeks.find((week) => week.start === weekStart) || weeks[0];

  const payload = useMemo(
    () =>
      buildAgendaExportPayload({
        events,
        mode,
        monthKey,
        weekStart: selectedWeek?.start,
        weekEnd: selectedWeek?.end,
        includeMinistries,
      }),
    [events, mode, monthKey, selectedWeek, includeMinistries],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    return () => {
      isCleaningUpRef.current = true;
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute("data-closing");
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isExporting,
    });
  }, [isExporting]);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (
      !dialog ||
      isCleaningUpRef.current ||
      shouldIgnoreRightDrawerClose(dialog)
    )
      return;
    dialog.returnValue = "";
    onClose?.();
  };

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    if (isExporting) return;
    if (payload.total === 0) {
      setError("Não há eventos publicados no período selecionado.");
      return;
    }

    setIsExporting(true);
    setError("");
    try {
      await exportAgendaPng(payload);
      await closeAnimatedRightDrawer(dialogRef.current);
      toast.success(
        `Agenda exportada (${payload.total} ${payload.total === 1 ? "evento" : "eventos"}).`,
      );
    } catch (exportError) {
      setError(
        exportError?.message || "Não foi possível exportar a imagem da agenda.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={titleId}
      className={styles.createDrawer}
      onCancel={(cancelEvent) => {
        if (cancelEvent.cancelable) {
          cancelEvent.preventDefault();
          if (!isExporting) closeAnimatedRightDrawer(dialogRef.current);
        }
      }}
      onClose={handleDialogClose}
    >
      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>AGENDA SOBRENATURAL</p>
          <h2 id={titleId} className={styles.drawerTitle}>
            Exportar agenda
          </h2>
        </div>
        <button
          type="button"
          aria-label="Fechar exportação"
          className={styles.drawerCloseButton}
          disabled={isExporting}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <form className={styles.drawerForm} noValidate onSubmit={handleSubmit}>
        <div className={styles.drawerBody}>
          <fieldset className={styles.scopeFieldset}>
            <legend className={styles.fieldsetLegendRow}>
              <span>O que exportar</span>
            </legend>
            <div className={styles.scopeModeGrid}>
              {MODES.map((option) => {
                const active = mode === option.value;
                return (
                  <label
                    key={option.value}
                    className={`${styles.scopeModeCard} ${active ? styles.scopeModeCardActive : ""}`}
                  >
                    <input
                      type="radio"
                      name="exportMode"
                      value={option.value}
                      checked={active}
                      className="visually-hidden"
                      onChange={() => {
                        setMode(option.value);
                        setError("");
                      }}
                    />
                    <span className={styles.scopeModeText}>
                      <span className={styles.scopeModeTitle}>
                        {option.title}
                      </span>
                      <span className={styles.scopeModeSub}>{option.sub}</span>
                    </span>
                    {active && (
                      <span
                        className={styles.scopeModeCheck}
                        aria-hidden="true"
                      >
                        <CheckIcon />
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={monthSelectId} className={styles.fieldLabel}>
                Mês
              </label>
            </div>
            <select
              id={monthSelectId}
              value={monthKey}
              className={styles.select}
              onChange={(changeEvent) => {
                setMonthKey(changeEvent.currentTarget.value);
                setError("");
              }}
            >
              {monthOptions.map((option) => (
                <option key={option} value={option}>
                  {shortMonthLabelOf(option)}
                </option>
              ))}
            </select>
          </div>

          {mode === EXPORT_MODE.WEEK && (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label htmlFor={weekSelectId} className={styles.fieldLabel}>
                  Semana
                </label>
              </div>
              <select
                id={weekSelectId}
                value={selectedWeek?.start || ""}
                className={styles.select}
                onChange={(changeEvent) => {
                  setWeekStart(changeEvent.currentTarget.value);
                  setError("");
                }}
              >
                {weeks.map((week) => (
                  <option key={week.start} value={week.start}>
                    {week.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label
            className={`${styles.departmentOption} ${includeMinistries ? styles.departmentOptionSelected : ""}`}
          >
            <input
              type="checkbox"
              name="includeMinistries"
              className={styles.departmentCheckbox}
              checked={includeMinistries}
              onChange={(changeEvent) =>
                setIncludeMinistries(changeEvent.currentTarget.checked)
              }
            />
            <span className={styles.departmentOptionName}>
              Incluir os ministérios de cada evento na imagem
            </span>
          </label>

          <p className={styles.exportSummary}>
            <strong>{payload.periodLabel}</strong>
            {payload.total === 0
              ? " — nenhum evento publicado."
              : ` — ${payload.total} ${payload.total === 1 ? "evento publicado" : "eventos publicados"}.`}
          </p>

          {error && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.drawerCancelButton}
            disabled={isExporting}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isExporting}
            aria-busy={isExporting}
            className={styles.drawerSubmitButton}
          >
            <DownloadIcon />
            <span>{isExporting ? "Exportando..." : "Exportar PNG"}</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
