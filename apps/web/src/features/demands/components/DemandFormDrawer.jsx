"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/ui/icons";
import {
  createDemand,
  getDemandCandidates,
  updateDemand,
} from "@/features/demands/services/demandsService";
import {
  APP_TIME_ZONE,
  buildIsoDateTimeInZone,
  extractDateAndTimeInZone,
  formatIsoDatePtBr,
  getTodayIsoInZone,
} from "@/features/schedules/utils/scheduleDates";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import {
  canToggleDemandStatus,
  computeInitials,
  getAssignableDepartments,
  getRoleLabel,
  isAdmin,
  isAtLeast,
  resolveRoleCode,
  ROLES,
} from "@/lib/roles";
import styles from "./DemandsView.module.css";

function validateTitle(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Informe o título da demanda.";
  if (trimmed.length < 2) {
    return "O título deve ter pelo menos 2 caracteres.";
  }
  if (trimmed.length > 120) {
    return "O título pode ter no máximo 120 caracteres.";
  }
  return "";
}

function canChangeExistingAssignee(actor, assignee) {
  if (!assignee) return true;
  const assigneeRole = resolveRoleCode(assignee);
  if (assigneeRole === ROLES.ADMINISTRATOR) {
    return isAdmin(actor);
  }
  if (assigneeRole === ROLES.GENERAL_MANAGER) {
    return isAtLeast(actor, ROLES.GENERAL_MANAGER);
  }
  return true;
}

export function DemandFormDrawer({
  mode = "create",
  demand = null,
  defaultDepartmentId = "",
  onClose,
}) {
  const {
    currentUser,
    departments,
    activeMinistry,
    notifyDemandsChanged,
  } = usePrivateWorkspace();
  const toast = useToast();

  const isEditing = mode === "edit" && Boolean(demand);
  const userIsAdmin = isAdmin(currentUser);
  const isGeneralManager =
    resolveRoleCode(currentUser) === ROLES.GENERAL_MANAGER;

  const manageableDepartments = useMemo(() => {
    const pool = userIsAdmin
      ? departments
      : getAssignableDepartments(currentUser, departments);
    return pool.filter((dept) => dept?.hasDemands);
  }, [currentUser, departments, userIsAdmin]);

  const lockedDepartment = useMemo(() => {
    if (isEditing && demand?.department) {
      return demand.department;
    }
    if (userIsAdmin) return null;
    if (isGeneralManager && activeMinistry?.id && !activeMinistry.isGlobal) {
      return (
        manageableDepartments.find((dept) => dept.id === activeMinistry.id) ||
        null
      );
    }
    return manageableDepartments[0] || null;
  }, [
    activeMinistry,
    demand,
    isEditing,
    isGeneralManager,
    manageableDepartments,
    userIsAdmin,
  ]);

  const drawerTitleId = useId();
  const ministrySelectId = useId();
  const titleInputId = useId();
  const titleErrorId = useId();
  const descriptionInputId = useId();
  const dueDateInputId = useId();
  const dueDateErrorId = useId();
  const statusErrorId = useId();

  const dialogRef = useRef(null);
  const titleInputRef = useRef(null);
  const dueDateInputRef = useRef(null);
  const announceTimerRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const todayIso = useMemo(() => getTodayIsoInZone(APP_TIME_ZONE), []);
  const initialDueDate =
    isEditing && demand?.dueAt
      ? extractDateAndTimeInZone(demand.dueAt, APP_TIME_ZONE).dateIso
      : "";

  const [departmentId, setDepartmentId] = useState(() => {
    if (isEditing && demand?.department?.id) {
      return demand.department.id;
    }
    if (lockedDepartment?.id) {
      return lockedDepartment.id;
    }
    if (
      defaultDepartmentId &&
      manageableDepartments.some((dept) => dept.id === defaultDepartmentId)
    ) {
      return defaultDepartmentId;
    }
    return manageableDepartments[0]?.id || "";
  });

  const [title, setTitle] = useState(() =>
    isEditing ? demand.title || "" : ""
  );
  const [description, setDescription] = useState(() =>
    isEditing ? demand.description || "" : ""
  );
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState(() =>
    isEditing && Array.isArray(demand?.assignees)
      ? demand.assignees.map((person) => person.id).filter(Boolean)
      : []
  );
  const [status, setStatus] = useState(() =>
    isEditing ? demand.status || "IN_PROGRESS" : "IN_PROGRESS"
  );

  const [candidates, setCandidates] = useState([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  const [titleError, setTitleError] = useState("");
  const [dueDateError, setDueDateError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const lockedAssigneeIds = useMemo(() => {
    if (!isEditing || !Array.isArray(demand?.assignees)) {
      return new Set();
    }
    return new Set(
      demand.assignees
        .filter((person) => !canChangeExistingAssignee(currentUser, person))
        .map((person) => person.id)
    );
  }, [currentUser, demand, isEditing]);

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
    setAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setAnnouncement(message);
    }, 200);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      isCleaningUpRef.current = true;
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute("data-closing");
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isSaving,
    });
  }, [isSaving]);

  useEffect(() => {
    if (!departmentId) {
      return undefined;
    }

    let active = true;
    const loadTimer = window.setTimeout(() => {
      if (active) setIsLoadingCandidates(true);
    }, 0);

    getDemandCandidates(departmentId).then((res) => {
      window.clearTimeout(loadTimer);
      if (!active) return;
      setIsLoadingCandidates(false);
      if (res.ok && Array.isArray(res.data)) {
        setCandidates(res.data);
      } else {
        setCandidates([]);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(loadTimer);
    };
  }, [departmentId]);

  const assigneeOptions = useMemo(() => {
    const map = new Map(candidates.map((person) => [person.id, person]));
    if (isEditing && Array.isArray(demand?.assignees)) {
      for (const person of demand.assignees) {
        if (person?.id && !map.has(person.id)) {
          map.set(person.id, person);
        }
      }
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [candidates, demand, isEditing]);

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

  const canToggleStatus = isEditing
    ? canToggleDemandStatus(currentUser, demand, selectedAssigneeIds)
    : false;

  const validateDueDateValue = (value) => {
    if (!value) return "";
    if (isEditing && value === initialDueDate) return "";
    if (value < todayIso) {
      return `O prazo deve ser a partir de hoje (${formatIsoDatePtBr(todayIso)}).`;
    }
    return "";
  };

  const handleDepartmentChange = (nextId) => {
    setDepartmentId(nextId);
    setSelectedAssigneeIds([]);
    setFormError("");
    setStatusError("");
  };

  const handleToggleAssignee = (personId) => {
    if (isSaving || lockedAssigneeIds.has(personId)) return;

    const nextIds = selectedAssigneeIds.includes(personId)
      ? selectedAssigneeIds.filter((id) => id !== personId)
      : [...selectedAssigneeIds, personId];

    setSelectedAssigneeIds(nextIds);
    setFormError("");
    if (nextIds.length > 0 && statusError) {
      setStatusError("");
    }
    if (
      isEditing &&
      demand &&
      status !== demand.status &&
      !canToggleDemandStatus(currentUser, demand, nextIds)
    ) {
      setStatus(demand.status || "IN_PROGRESS");
    }
  };

  const handleClearAssignees = () => {
    if (isSaving) return;
    const nextIds = selectedAssigneeIds.filter((id) =>
      lockedAssigneeIds.has(id)
    );
    setSelectedAssigneeIds(nextIds);
    setFormError("");
    if (
      isEditing &&
      demand &&
      status !== demand.status &&
      !canToggleDemandStatus(currentUser, demand, nextIds)
    ) {
      setStatus(demand.status || "IN_PROGRESS");
    }
  };

  const handleStatusChange = (nextStatus) => {
    if (!isEditing) return;
    if (
      nextStatus !== demand?.status &&
      !canToggleDemandStatus(currentUser, demand, selectedAssigneeIds)
    ) {
      return;
    }
    setStatus(nextStatus);
    setFormError("");
    if (nextStatus === "IN_PROGRESS" || selectedAssigneeIds.length > 0) {
      setStatusError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    const nextTitleError = validateTitle(title);
    const nextDueDateError = validateDueDateValue(dueDate);
    setTitleError(nextTitleError);
    setDueDateError(nextDueDateError);
    setFormError("");

    if (nextTitleError) {
      announce(nextTitleError);
      titleInputRef.current?.focus();
      return;
    }

    if (nextDueDateError) {
      announce(nextDueDateError);
      dueDateInputRef.current?.focus();
      return;
    }

    if (!departmentId) {
      setFormError("Selecione um ministério com demandas habilitadas.");
      return;
    }

    if (isEditing && status === "COMPLETED" && selectedAssigneeIds.length === 0) {
      const msg =
        "Associe ao menos um responsável antes de finalizar a demanda.";
      setStatusError(msg);
      announce(msg);
      return;
    }

    if (
      isEditing &&
      demand &&
      status !== demand.status &&
      !canToggleDemandStatus(currentUser, demand, selectedAssigneeIds)
    ) {
      const msg =
        "Somente um dos responsáveis pela demanda ou a liderança do ministério pode alterar este status.";
      setStatusError(msg);
      announce(msg);
      return;
    }
    setStatusError("");

    const dueAtIso = dueDate
      ? buildIsoDateTimeInZone(dueDate, "23:59", APP_TIME_ZONE)
      : null;

    setIsSaving(true);

    if (isEditing && demand) {
      const patch = {
        title: title.trim(),
        description: description.trim() || null,
        assigneeIds: selectedAssigneeIds,
        ...(dueDate !== initialDueDate ? { dueAt: dueAtIso } : {}),
        ...(status !== demand.status ? { status } : {}),
      };

      const result = await updateDemand(demand.id, patch);
      setIsSaving(false);

      if (!result.ok || !result.data) {
        const msg =
          result.error || "Não foi possível salvar as alterações da demanda.";
        setFormError(msg);
        announce(msg);
        return;
      }

      notifyDemandsChanged();
      await closeAnimatedRightDrawer(dialogRef.current);
      toast.success("Demanda atualizada com sucesso.");
      return;
    }

    const result = await createDemand({
      title: title.trim(),
      description: description.trim() || null,
      departmentId,
      assigneeIds: selectedAssigneeIds,
      dueAt: dueAtIso,
    });
    setIsSaving(false);

    if (!result.ok || !result.data) {
      const msg = result.error || "Não foi possível criar a demanda.";
      setFormError(msg);
      announce(msg);
      return;
    }

    notifyDemandsChanged();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(`Demanda "${result.data.title}" criada com sucesso.`);
  };

  const showMinistrySelect =
    !isEditing && userIsAdmin && manageableDepartments.length > 0;

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.drawerDialog}
      onCancel={(event) => {
        if (event.cancelable) {
          event.preventDefault();
          if (!isSaving) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </div>

      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>
            {isEditing ? "EDITAR DEMANDA" : "NOVA DEMANDA"}
          </p>
          <h2 id={drawerTitleId} className={styles.drawerTitle}>
            {isEditing ? "Editar demanda" : "Criar demanda"}
          </h2>
        </div>

        <button
          type="button"
          aria-label="Fechar formulário"
          className={styles.drawerCloseButton}
          disabled={isSaving}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <form className={styles.drawerForm} noValidate onSubmit={handleSubmit}>
        <div className={styles.drawerBody}>
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={titleInputId} className={styles.fieldLabel}>
                Título
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>
            <input
              ref={titleInputRef}
              id={titleInputId}
              name="title"
              type="text"
              value={title}
              placeholder="Ex.: Editar vídeo do culto de domingo"
              required
              minLength={2}
              maxLength={120}
              disabled={isSaving}
              aria-invalid={titleError ? "true" : "false"}
              aria-describedby={titleError ? titleErrorId : undefined}
              className={`${styles.input} ${
                titleError ? styles.inputError : ""
              }`}
              onChange={(event) => {
                const val = event.currentTarget.value;
                setTitle(val);
                setFormError("");
                if (titleError && !validateTitle(val)) {
                  setTitleError("");
                }
              }}
            />
            {titleError && (
              <div id={titleErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{titleError}</span>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={descriptionInputId} className={styles.fieldLabel}>
                Descrição
              </label>
              <span className={styles.optionalTag}>Opcional</span>
            </div>
            <textarea
              id={descriptionInputId}
              name="description"
              rows={3}
              value={description}
              maxLength={500}
              disabled={isSaving}
              placeholder="Descreva os detalhes, referências ou observações."
              className={styles.textarea}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </div>

          {showMinistrySelect ? (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label htmlFor={ministrySelectId} className={styles.fieldLabel}>
                  Ministério
                </label>
                <span className={styles.requiredTag}>Obrigatório</span>
              </div>
              <select
                id={ministrySelectId}
                name="departmentId"
                value={departmentId}
                disabled={isSaving}
                className={styles.select}
                onChange={(event) =>
                  handleDepartmentChange(event.currentTarget.value)
                }
              >
                {manageableDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <span className={styles.fieldLabel}>Ministério</span>
                <span className={styles.optionalTag}>Somente leitura</span>
              </div>
              <div className={styles.readonlyScopeBox}>
                <strong>
                  {lockedDepartment?.name || "Nenhum ministério disponível"}
                </strong>
              </div>
            </div>
          )}

          <fieldset className={styles.memberFieldset}>
            <legend className={styles.fieldsetLegendRow}>
              <span>Responsáveis</span>
              <span className={styles.fieldsetLegendActions}>
                {selectedAssigneeIds.length > 0 && (
                  <span className={styles.selectedCountPill}>
                    {selectedAssigneeIds.length}{" "}
                    {selectedAssigneeIds.length === 1
                      ? "selecionado"
                      : "selecionados"}
                  </span>
                )}
                {selectedAssigneeIds.some(
                  (id) => !lockedAssigneeIds.has(id)
                ) && (
                  <button
                    type="button"
                    disabled={isSaving}
                    className={styles.clearSelectionBtn}
                    onClick={handleClearAssignees}
                  >
                    Limpar
                  </button>
                )}
                <span className={styles.optionalTag}>Opcional</span>
              </span>
            </legend>

            {isLoadingCandidates ? (
              <p className={styles.memberEmptyNote}>
                Carregando pessoas do ministério...
              </p>
            ) : assigneeOptions.length === 0 ? (
              <p className={styles.memberEmptyNote}>
                Nenhum participante elegível encontrado neste ministério.
              </p>
            ) : (
              <div className={styles.memberSelectorGrid}>
                {assigneeOptions.map((person) => {
                  const isSelected = selectedAssigneeIds.includes(person.id);
                  const isLockedExisting = lockedAssigneeIds.has(person.id);
                  const isSelf = person.id === currentUser.id;
                  const roleSuffix =
                    person.role && person.role !== ROLES.VOLUNTEER
                      ? ` · ${getRoleLabel(person.role)}`
                      : "";

                  return (
                    <button
                      key={person.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isSaving || isLockedExisting}
                      className={`${styles.memberCard} ${
                        isSelected ? styles.memberCardSelected : ""
                      }`}
                      onClick={() => handleToggleAssignee(person.id)}
                    >
                      <span
                        className={styles.memberCardAvatar}
                        aria-hidden="true"
                      >
                        {computeInitials(person.name)}
                      </span>
                      <span className={styles.memberCardText}>
                        <span className={styles.memberCardName}>
                          <span className={styles.memberCardNameText}>
                            {person.name}
                            {isSelf ? " (Você)" : ""}
                          </span>
                        </span>
                        <span className={styles.memberCardHandle}>
                          {person.username
                            ? `@${person.username}`
                            : "Primeiro acesso"}
                          {roleSuffix}
                        </span>
                      </span>
                      {isSelected && (
                        <span
                          className={styles.memberCardCheck}
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

            {lockedAssigneeIds.size > 0 ? (
              <p className={styles.fieldHint}>
                Responsáveis com papel de líder ou administrador já associados só
                podem ser removidos por eles mesmos ou superiores.
              </p>
            ) : (
              <p className={styles.fieldHint}>
                Selecione uma ou mais pessoas para a demanda.
              </p>
            )}
          </fieldset>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={dueDateInputId} className={styles.fieldLabel}>
                Prazo
              </label>
              <span className={styles.optionalTag}>Opcional</span>
            </div>
            <input
              ref={dueDateInputRef}
              id={dueDateInputId}
              name="dueDate"
              type="date"
              min={todayIso}
              value={dueDate}
              disabled={isSaving}
              aria-invalid={dueDateError ? "true" : "false"}
              aria-describedby={dueDateError ? dueDateErrorId : undefined}
              className={`${styles.input} ${
                dueDateError ? styles.inputError : ""
              }`}
              onChange={(event) => {
                const nextVal = event.currentTarget.value;
                setDueDate(nextVal);
                setFormError("");
                if (dueDateError && !validateDueDateValue(nextVal)) {
                  setDueDateError("");
                }
              }}
            />
            {dueDateError && (
              <div id={dueDateErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{dueDateError}</span>
              </div>
            )}
          </div>

          {isEditing && (
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Status da demanda</span>
              <div
                role="radiogroup"
                aria-label="Status da demanda"
                aria-describedby={statusError ? statusErrorId : undefined}
                className={styles.statusSegmentGroup}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={status === "IN_PROGRESS"}
                  disabled={
                    isSaving || (status !== "IN_PROGRESS" && !canToggleStatus)
                  }
                  className={`${styles.statusSegmentBtn} ${
                    status === "IN_PROGRESS"
                      ? styles.statusSegmentBtnActive
                      : ""
                  }`}
                  onClick={() => handleStatusChange("IN_PROGRESS")}
                >
                  Em progresso
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={status === "COMPLETED"}
                  disabled={
                    isSaving || (status !== "COMPLETED" && !canToggleStatus)
                  }
                  className={`${styles.statusSegmentBtn} ${
                    status === "COMPLETED" ? styles.statusSegmentBtnDone : ""
                  }`}
                  onClick={() => handleStatusChange("COMPLETED")}
                >
                  Finalizado
                </button>
              </div>
              {!canToggleStatus && (
                <p className={styles.fieldHint}>
                  {selectedAssigneeIds.length > 0
                    ? "Somente um dos responsáveis pela demanda ou a liderança do ministério pode finalizar ou reabrir esta tarefa."
                    : "Associe você mesmo como responsável para poder finalizar esta demanda."}
                </p>
              )}
              {statusError && (
                <div id={statusErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{statusError}</span>
                </div>
              )}
            </div>
          )}

          {formError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.drawerCancelButton}
            disabled={isSaving}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.drawerSubmitButton}
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isEditing ? <CheckIcon /> : <PlusIcon />}
            <span>
              {isSaving
                ? isEditing
                  ? "Salvando..."
                  : "Criando..."
                : isEditing
                  ? "Salvar alterações"
                  : "Criar demanda"}
            </span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
