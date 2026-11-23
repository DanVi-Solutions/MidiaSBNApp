"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { autoAssignSchedules } from "@/features/schedules/services/schedulesService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import drawerStyles from "./MonthlyScheduleView.module.css";
import styles from "./AutoAssignDrawer.module.css";

const DEFAULT_VOLUNTEERS = 2;
const MAX_VOLUNTEERS = 100;

function parseVolunteers(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_VOLUNTEERS
    ? number
    : null;
}

function groupByMinistry(schedules) {
  const groups = new Map();
  for (const schedule of schedules) {
    const group = groups.get(schedule.ministryId) ?? {
      id: schedule.ministryId,
      name: schedule.ministryName,
      schedules: [],
    };
    group.schedules.push(schedule);
    groups.set(schedule.ministryId, group);
  }
  return [...groups.values()];
}

export function AutoAssignDrawer({ schedules = [], onClose }) {
  const { notifySchedulesChanged } = usePrivateWorkspace();
  const toast = useToast();

  const titleId = useId();
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [counts, setCounts] = useState(() => new Map());
  const [preview, setPreview] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const groups = useMemo(() => groupByMinistry(schedules), [schedules]);
  const showMinistryHeadings = groups.length > 1;
  const scheduleById = useMemo(
    () => new Map(schedules.map((schedule) => [schedule.id, schedule])),
    [schedules]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      isCleaningUpRef.current = true;
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute("data-closing");
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isBusy,
    });
  }, [isBusy]);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (
      !dialog ||
      isCleaningUpRef.current ||
      shouldIgnoreRightDrawerClose(dialog)
    ) {
      return;
    }
    dialog.returnValue = "";
    onClose?.();
  };

  const closeDrawer = () => closeAnimatedRightDrawer(dialogRef.current);

  const toggleSchedule = (schedule) => {
    setFormError("");
    setCounts((prev) => {
      const next = new Map(prev);
      if (next.has(schedule.id)) {
        next.delete(schedule.id);
      } else {
        next.set(
          schedule.id,
          String(Math.max(schedule.assignedCount, DEFAULT_VOLUNTEERS))
        );
      }
      return next;
    });
  };

  const setCount = (scheduleId, value) => {
    setFormError("");
    setCounts((prev) => new Map(prev).set(scheduleId, value));
  };

  const allSelected =
    schedules.length > 0 && counts.size === schedules.length;

  const toggleAll = () => {
    setFormError("");
    setCounts(
      allSelected
        ? new Map()
        : new Map(
            schedules.map((schedule) => [
              schedule.id,
              counts.get(schedule.id) ??
                String(Math.max(schedule.assignedCount, DEFAULT_VOLUNTEERS)),
            ])
          )
    );
  };

  const buildRequest = () => {
    const requests = [];
    for (const [scheduleId, value] of counts) {
      const volunteers = parseVolunteers(value);
      if (!volunteers) return null;
      requests.push({ scheduleId, volunteers });
    }
    return requests;
  };

  const handlePreview = async () => {
    if (counts.size === 0) {
      setFormError("Selecione ao menos uma escala.");
      return;
    }
    const requests = buildRequest();
    if (!requests) {
      setFormError(
        `Informe um número de voluntários entre 1 e ${MAX_VOLUNTEERS} em cada escala selecionada.`
      );
      return;
    }

    setIsBusy(true);
    const res = await autoAssignSchedules({ schedules: requests, dryRun: true });
    setIsBusy(false);

    if (!res.ok || !res.data) {
      setFormError(res.error || "Não foi possível calcular a distribuição.");
      return;
    }
    setFormError("");
    setPreview({ requests, result: res.data });
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setIsBusy(true);
    const res = await autoAssignSchedules({
      schedules: preview.requests,
      seed: preview.result.seed,
    });
    setIsBusy(false);

    if (!res.ok || !res.data) {
      setFormError(res.error || "Não foi possível salvar a distribuição.");
      return;
    }

    notifySchedulesChanged();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(
      res.data.assignedTotal === 1
        ? "1 pessoa escalada pela distribuição automática."
        : `${res.data.assignedTotal} pessoas escaladas pela distribuição automática.`
    );
  };

  const result = preview?.result;

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={titleId}
      className={drawerStyles.scheduleDrawer}
      onCancel={(event) => {
        if (event.cancelable) {
          event.preventDefault();
          if (!isBusy) closeDrawer();
        }
      }}
      onClose={handleDialogClose}
    >
      <div className={drawerStyles.scheduleDrawerHeader}>
        <div>
          <p className={drawerStyles.scheduleDrawerEyebrow}>
            DISTRIBUIÇÃO AUTOMÁTICA
          </p>
          <h2 id={titleId} className={drawerStyles.scheduleDrawerTitle}>
            {result ? "Confira a distribuição" : "Distribuir voluntários"}
          </h2>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Fechar distribuição automática"
          disabled={isBusy}
          className={drawerStyles.drawerCloseButton}
          onClick={closeDrawer}
        >
          <CloseIcon />
        </button>
      </div>

      <div className={drawerStyles.scheduleDrawerForm}>
        <div className={drawerStyles.scheduleDrawerBody}>
          {!result ? (
            <>
              <p className={styles.intro}>
                Selecione as escalas e quantas pessoas cada uma deve ter. O
                sistema escolhe quem está disponível no dia e período, respeita
                as ausências e evita repetir a mesma pessoa no mesmo dia. Quem
                já está escalado conta no total.
              </p>

              {schedules.length === 0 ? (
                <p className={drawerStyles.recurringEmptyNote}>
                  Não há escalas que aceitem distribuição automática no período
                  liberado. Escalas de inscrição voluntária ficam de fora.
                </p>
              ) : (
                <>
                  <div className={styles.listToolbar}>
                    <span className={styles.selectionCount}>
                      {counts.size === 0
                        ? "Nenhuma escala selecionada"
                        : `${counts.size} de ${schedules.length} selecionada(s)`}
                    </span>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={toggleAll}
                    >
                      {allSelected ? "Limpar seleção" : "Selecionar todas"}
                    </button>
                  </div>

                  {groups.map((group) => (
                    <section
                      key={group.id}
                      aria-label={group.name}
                      className={styles.group}
                    >
                      {showMinistryHeadings && (
                        <h3 className={styles.groupTitle}>{group.name}</h3>
                      )}
                      <ul className={styles.scheduleList}>
                        {group.schedules.map((schedule) => {
                          const value = counts.get(schedule.id);
                          const isSelected = value !== undefined;
                          const parsed = parseVolunteers(value);
                          const countInputId = `${titleId}-${schedule.id}`;

                          return (
                            <li
                              key={schedule.id}
                              className={`${styles.scheduleRow} ${
                                isSelected ? styles.scheduleRowSelected : ""
                              }`}
                            >
                              <label className={styles.scheduleMain}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  className={styles.checkbox}
                                  onChange={() => toggleSchedule(schedule)}
                                />
                                <span className={styles.scheduleText}>
                                  <span className={styles.scheduleName}>
                                    {schedule.title}
                                    {!schedule.published && (
                                      <span className={styles.draftTag}>
                                        Rascunho
                                      </span>
                                    )}
                                  </span>
                                  <span className={styles.scheduleMeta}>
                                    {schedule.fullDateLabel} • {schedule.time} •{" "}
                                    {schedule.assignedCount} escalado(s)
                                  </span>
                                </span>
                              </label>

                              {isSelected && (
                                <div className={styles.countField}>
                                  <label
                                    htmlFor={countInputId}
                                    className={styles.countLabel}
                                  >
                                    Voluntários
                                  </label>
                                  <input
                                    id={countInputId}
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={MAX_VOLUNTEERS}
                                    step={1}
                                    value={value}
                                    aria-invalid={parsed ? "false" : "true"}
                                    className={`${drawerStyles.drawerInput} ${
                                      styles.countInput
                                    } ${parsed ? "" : drawerStyles.drawerInputError}`}
                                    onChange={(event) =>
                                      setCount(
                                        schedule.id,
                                        event.currentTarget.value
                                      )
                                    }
                                  />
                                  {parsed !== null &&
                                    parsed <= schedule.assignedCount && (
                                      <span className={styles.countHint}>
                                        Já tem {schedule.assignedCount}: ninguém
                                        será adicionado.
                                      </span>
                                    )}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <div className={styles.summary}>
                <span className={styles.summaryIcon} aria-hidden="true">
                  <UsersIcon />
                </span>
                <p>
                  <strong>{result.assignedTotal}</strong>{" "}
                  {result.assignedTotal === 1
                    ? "pessoa será escalada"
                    : "pessoas serão escaladas"}{" "}
                  em {result.schedules.length} escala(s).
                  {result.missingTotal > 0 &&
                    ` ${result.missingTotal} vaga(s) ficarão sem ninguém por falta de pessoas disponíveis.`}{" "}
                  Pessoas de escalas já publicadas recebem um aviso.
                </p>
              </div>

              <ul className={styles.resultList}>
                {result.schedules.map((item) => {
                  const original = scheduleById.get(item.schedule.id);
                  return (
                    <li key={item.schedule.id} className={styles.resultCard}>
                      <div className={styles.resultHeader}>
                        <span className={styles.scheduleName}>
                          {original?.title ?? item.schedule.name}
                        </span>
                        <span className={styles.scheduleMeta}>
                          {original
                            ? `${original.fullDateLabel} • ${original.time} • ${original.ministryName}`
                            : item.schedule.department?.name}
                        </span>
                      </div>

                      {item.assigned.length === 0 ? (
                        <p className={styles.resultEmpty}>
                          {item.missing > 0
                            ? "Ninguém disponível para esta escala."
                            : `Já tem ${item.alreadyAssigned} pessoa(s): nada a adicionar.`}
                        </p>
                      ) : (
                        <ul className={styles.pickList}>
                          {item.assigned.map((pick) => (
                            <li
                              key={pick.credential.id}
                              className={styles.pickItem}
                            >
                              <CheckIcon className={styles.pickIcon} />
                              <span>{pick.credential.name}</span>
                              {pick.sameDayConflict && (
                                <span className={styles.sameDayTag}>
                                  Outra escala no mesmo dia
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {item.missing > 0 && item.assigned.length > 0 && (
                        <p className={styles.missingNote}>
                          <AlertTriangleIcon className={styles.missingIcon} />
                          Faltou {item.missing} pessoa(s) disponível(is) para
                          chegar a {item.requested}.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {formError && (
            <div className={drawerStyles.formBannerError} role="alert">
              <AlertCircleIcon className={drawerStyles.fieldErrorIcon} />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className={drawerStyles.scheduleDrawerFooter}>
          {result ? (
            <>
              <button
                type="button"
                disabled={isBusy}
                className={drawerStyles.drawerCancelButton}
                onClick={() => {
                  setPreview(null);
                  setFormError("");
                }}
              >
                Voltar e ajustar
              </button>
              <button
                type="button"
                disabled={isBusy || result.assignedTotal === 0}
                aria-busy={isBusy}
                className={drawerStyles.drawerSubmitButton}
                onClick={handleConfirm}
              >
                <CheckIcon />
                <span>{isBusy ? "Salvando..." : "Confirmar distribuição"}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isBusy}
                className={drawerStyles.drawerCancelButton}
                onClick={closeDrawer}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isBusy || schedules.length === 0}
                aria-busy={isBusy}
                className={drawerStyles.drawerSubmitButton}
                onClick={handlePreview}
              >
                <UsersIcon />
                <span>{isBusy ? "Calculando..." : "Ver distribuição"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
