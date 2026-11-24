"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  TrashIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import {
  changeCredentialStatus,
  deleteCredential,
  getCredentialById,
  regenerateCredentialNumber,
} from "@/features/participants/services/credentialsService";
import { buildCredentialInviteMessage } from "@/lib/credentialInviteMessage";
import {
  canCopyCredentialNumber,
  canCreateCredential,
  canDeleteParticipant,
  canEditParticipant,
  canListCredentials,
  canRegenerateCredentialNumber,
  canSeeActualMemberStatus,
  canToggleStatus,
  canViewParticipant,
  CREDENTIAL_STATUS,
  getDisplayMemberStatus,
  isAdmin,
  isAtLeast,
  resolveRoleCode,
  ROLES,
  STATUS_META,
} from "@/lib/roles";
import styles from "./ParticipantsView.module.css";

function setupClosedByFallback(dialog, onDismiss) {
  if (!dialog || "closedBy" in HTMLDialogElement.prototype) {
    return undefined;
  }

  const isOutside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };

  let pressedOutside = false;
  const handlePointerDown = (event) => {
    pressedOutside = isOutside(event);
  };
  const handlePointerUp = (event) => {
    if (pressedOutside && isOutside(event)) {
      onDismiss();
    }
    pressedOutside = false;
  };

  dialog.addEventListener("pointerdown", handlePointerDown);
  dialog.addEventListener("pointerup", handlePointerUp);

  return () => {
    dialog.removeEventListener("pointerdown", handlePointerDown);
    dialog.removeEventListener("pointerup", handlePointerUp);
  };
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function doesParticipantMatchQuery(
  person,
  normalizedQuery,
  displayStatusLabel = person.statusLabel
) {
  if (!normalizedQuery) return true;
  const haystack = [
    person.name,
    person.handle,
    person.role,
    displayStatusLabel,
    ...(person.ministries || []),
  ]
    .map(normalizeText)
    .join(" ");

  return haystack.includes(normalizedQuery);
}

export function ParticipantsView() {
  const {
    currentUser,
    activeMinistry,
    participants,
    isLoadingParticipants,
    participantsError,
    refreshParticipants,
    updateParticipant,
    deleteParticipant,
    refreshDepartments,
    notifySchedulesChanged,
    broadcastWorkspaceSync,
    participantCreatePreset,
    setParticipantCreatePreset,
    knownCredentialNumbers,
    rememberCredentialNumber,
    openWorkspaceDrawer,
    openWorkspaceCodeModal,
  } = usePrivateWorkspace();
  const toast = useToast();

  const searchInputId = useId();
  const ministryFilterId = useId();
  const statusFilterId = useId();
  const tableCaptionId = useId();
  const confirmModalTitleId = useId();

  const confirmDialogRef = useRef(null);
  const confirmCancelBtnRef = useRef(null);
  const copyTimerRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [ministryFilter, setMinistryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [copiedParticipantId, setCopiedParticipantId] = useState("");
  const [copyingParticipantId, setCopyingParticipantId] = useState("");

  const canViewList = canListCredentials(currentUser);
  const canCreate = canCreateCredential(currentUser);
  const roleCode = resolveRoleCode(currentUser);
  const isVolunteer = roleCode === ROLES.VOLUNTEER;
  const isGeneralManager = roleCode === ROLES.GENERAL_MANAGER;
  const showStatusColumn = canSeeActualMemberStatus(currentUser);
  const canFilterByMinistry = isAdmin(currentUser) || isGeneralManager;
  const canFilterByStatus = showStatusColumn;
  const activeMinistryId =
    activeMinistry?.id && !activeMinistry.isGlobal ? activeMinistry.id : "";

  const visibleParticipants = useMemo(
    () =>
      participants.filter((person) => {
        if (!canViewParticipant(currentUser, person)) return false;
        if (isGeneralManager && activeMinistryId) {
          return Boolean(person.departmentIds?.includes(activeMinistryId));
        }
        return true;
      }),
    [activeMinistryId, currentUser, isGeneralManager, participants]
  );

  const ministryFilterOptions = useMemo(() => {
    const byId = new Map();
    for (const person of visibleParticipants) {
      for (const department of person.departments || []) {
        byId.set(department.id, department.name);
      }
    }
    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [visibleParticipants]);

  const showMinistryFilter =
    canFilterByMinistry && ministryFilterOptions.length > 1;
  const selectedMinistryId =
    showMinistryFilter &&
    ministryFilterOptions.some((option) => option.id === ministryFilter)
      ? ministryFilter
      : "";
  const selectedStatus = canFilterByStatus ? statusFilter : "";
  const hasActiveFilters = Boolean(
    searchQuery || selectedMinistryId || selectedStatus
  );

  const filteredParticipants = useMemo(() => {
    const query = normalizeText(searchQuery);

    return visibleParticipants.filter((person) => {
      if (
        selectedMinistryId &&
        !person.departmentIds?.includes(selectedMinistryId)
      ) {
        return false;
      }

      const displayStatus = getDisplayMemberStatus(currentUser, person);
      if (selectedStatus && displayStatus !== selectedStatus) return false;

      const displayStatusLabel = showStatusColumn
        ? (
            STATUS_META[displayStatus] || STATUS_META[CREDENTIAL_STATUS.ACTIVE]
          ).label
        : "";
      return doesParticipantMatchQuery(person, query, displayStatusLabel);
    });
  }, [
    currentUser,
    visibleParticipants,
    searchQuery,
    selectedMinistryId,
    selectedStatus,
    showStatusColumn,
  ]);

  const clearFilters = () => {
    setSearchQuery("");
    setMinistryFilter("");
    setStatusFilter("");
  };

  const hasAnyRowActions = useMemo(
    () =>
      filteredParticipants.some((person) => {
        const isSelf = person.id === currentUser.id;
        return (
          canCopyCredentialNumber(currentUser, person) ||
          (!isSelf && canRegenerateCredentialNumber(currentUser, person)) ||
          canToggleStatus(currentUser, person) ||
          canEditParticipant(currentUser, person) ||
          canDeleteParticipant(currentUser, person)
        );
      }),
    [currentUser, filteredParticipants]
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return setupClosedByFallback(confirmDialogRef.current, () => {
      if (!isConfirmingAction) {
        confirmDialogRef.current?.close("cancel");
      }
    });
  }, [isConfirmingAction]);

  useEffect(() => {
    if (!participantCreatePreset || !canCreate) return;
    openWorkspaceDrawer("participant-form", {
      mode: "create",
      preset: participantCreatePreset,
      onCreated: () => setSearchQuery(""),
    });
    setParticipantCreatePreset(null);
  }, [
    canCreate,
    openWorkspaceDrawer,
    participantCreatePreset,
    setParticipantCreatePreset,
  ]);

  const handleOpenCreateDrawer = () => {
    if (!canCreate) return;
    openWorkspaceDrawer("participant-form", {
      mode: "create",
      onCreated: clearFilters,
    });
  };

  const handleOpenEditDrawer = (person) => {
    if (!person) return;
    openWorkspaceDrawer("participant-form", {
      mode: "edit",
      participant: person,
    });
  };

  const handleCopyCredential = async (person) => {
    if (!canCopyCredentialNumber(currentUser, person)) {
      return;
    }

    let code = knownCredentialNumbers[person.id] || person.credentialNumber || "";

    if (!code) {
      setCopyingParticipantId(person.id);
      const detailRes = await getCredentialById(person.id);
      setCopyingParticipantId("");

      if (!detailRes.ok) {
        toast.error(
          detailRes.error ||
            "Não foi possível obter o código desta credencial."
        );
        return;
      }

      code = detailRes.data?.credentialNumber || "";
      if (code) {
        rememberCredentialNumber(person.id, code);
      }
    }

    if (!code) {
      toast.error(
        "Somente o próprio participante sabe este código; ele não pode mais ser consultado."
      );
      return;
    }

    const copied = await copyTextToClipboard(
      buildCredentialInviteMessage({
        name: person.name,
        status: person.status,
        credentialNumber: code,
      })
    );
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }

    if (copied) {
      setCopiedParticipantId(person.id);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedParticipantId("");
      }, 2000);
      toast.success(
        `Mensagem para ${person.name} copiada! Envie pelo canal de comunicação que você usa com este participante.`
      );
    } else {
      toast.error(
        `Não foi possível copiar automaticamente. Código de ${person.name}: ${code}.`
      );
    }
  };

  const openConfirmModal = (payload) => {
    const dialog = confirmDialogRef.current;
    if (!dialog || dialog.open) return;

    setIsConfirmingAction(false);
    setConfirmModal(payload);
    dialog.showModal();
    window.requestAnimationFrame(() => {
      confirmCancelBtnRef.current?.focus();
    });
  };

  const handleConfirmDialogClose = () => {
    const dialog = confirmDialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setConfirmModal(null);
    setIsConfirmingAction(false);
  };

  const handleConfirmAction = async (event) => {
    event.preventDefault();
    if (isConfirmingAction || !confirmModal?.participant) return;

    const target = confirmModal.participant;
    const actionType = confirmModal.type;

    setIsConfirmingAction(true);

    if (actionType === "regenerate") {
      const result = await regenerateCredentialNumber(target.id);
      setIsConfirmingAction(false);

      if (!result.ok || !result.data) {
        toast.error(
          result.error || "Não foi possível gerar o novo código de credencial."
        );
        return;
      }

      confirmDialogRef.current?.close("done");
      const generatedCode = result.data.credentialNumber;

      if (generatedCode) {
        rememberCredentialNumber(target.id, generatedCode);
      }
      updateParticipant(target.id, {
        ...result.data,
        roleCode: result.data.role,
      });
      await refreshParticipants({ silent: true });
      broadcastWorkspaceSync();

      openWorkspaceCodeModal({
        variant: "temporary",
        title: "Novo código temporário gerado",
        subtitle:
          "Copie a mensagem pronta e envie ao participante: ela já explica como entrar.",
        personName: target.name,
        status: result.data.status,
        credentialNumber: generatedCode,
      });
      toast.success(`Novo código gerado para ${target.name}.`);
      return;
    }

    if (actionType === "revoke" || actionType === "restore") {
      const nextStatus =
        actionType === "restore"
          ? CREDENTIAL_STATUS.ACTIVE
          : CREDENTIAL_STATUS.INACTIVE;
      const result = await changeCredentialStatus(target.id, nextStatus);
      setIsConfirmingAction(false);

      if (!result.ok || !result.data) {
        toast.error(
          result.error || "Não foi possível alterar o status da credencial."
        );
        return;
      }

      confirmDialogRef.current?.close("done");
      updateParticipant(target.id, {
        ...result.data,
        roleCode: result.data.role,
      });
      await Promise.all([
        refreshParticipants({ silent: true }),
        refreshDepartments(),
      ]);
      notifySchedulesChanged();

      if (actionType === "restore") {
        const recoveryCode = result.data.credentialNumber;
        if (recoveryCode) {
          rememberCredentialNumber(target.id, recoveryCode);
          openWorkspaceCodeModal({
            variant: "temporary",
            title: "Conta reativada — código de recuperação",
            subtitle:
              "Copie a mensagem pronta e envie ao participante para que ele conclua a recuperação.",
            personName: target.name,
            status: result.data.status,
            credentialNumber: recoveryCode,
          });
        }
        toast.success(`Acesso de ${target.name} restaurado.`);
      } else {
        toast.success(`Acesso de ${target.name} desativado.`);
      }
      return;
    }

    if (actionType === "delete") {
      const result = await deleteCredential(target.id);
      setIsConfirmingAction(false);

      if (!result.ok) {
        toast.error(
          result.error || "Não foi possível excluir este participante."
        );
        return;
      }

      confirmDialogRef.current?.close("done");
      deleteParticipant(target.id);
      await Promise.all([
        refreshParticipants({ silent: true }),
        refreshDepartments(),
      ]);
      notifySchedulesChanged();
      toast.success(`Participante "${target.name}" excluído definitivamente.`);
    }
  };

  if (!canViewList) {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerLead}>
            <p className={styles.pageEyebrow}>PESSOAS &amp; ACESSO</p>
            <h1 className={styles.pageTitle}>Participantes</h1>
          </div>
        </header>

        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>
            Você não tem permissão para visualizar a listagem de participantes.
            Para gerenciar sua própria credencial, acesse seu perfil.
          </p>
          <div className={styles.restrictedActions}>
            <Link href="/profile" className={styles.addButton}>
              Ir para Meu perfil
            </Link>
            <Link href="/schedule" className={styles.clearButton}>
              Voltar à escala
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pageSubtitleText = isAdmin(currentUser)
    ? "Gerencie todas as credenciais e ministérios da equipe."
    : isGeneralManager && activeMinistry?.name && !activeMinistry.isGlobal
      ? `Membros do ministério ativo: ${activeMinistry.name}.`
      : isVolunteer
        ? currentUser.departments?.length === 1
          ? `Membros e liderança do ministério ${currentUser.departments[0].name}.`
          : "Membros e liderança do seu ministério."
        : "Pessoas dos ministérios sob sua gestão.";

  const countLabel =
    filteredParticipants.length === 1
      ? "1 participante"
      : `${filteredParticipants.length} participantes`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PESSOAS &amp; ACESSO</p>
          <h1 className={styles.pageTitle}>Participantes</h1>
          <p className={styles.pageSubtitle}>{pageSubtitleText}</p>
        </div>

        {canCreate && (
          <button
            type="button"
            className={styles.addButton}
            onClick={handleOpenCreateDrawer}
          >
            <UserPlusIcon />
            <span>Adicionar membro</span>
          </button>
        )}
      </header>

      <search aria-label="Buscar participantes" className={styles.searchCard}>
        <div className={styles.searchFieldWrap}>
          <label htmlFor={searchInputId} className="visually-hidden">
            Buscar participante
          </label>
          <SearchIcon className={styles.searchIcon} />
          <input
            id={searchInputId}
            type="search"
            value={searchQuery}
            placeholder="Buscar participante..."
            autoCorrect="off"
            spellCheck={false}
            className={styles.searchInput}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </div>

        <div className={styles.filterRightGroup}>
          {showMinistryFilter && (
            <>
              <label htmlFor={ministryFilterId} className="visually-hidden">
                Filtrar por ministério
              </label>
              <select
                id={ministryFilterId}
                value={selectedMinistryId}
                className={styles.filterSelect}
                onChange={(event) =>
                  setMinistryFilter(event.currentTarget.value)
                }
              >
                <option value="">Todos os ministérios</option>
                {ministryFilterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {canFilterByStatus && (
            <>
              <label htmlFor={statusFilterId} className="visually-hidden">
                Filtrar por status
              </label>
              <select
                id={statusFilterId}
                value={selectedStatus}
                className={styles.filterSelect}
                onChange={(event) =>
                  setStatusFilter(event.currentTarget.value)
                }
              >
                <option value="">Todos os status</option>
                {Object.entries(STATUS_META).map(([status, meta]) => (
                  <option key={status} value={status}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </>
          )}

          <span className={styles.countLabel}>{countLabel}</span>
        </div>
      </search>

      {isLoadingParticipants && visibleParticipants.length === 0 ? (
        <div className={styles.emptyCard} role="status">
          <p className={styles.emptyTitle}>Carregando participantes...</p>
        </div>
      ) : participantsError && visibleParticipants.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>{participantsError}</p>
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => refreshParticipants()}
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredParticipants.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>
            {hasActiveFilters
              ? "Nenhum participante encontrado para esta busca."
              : "Nenhum participante visível no momento."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={clearFilters}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableCaptionId}
          className={styles.tableWrapper}
        >
          <table className={styles.table}>
            <caption id={tableCaptionId} className="visually-hidden">
              Lista de participantes
            </caption>

            <thead>
              <tr>
                <th scope="col">PARTICIPANTE</th>
                <th scope="col">MINISTÉRIO</th>
                <th scope="col">PAPEL</th>
                {showStatusColumn && <th scope="col">STATUS</th>}
                {hasAnyRowActions && (
                  <th scope="col" className={styles.actionsHeader}>
                    <span className="visually-hidden">Ações</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredParticipants.map((person) => {
                const isSelf = person.id === currentUser.id;
                const displayStatus = getDisplayMemberStatus(currentUser, person);
                const displayStatusLabel = (
                  STATUS_META[displayStatus] ||
                  STATUS_META[CREDENTIAL_STATUS.ACTIVE]
                ).label;
                const isRevoked = displayStatus === CREDENTIAL_STATUS.INACTIVE;
                const isPending = displayStatus === CREDENTIAL_STATUS.PENDING;
                const isRecovering =
                  displayStatus === CREDENTIAL_STATUS.RECOVERING;
                const isCopied = copiedParticipantId === person.id;
                const isCopying = copyingParticipantId === person.id;

                const showCopyButton = canCopyCredentialNumber(
                  currentUser,
                  person
                );
                const showRegenerateButton =
                  !isSelf && canRegenerateCredentialNumber(currentUser, person);
                const showToggleStatus = canToggleStatus(currentUser, person);
                const showEdit = canEditParticipant(currentUser, person);
                const showDelete = canDeleteParticipant(currentUser, person);

                const statusPillClass = isRevoked
                  ? styles.statusPillRevoked
                  : isPending
                    ? styles.statusPillPending
                    : isRecovering
                      ? styles.statusPillRecovering
                      : "";

                return (
                  <tr key={person.id}>
                    <th scope="row" className={styles.participantCell}>
                      <div className={styles.participantIdentity}>
                        <span className={styles.avatar} aria-hidden="true">
                          {person.initials}
                        </span>
                        <div className={styles.identityText}>
                          <span className={styles.memberNameRow}>
                            <span className={styles.memberName}>
                              {person.name}
                            </span>
                            {isSelf && (
                              <span className={styles.selfBadge}>Você</span>
                            )}
                          </span>
                          <span className={styles.memberHandle}>
                            {person.handle ||
                              (showStatusColumn && isPending
                                ? "Aguardando 1º acesso"
                                : "Sem apelido")}
                          </span>
                        </div>
                      </div>
                    </th>

                    <td data-label="Ministério">
                      <div className={styles.ministriesCellWrap}>
                        {person.ministries.length > 0 ? (
                          <div className={styles.ministriesGroup}>
                            {person.ministries.map((ministry) => (
                              <span
                                key={ministry}
                                className={styles.ministryPill}
                              >
                                {ministry}
                              </span>
                            ))}
                          </div>
                        ) : person.roleCode === ROLES.ADMINISTRATOR ? (
                          <span className={styles.globalMinistryPill}>
                            Global
                          </span>
                        ) : (
                          <span className={styles.noMinistryLabel}>—</span>
                        )}

                        {(isSelf ||
                          isAtLeast(currentUser, ROLES.SCHEDULER_MANAGER)) &&
                          person.pendingTransfer?.to?.name && (
                            <span className={styles.transferPendingNote}>
                              Transferência → {person.pendingTransfer.to.name}
                            </span>
                          )}
                      </div>
                    </td>

                    <td data-label="Papel" className={styles.roleCell}>
                      {person.role}
                    </td>

                    {showStatusColumn && (
                      <td data-label="Status">
                        <span
                          className={`${styles.statusPill} ${statusPillClass}`}
                        >
                          <span
                            className={styles.statusDot}
                            aria-hidden="true"
                          />
                          {displayStatusLabel}
                        </span>
                      </td>
                    )}

                    {hasAnyRowActions && (
                      <td data-label="Ações" className={styles.actionsCell}>
                        <div className={styles.rowActions}>
                          {showCopyButton && (
                            <button
                              type="button"
                              disabled={isCopying}
                              title="Copiar mensagem de acesso"
                              aria-label={`Copiar mensagem de acesso para ${person.name}`}
                              className={`${styles.iconActionButton} ${
                                isCopied ? styles.iconActionCopied : ""
                              }`}
                              onClick={() => handleCopyCredential(person)}
                            >
                              {isCopied ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          )}

                          {showRegenerateButton && (
                            <button
                              type="button"
                              title="Gerar novo código de recuperação"
                              aria-label={`Gerar novo código de credencial para ${person.name}`}
                              className={styles.iconActionButton}
                              onClick={() =>
                                openConfirmModal({
                                  type: "regenerate",
                                  participant: person,
                                })
                              }
                            >
                              <RefreshCwIcon />
                            </button>
                          )}

                          {showToggleStatus && (
                            <button
                              type="button"
                              title={
                                isRevoked
                                  ? "Reativar credencial"
                                  : "Desativar credencial"
                              }
                              aria-label={
                                isRevoked
                                  ? `Reativar acesso de ${person.name}`
                                  : `Desativar acesso de ${person.name}`
                              }
                              className={`${styles.iconActionButton} ${
                                isRevoked
                                  ? styles.iconActionRestore
                                  : styles.iconActionDanger
                              }`}
                              onClick={() =>
                                openConfirmModal({
                                  type: isRevoked ? "restore" : "revoke",
                                  participant: person,
                                })
                              }
                            >
                              {isRevoked ? <ShieldCheckIcon /> : <ShieldOffIcon />}
                            </button>
                          )}

                          {showEdit && (
                            <button
                              type="button"
                              title="Editar papel e ministério"
                              aria-label={`Editar papel e ministério de ${person.name}`}
                              className={styles.iconActionButton}
                              onClick={() => handleOpenEditDrawer(person)}
                            >
                              <PencilIcon />
                            </button>
                          )}

                          {showDelete && (
                            <button
                              type="button"
                              title="Excluir participante"
                              aria-label={`Excluir participante ${person.name}`}
                              className={`${styles.iconActionButton} ${styles.iconActionDanger}`}
                              onClick={() =>
                                openConfirmModal({
                                  type: "delete",
                                  participant: person,
                                })
                              }
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal (<dialog>) for Regenerate / Revoke / Restore / Delete */}
      <dialog
        ref={confirmDialogRef}
        closedby="any"
        aria-labelledby={confirmModalTitleId}
        className={styles.confirmDialog}
        onCancel={(event) => {
          if (isConfirmingAction) {
            event.preventDefault();
          }
        }}
        onClose={handleConfirmDialogClose}
      >
        <form className={styles.confirmForm} onSubmit={handleConfirmAction}>
          <div className={styles.confirmHeader}>
            <div>
              <p className={styles.confirmEyebrow}>CONFIRMAÇÃO NECESSÁRIA</p>
              <h2 id={confirmModalTitleId} className={styles.confirmTitle}>
                {confirmModal?.type === "regenerate"
                  ? "Gerar novo código de recuperação?"
                  : confirmModal?.type === "revoke"
                    ? "Desativar credencial?"
                    : confirmModal?.type === "restore"
                      ? "Reativar credencial?"
                      : "Excluir participante?"}
              </h2>
            </div>

            <button
              type="button"
              aria-label="Fechar confirmação"
              className={styles.confirmCloseBtn}
              disabled={isConfirmingAction}
              onClick={() => confirmDialogRef.current?.close("cancel")}
            >
              <CloseIcon />
            </button>
          </div>

          <div className={styles.confirmBody}>
            <div
              className={`${styles.confirmCallout} ${
                confirmModal?.type === "regenerate"
                  ? styles.confirmCalloutWarning
                  : confirmModal?.type === "restore"
                    ? styles.confirmCalloutSuccess
                    : styles.confirmCalloutDanger
              }`}
            >
              <span
                className={`${styles.confirmBadge} ${
                  confirmModal?.type === "regenerate"
                    ? styles.confirmBadgeWarning
                    : confirmModal?.type === "restore"
                      ? styles.confirmBadgeSuccess
                      : styles.confirmBadgeDanger
                }`}
                aria-hidden="true"
              >
                {confirmModal?.type === "restore" ? (
                  <ShieldCheckIcon />
                ) : (
                  <AlertTriangleIcon />
                )}
              </span>

              <div>
                <h3 className={styles.confirmCalloutTitle}>
                  Revise antes de continuar
                </h3>
                <p className={styles.confirmCalloutDesc}>
                  {confirmModal?.type === "regenerate" &&
                    confirmModal.participant && (
                      <>
                        Um novo código temporário será gerado para{" "}
                        <strong>{confirmModal.participant.name}</strong> e todos
                        os dispositivos conectados serão desconectados.
                      </>
                    )}
                  {confirmModal?.type === "revoke" &&
                    confirmModal.participant && (
                      <>
                        O acesso de{" "}
                        <strong>{confirmModal.participant.name}</strong> será
                        desativado e todas as sessões abertas serão encerradas
                        imediatamente.
                      </>
                    )}
                  {confirmModal?.type === "restore" &&
                    confirmModal.participant && (
                      <>
                        A conta de{" "}
                        <strong>{confirmModal.participant.name}</strong> será
                        reativada em modo de recuperação, gerando um novo código
                        temporário para você enviar.
                      </>
                    )}
                  {confirmModal?.type === "delete" &&
                    confirmModal.participant && (
                      <>
                        O participante{" "}
                        <strong>{confirmModal.participant.name}</strong> será
                        removido definitivamente da equipe. Esta ação não poderá
                        ser desfeita.
                      </>
                    )}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.confirmFooter}>
            <button
              ref={confirmCancelBtnRef}
              type="button"
              autoFocus
              className={styles.confirmCancelBtn}
              disabled={isConfirmingAction}
              onClick={() => confirmDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isConfirmingAction}
              aria-busy={isConfirmingAction}
              className={
                confirmModal?.type === "regenerate" ||
                confirmModal?.type === "restore"
                  ? styles.confirmPrimaryBtn
                  : styles.confirmDangerBtn
              }
            >
              {isConfirmingAction
                ? "Processando..."
                : confirmModal?.type === "regenerate"
                  ? "Gerar novo código"
                  : confirmModal?.type === "revoke"
                    ? "Desativar acesso"
                    : confirmModal?.type === "restore"
                      ? "Reativar acesso"
                      : "Excluir membro"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
