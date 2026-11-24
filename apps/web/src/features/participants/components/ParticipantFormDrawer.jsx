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
  changeCredentialRole,
  createCredential,
  setCredentialDepartments,
  transferCredentialDepartment,
} from "@/features/participants/services/credentialsService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import {
  getAssignableDepartments,
  getDepartmentRequirement,
  getParticipantFormRoles,
  getRoleLabel,
  isAdmin,
  ROLES,
  validateDisplayName,
} from "@/lib/roles";
import styles from "./ParticipantsView.module.css";

function sameIdSet(a, b) {
  const arrA = [...new Set(a || [])];
  const arrB = [...new Set(b || [])];
  return arrA.length === arrB.length && arrA.every((id) => arrB.includes(id));
}

export function ParticipantFormDrawer({
  mode = "create",
  participant = null,
  preset = null,
  onCreated,
  onClose,
}) {
  const {
    currentUser,
    departments,
    activeMinistry,
    addParticipant,
    updateParticipant,
    refreshParticipants,
    refreshDepartments,
    refreshCurrentUser,
    notifySchedulesChanged,
    rememberCredentialNumber,
    openWorkspaceCodeModal,
  } = usePrivateWorkspace();
  const toast = useToast();

  const isEditing = mode === "edit" && Boolean(participant);

  const drawerTitleId = useId();
  const fullNameInputId = useId();
  const fullNameErrorId = useId();
  const roleSelectId = useId();
  const ministrySelectId = useId();
  const ministryErrorId = useId();

  const dialogRef = useRef(null);
  const fullNameInputRef = useRef(null);
  const roleSelectRef = useRef(null);
  const announceTimerRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const assignableDepartments = useMemo(
    () => getAssignableDepartments(currentUser, departments),
    [currentUser, departments]
  );
  const isMinistryLocked = !isAdmin(currentUser);
  const lockedDepartment = useMemo(() => {
    if (!isMinistryLocked) return null;
    return (
      assignableDepartments.find((dept) => dept.id === activeMinistry?.id) ||
      assignableDepartments[0] ||
      null
    );
  }, [activeMinistry?.id, assignableDepartments, isMinistryLocked]);

  const [fullName, setFullName] = useState("");
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState(() => {
    if (isEditing && participant) {
      const req = getDepartmentRequirement(participant.roleCode || ROLES.VOLUNTEER);
      if (req.mode === "none") return [];
    }

    const validIds = new Set(assignableDepartments.map((d) => d.id));

    if (isMinistryLocked) {
      if (activeMinistry?.id && validIds.has(activeMinistry.id)) {
        return [activeMinistry.id];
      }
      return assignableDepartments.length > 0 ? [assignableDepartments[0].id] : [];
    }

    if (isEditing && participant) {
      const currentValid = (participant.departmentIds || []).filter((id) =>
        validIds.has(id)
      );
      if (currentValid.length > 0) {
        return [currentValid[0]];
      }
    } else if (preset?.departmentId && validIds.has(preset.departmentId)) {
      return [preset.departmentId];
    }

    if (activeMinistry?.id && validIds.has(activeMinistry.id)) {
      return [activeMinistry.id];
    }
    return assignableDepartments.length > 0 ? [assignableDepartments[0].id] : [];
  });

  const selectedDepartment = useMemo(() => {
    if (isMinistryLocked) return lockedDepartment;
    const chosenId = selectedDepartmentIds[0];
    return (
      assignableDepartments.find((dept) => dept.id === chosenId) ||
      assignableDepartments[0] ||
      null
    );
  }, [
    assignableDepartments,
    isMinistryLocked,
    lockedDepartment,
    selectedDepartmentIds,
  ]);

  const formRoles = useMemo(
    () => getParticipantFormRoles(currentUser),
    [currentUser]
  );

  const [selectedRole, setSelectedRole] = useState(() => {
    const allowed = getParticipantFormRoles(currentUser);

    if (isEditing && participant) {
      return participant.roleCode || ROLES.VOLUNTEER;
    }
    if (preset?.role && allowed.includes(preset.role)) {
      return preset.role;
    }
    return allowed.includes(ROLES.VOLUNTEER)
      ? ROLES.VOLUNTEER
      : allowed[0] || ROLES.VOLUNTEER;
  });

  const [fullNameError, setFullNameError] = useState("");
  const [departmentError, setDepartmentError] = useState("");
  const [drawerFormError, setDrawerFormError] = useState("");
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const departmentRequirement = useMemo(
    () => getDepartmentRequirement(selectedRole),
    [selectedRole]
  );

  const editRoleOptions = useMemo(() => {
    if (
      isEditing &&
      participant?.roleCode === ROLES.GENERAL_MANAGER &&
      !formRoles.includes(ROLES.GENERAL_MANAGER)
    ) {
      return [ROLES.GENERAL_MANAGER, ...formRoles];
    }
    return formRoles;
  }, [formRoles, isEditing, participant]);

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
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      if (isEditing) {
        roleSelectRef.current?.focus();
      } else {
        fullNameInputRef.current?.focus();
      }
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
  }, [isEditing]);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isSavingDrawer,
    });
  }, [isSavingDrawer]);

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

  const resolveDefaultDepartmentIds = useCallback(
    (roleCode) => {
      const req = getDepartmentRequirement(roleCode);
      if (req.mode === "none") return [];

      const activeId = activeMinistry?.id;
      const validIds = new Set(assignableDepartments.map((d) => d.id));
      if (activeId && validIds.has(activeId)) {
        return [activeId];
      }
      if (assignableDepartments.length > 0) {
        return [assignableDepartments[0].id];
      }
      return [];
    },
    [activeMinistry?.id, assignableDepartments]
  );

  const handleRoleChange = (nextRole) => {
    setSelectedRole(nextRole);
    setDepartmentError("");
    setDrawerFormError("");

    const nextReq = getDepartmentRequirement(nextRole);
    if (nextReq.mode === "none") {
      setSelectedDepartmentIds([]);
      return;
    }

    if (isMinistryLocked) {
      setSelectedDepartmentIds(lockedDepartment ? [lockedDepartment.id] : []);
      return;
    }

    const validIds = new Set(assignableDepartments.map((d) => d.id));
    const kept = selectedDepartmentIds.filter((id) => validIds.has(id));

    if (nextReq.mode === "single") {
      if (kept.length > 0) {
        setSelectedDepartmentIds([kept[0]]);
      } else {
        setSelectedDepartmentIds(resolveDefaultDepartmentIds(nextRole));
      }
      return;
    }

    if (kept.length > 0) {
      setSelectedDepartmentIds(kept);
    } else {
      setSelectedDepartmentIds(resolveDefaultDepartmentIds(nextRole));
    }
  };

  const validateDepartmentSelection = () => {
    if (departmentRequirement.mode === "none") {
      return "";
    }
    if (isEditing && selectedRole === ROLES.GENERAL_MANAGER) {
      return "";
    }
    if (assignableDepartments.length === 0) {
      return "Nenhum ministério disponível. Crie um ministério antes de continuar.";
    }
    if (selectedDepartmentIds.length !== 1) {
      return "Selecione exatamente um ministério.";
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSavingDrawer) return;

    setDrawerFormError("");

    if (!isEditing) {
      const nextFullNameError = validateDisplayName(fullName);
      setFullNameError(nextFullNameError);
      if (nextFullNameError) {
        announce(nextFullNameError);
        fullNameInputRef.current?.focus();
        return;
      }
    }

    const nextDepartmentError = validateDepartmentSelection();
    setDepartmentError(nextDepartmentError);
    if (nextDepartmentError) {
      announce(nextDepartmentError);
      return;
    }

    const finalDepartmentIds =
      departmentRequirement.mode === "none"
        ? []
        : isMinistryLocked && lockedDepartment
          ? [lockedDepartment.id]
          : selectedDepartmentIds;

    setIsSavingDrawer(true);

    if (isEditing && participant) {
      const target = participant;
      const roleChanged = selectedRole !== target.roleCode;
      const deptsChanged = !sameIdSet(
        finalDepartmentIds,
        target.departmentIds || []
      );

      if (!roleChanged && !deptsChanged) {
        setIsSavingDrawer(false);
        await closeAnimatedRightDrawer(dialogRef.current);
        return;
      }

      if (roleChanged) {
        const result = await changeCredentialRole(target.id, {
          role: selectedRole,
          departmentIds: finalDepartmentIds,
        });
        setIsSavingDrawer(false);

        if (!result.ok) {
          setDrawerFormError(
            result.error || "Não foi possível atualizar o papel do membro."
          );
          return;
        }

        updateParticipant(target.id, {
          ...result.data,
          roleCode: result.data.role,
        });
        await Promise.all([
          refreshParticipants({ silent: true }),
          refreshDepartments(),
          target.id === currentUser.id
            ? refreshCurrentUser()
            : Promise.resolve(null),
        ]);
        notifySchedulesChanged();
        await closeAnimatedRightDrawer(dialogRef.current);
        toast.success(`Papel e ministério de "${target.name}" atualizados.`);
        return;
      }

      if (isAdmin(currentUser)) {
        const result = await setCredentialDepartments(
          target.id,
          finalDepartmentIds
        );
        setIsSavingDrawer(false);

        if (!result.ok) {
          setDrawerFormError(
            result.error || "Não foi possível atualizar os ministérios."
          );
          return;
        }

        updateParticipant(target.id, {
          ...result.data,
          roleCode: result.data.role,
        });
        await Promise.all([
          refreshParticipants({ silent: true }),
          refreshDepartments(),
          target.id === currentUser.id
            ? refreshCurrentUser()
            : Promise.resolve(null),
        ]);
        notifySchedulesChanged();
        await closeAnimatedRightDrawer(dialogRef.current);
        toast.success(`Ministérios de "${target.name}" atualizados.`);
        return;
      }

      const fromDepartmentId = target.departmentIds?.[0];
      const toDepartmentId = finalDepartmentIds[0];

      if (!fromDepartmentId || !toDepartmentId) {
        setIsSavingDrawer(false);
        setDrawerFormError("Selecione o ministério de destino para transferir.");
        return;
      }

      const transferResult = await transferCredentialDepartment(target.id, {
        fromDepartmentId,
        toDepartmentId,
      });
      setIsSavingDrawer(false);

      if (!transferResult.ok) {
        setDrawerFormError(
          transferResult.error ||
            "Não foi possível transferir o membro de ministério."
        );
        return;
      }

      await Promise.all([
        refreshParticipants({ silent: true }),
        refreshDepartments(),
        target.id === currentUser.id
          ? refreshCurrentUser()
          : Promise.resolve(null),
      ]);
      notifySchedulesChanged();
      await closeAnimatedRightDrawer(dialogRef.current);

      if (transferResult.data?.status === "PENDING") {
        toast.success(
          `Pedido de transferência de "${target.name}" enviado para aprovação.`
        );
      } else {
        toast.success(`Ministério de "${target.name}" atualizado.`);
      }
      return;
    }

    const result = await createCredential({
      name: fullName.trim(),
      role: selectedRole,
      departmentIds: finalDepartmentIds,
    });
    setIsSavingDrawer(false);

    if (!result.ok || !result.data) {
      setDrawerFormError(
        result.error || "Não foi possível cadastrar o participante."
      );
      return;
    }

    const created = result.data;
    if (created.credentialNumber) {
      rememberCredentialNumber(created.id, created.credentialNumber);
    }

    addParticipant(created);
    await Promise.all([
      refreshParticipants({ silent: true }),
      refreshDepartments(),
    ]);
    notifySchedulesChanged();
    onCreated?.();

    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(`Participante "${created.name}" adicionado à equipe.`);

    if (created.credentialNumber) {
      openWorkspaceCodeModal({
        variant: "temporary",
        title: "Participante adicionado — envie o acesso",
        subtitle:
          "Copie a mensagem pronta e envie ao membro para que ele faça o primeiro acesso.",
        personName: created.name,
        status: created.status,
        credentialNumber: created.credentialNumber,
      });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.createDrawer}
      onCancel={(event) => {
        if (event.cancelable) {
          event.preventDefault();
          if (!isSavingDrawer) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>
            {isEditing ? "EDITAR PARTICIPANTE" : "NOVO PARTICIPANTE"}
          </p>
          <h2 id={drawerTitleId} className={styles.drawerTitle}>
            {isEditing ? "Editar papel e ministério" : "Adicionar à equipe"}
          </h2>
        </div>

        <button
          type="button"
          aria-label="Fechar formulário"
          className={styles.drawerCloseButton}
          disabled={isSavingDrawer}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <form
        className={styles.drawerForm}
        noValidate
        onSubmit={handleSubmit}
      >
        <div className={styles.drawerBody}>
          {isEditing ? (
            <div className={styles.editMemberSummary}>
              <span className={styles.avatar} aria-hidden="true">
                {participant.initials}
              </span>
              <div className={styles.identityText}>
                <span className={styles.memberName}>{participant.name}</span>
                <span className={styles.memberHandle}>
                  {participant.handle || "Aguardando 1º acesso"}
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.fieldGroup}>
              <label htmlFor={fullNameInputId} className={styles.fieldLabel}>
                Nome e sobrenome
              </label>
              <input
                ref={fullNameInputRef}
                id={fullNameInputId}
                name="fullName"
                type="text"
                value={fullName}
                placeholder="Ex.: André Martins"
                required
                minLength={2}
                maxLength={80}
                aria-invalid={fullNameError ? "true" : "false"}
                aria-describedby={fullNameError ? fullNameErrorId : undefined}
                className={`${styles.input} ${
                  fullNameError ? styles.inputError : ""
                }`}
                onChange={(event) => {
                  const nextVal = event.currentTarget.value;
                  setFullName(nextVal);
                  setDrawerFormError("");
                  if (fullNameError && !validateDisplayName(nextVal)) {
                    setFullNameError("");
                  }
                }}
              />
              {fullNameError && (
                <div id={fullNameErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{fullNameError}</span>
                </div>
              )}
            </div>
          )}

          {!isMinistryLocked &&
            departmentRequirement.mode !== "none" &&
            !(isEditing && selectedRole === ROLES.GENERAL_MANAGER) &&
            assignableDepartments.length > 0 && (
              <div className={styles.fieldGroup}>
                <label htmlFor={ministrySelectId} className={styles.fieldLabel}>
                  Ministério
                </label>
                <select
                  id={ministrySelectId}
                  name="departmentId"
                  value={selectedDepartmentIds[0] || ""}
                  aria-invalid={departmentError ? "true" : "false"}
                  aria-describedby={
                    departmentError ? ministryErrorId : undefined
                  }
                  className={`${styles.select} ${
                    departmentError ? styles.inputError : ""
                  }`}
                  onChange={(event) => {
                    const val = event.currentTarget.value;
                    setSelectedDepartmentIds(val ? [val] : []);
                    setDepartmentError("");
                    setDrawerFormError("");
                  }}
                >
                  {assignableDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
                {departmentError && (
                  <div id={ministryErrorId} className={styles.errorMsg}>
                    <AlertCircleIcon className={styles.errorIcon} />
                    <span>{departmentError}</span>
                  </div>
                )}
              </div>
            )}

          <div className={styles.singleColField}>
            <div className={styles.fieldGroup}>
              <label htmlFor={roleSelectId} className={styles.fieldLabel}>
                Papel
              </label>
              <select
                ref={roleSelectRef}
                id={roleSelectId}
                name="role"
                value={selectedRole}
                className={styles.select}
                onChange={(event) =>
                  handleRoleChange(event.currentTarget.value)
                }
              >
                {editRoleOptions.map((roleCode) => (
                  <option
                    key={roleCode}
                    value={roleCode}
                    disabled={roleCode === ROLES.GENERAL_MANAGER}
                  >
                    {roleCode === ROLES.GENERAL_MANAGER
                      ? "Líder Geral (definido em Ministérios)"
                      : getRoleLabel(roleCode)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {departmentRequirement.mode === "none" ? (
            <div className={styles.infoNote}>
              Contas de <strong>Administrador</strong> têm acesso global e não são
              vinculadas a ministérios específicos.
            </div>
          ) : isEditing && selectedRole === ROLES.GENERAL_MANAGER ? (
            <div className={styles.infoNote}>
              Os ministérios de <strong>Líder Geral</strong> são definidos na
              aba <strong>Ministérios</strong>. Selecione outro papel acima caso
              deseje alterar o cargo.
            </div>
          ) : assignableDepartments.length === 0 ? (
            <div className={styles.errorMsg} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>
                Nenhum ministério cadastrado para atribuir. Crie um ministério
                primeiro.
              </span>
            </div>
          ) : isMinistryLocked ? (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <span className={styles.fieldLabel}>Ministério</span>
                <span className={styles.optionalTag}>Somente leitura</span>
              </div>

              <div className={styles.readonlyScopeBox}>
                <strong className={styles.readonlyScopeValue}>
                  {lockedDepartment?.name || "Nenhum ministério disponível"}
                </strong>
              </div>
              {departmentError && (
                <div id={ministryErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{departmentError}</span>
                </div>
              )}
            </div>
          ) : null}

          {drawerFormError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{drawerFormError}</span>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.drawerCancelButton}
            disabled={isSavingDrawer}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.drawerSubmitButton}
            disabled={isSavingDrawer}
            aria-busy={isSavingDrawer}
          >
            {isEditing ? <CheckIcon /> : <PlusIcon />}
            <span>
              {isSavingDrawer
                ? isEditing
                  ? "Salvando..."
                  : "Criando..."
                : isEditing
                  ? "Salvar alterações"
                  : "Criar membro"}
            </span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
