"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import {
  changeCredentialRole,
  setCredentialDepartments,
} from "@/features/participants/services/credentialsService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import { CREDENTIAL_STATUS, getRoleLabel, ROLES } from "@/lib/roles";
import styles from "./MinistriesView.module.css";

const CANDIDATE_BATCH_SIZE = 24;
const DEFERRED_CARD_THRESHOLD = 10;

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function MinistryAssignLeaderDrawer({ ministryId, onClose }) {
  const router = useRouter();
  const {
    ministries,
    participants,
    refreshParticipants,
    refreshDepartments,
    refreshCurrentUser,
    notifySchedulesChanged,
    openWorkspaceDrawer,
  } = usePrivateWorkspace();
  const toast = useToast();

  const drawerTitleId = useId();
  const gmHelpPopoverId = useId();
  const candidateSearchId = useId();
  const candidateErrorId = useId();

  const dialogRef = useRef(null);
  const gmHelpPopoverRef = useRef(null);
  const candidateSearchRef = useRef(null);
  const announceTimerRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateScope, setCandidateScope] = useState("all");
  const [candidateVisibleCount, setCandidateVisibleCount] = useState(
    CANDIDATE_BATCH_SIZE
  );
  const [candidateError, setCandidateError] = useState("");
  const [assignFormError, setAssignFormError] = useState("");
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [isGmHelpOpen, setIsGmHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const deferredCandidateQuery = useDeferredValue(candidateQuery);

  const assignTarget = useMemo(
    () => ministries.find((item) => item.id === ministryId) || null,
    [ministries, ministryId]
  );

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

    const helpPopover = gmHelpPopoverRef.current;
    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      candidateSearchRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      isCleaningUpRef.current = true;
      try {
        if (helpPopover?.matches(":popover-open")) {
          helpPopover.hidePopover();
        }
      } catch {
        // Ignore if popover is already closed
      }
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute("data-closing");
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isSavingAssign,
    });
  }, [isSavingAssign]);

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
    try {
      if (gmHelpPopoverRef.current?.matches(":popover-open")) {
        gmHelpPopoverRef.current.hidePopover();
      }
    } catch {
      // Ignore if popover is already closed
    }
    onClose?.();
  };

  const assignCandidates = useMemo(() => {
    if (!assignTarget) {
      return {
        activeMembers: [],
        currentGeneralManagers: [],
        promotableMembers: [],
        otherGeneralManagers: [],
      };
    }

    const activeMembers = participants.filter(
      (person) =>
        person.status !== CREDENTIAL_STATUS.INACTIVE &&
        person.departmentIds?.includes(assignTarget.id)
    );
    const currentGeneralManagers = activeMembers.filter(
      (person) => person.roleCode === ROLES.GENERAL_MANAGER
    );
    const promotableMembers = activeMembers.filter(
      (person) =>
        person.roleCode !== ROLES.GENERAL_MANAGER &&
        person.roleCode !== ROLES.ADMINISTRATOR
    );
    const otherGeneralManagers = participants.filter(
      (person) =>
        person.status !== CREDENTIAL_STATUS.INACTIVE &&
        person.roleCode === ROLES.GENERAL_MANAGER &&
        !person.departmentIds?.includes(assignTarget.id)
    );

    return {
      activeMembers,
      currentGeneralManagers,
      promotableMembers,
      otherGeneralManagers,
    };
  }, [assignTarget, participants]);

  const indexedCandidates = useMemo(() => {
    const buildIndex = (person) =>
      normalizeSearchText(
        [
          person.name,
          person.username,
          person.handle,
          getRoleLabel(person.roleCode),
          ...(person.ministries || []),
        ]
          .filter(Boolean)
          .join(" ")
      );

    return {
      promotable: assignCandidates.promotableMembers.map((person) => ({
        person,
        searchIndex: buildIndex(person),
      })),
      otherGms: assignCandidates.otherGeneralManagers.map((person) => ({
        person,
        searchIndex: buildIndex(person),
      })),
    };
  }, [assignCandidates]);

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredCandidateQuery);
    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/) : [];

    const matchesQuery = (entry) =>
      tokens.length === 0 ||
      tokens.every((token) => entry.searchIndex.includes(token));

    const matchedPromotable =
      candidateScope === "managers"
        ? []
        : indexedCandidates.promotable
            .filter(matchesQuery)
            .map((entry) => entry.person);

    const matchedOtherGms =
      candidateScope === "members"
        ? []
        : indexedCandidates.otherGms
            .filter(matchesQuery)
            .map((entry) => entry.person);

    const promotable = matchedPromotable.slice(0, candidateVisibleCount);
    const remainingBudget = Math.max(
      0,
      candidateVisibleCount - promotable.length
    );
    const otherGms = matchedOtherGms.slice(0, remainingBudget);

    const totalPromotable = matchedPromotable.length;
    const totalOtherGms = matchedOtherGms.length;
    const totalFiltered = totalPromotable + totalOtherGms;
    const shownCount = promotable.length + otherGms.length;

    return {
      promotable,
      otherGms,
      totalPromotable,
      totalOtherGms,
      totalFiltered,
      shownCount,
      hiddenCount: Math.max(0, totalFiltered - shownCount),
    };
  }, [
    candidateScope,
    candidateVisibleCount,
    deferredCandidateQuery,
    indexedCandidates,
  ]);

  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateId) return null;
    return (
      assignCandidates.promotableMembers.find(
        (person) => person.id === selectedCandidateId
      ) ||
      assignCandidates.otherGeneralManagers.find(
        (person) => person.id === selectedCandidateId
      ) ||
      null
    );
  }, [assignCandidates, selectedCandidateId]);

  const handleGoToCreateParticipant = () => {
    if (!assignTarget) return;
    openWorkspaceDrawer("participant-form", {
      mode: "create",
      preset: {
        departmentId: assignTarget.id,
        role: ROLES.VOLUNTEER,
      },
    });
    router.push("/participants");
  };

  const handleAssignSubmit = async (event) => {
    event.preventDefault();
    if (isSavingAssign || !assignTarget) return;

    setAssignFormError("");
    if (!selectedCandidateId) {
      const msg = "Selecione um usuário para definir como Líder Geral.";
      setCandidateError(msg);
      announce(msg);
      candidateSearchRef.current?.focus();
      return;
    }

    const candidate = participants.find((p) => p.id === selectedCandidateId);
    if (!candidate) {
      setCandidateError(
        "Participante não encontrado. Atualize e tente novamente."
      );
      return;
    }

    const nextDepartmentIds = [
      ...new Set([...(candidate.departmentIds || []), assignTarget.id]),
    ];

    setIsSavingAssign(true);
    const result =
      candidate.roleCode === ROLES.GENERAL_MANAGER
        ? await setCredentialDepartments(candidate.id, nextDepartmentIds)
        : await changeCredentialRole(candidate.id, {
            role: ROLES.GENERAL_MANAGER,
            departmentIds: nextDepartmentIds,
          });
    setIsSavingAssign(false);

    if (!result.ok) {
      setAssignFormError(
        result.error ||
          "Não foi possível vincular o Líder Geral a este ministério."
      );
      return;
    }

    await Promise.all([
      refreshParticipants({ silent: true }),
      refreshDepartments(),
      refreshCurrentUser(),
    ]);
    notifySchedulesChanged();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(
      `${candidate.name} definido(a) como Líder Geral de "${assignTarget.name}".`
    );
  };

  const handleUnlinkGeneralManager = async (manager) => {
    if (isSavingAssign || !assignTarget) return;

    const remainingIds = (manager.departmentIds || []).filter(
      (id) => id !== assignTarget.id
    );
    const hasOtherDepartments = remainingIds.length > 0;

    setAssignFormError("");
    setIsSavingAssign(true);
    const result = hasOtherDepartments
      ? await setCredentialDepartments(manager.id, remainingIds)
      : await changeCredentialRole(manager.id, {
          role: ROLES.VOLUNTEER,
          departmentIds: [assignTarget.id],
        });
    setIsSavingAssign(false);

    if (!result.ok) {
      setAssignFormError(
        result.error ||
          "Não foi possível remover este Líder Geral do ministério."
      );
      return;
    }

    await Promise.all([
      refreshParticipants({ silent: true }),
      refreshDepartments(),
      refreshCurrentUser(),
    ]);
    notifySchedulesChanged();
    toast.success(
      hasOtherDepartments
        ? `${manager.name} desvinculado(a) de "${assignTarget.name}".`
        : `${manager.name} deixou de ser Líder Geral e permaneceu como Membro Voluntário em "${assignTarget.name}".`
    );
  };

  const hasSelectableCandidates =
    assignCandidates.promotableMembers.length > 0 ||
    assignCandidates.otherGeneralManagers.length > 0;
  const totalSelectableCount =
    assignCandidates.promotableMembers.length +
    assignCandidates.otherGeneralManagers.length;
  const hasBothCandidateGroups =
    assignCandidates.promotableMembers.length > 0 &&
    assignCandidates.otherGeneralManagers.length > 0;
  const isCandidateListFiltered =
    Boolean(normalizeSearchText(deferredCandidateQuery)) ||
    candidateScope !== "all";

  const renderCandidateCard = (person, subtitle, globalIndex) => {
    const isSelected = selectedCandidateId === person.id;

    return (
      <label
        key={person.id}
        className={`${styles.candidateCard} ${
          isSelected ? styles.candidateCardSelected : ""
        } ${
          globalIndex >= DEFERRED_CARD_THRESHOLD
            ? styles.candidateCardDeferred
            : ""
        }`}
      >
        <input
          type="radio"
          name="candidateId"
          value={person.id}
          checked={isSelected}
          className="visually-hidden"
          onChange={() => {
            setSelectedCandidateId(person.id);
            if (candidateError) setCandidateError("");
            if (assignFormError) setAssignFormError("");
          }}
        />

        <span className={styles.candidateCardAvatar} aria-hidden="true">
          {person.initials}
        </span>

        <span className={styles.candidateCardText}>
          <span className={styles.candidateCardName} title={person.name}>
            {person.name}
          </span>
          <span className={styles.candidateCardMeta}>
            {person.handle || "Primeiro acesso pendente"}
          </span>
          <span className={styles.candidateCardRole} title={subtitle}>
            {subtitle}
          </span>
        </span>

        {isSelected && (
          <span className={styles.candidateCardCheck} aria-hidden="true">
            <CheckIcon />
          </span>
        )}
      </label>
    );
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
          if (!isSavingAssign) {
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
        <div className={styles.drawerHeaderText}>
          <p className={styles.drawerEyebrow}>GESTÃO DO MINISTÉRIO</p>
          <div className={styles.drawerTitleRow}>
            <h2 id={drawerTitleId} className={styles.drawerTitle}>
              {assignTarget
                ? `Líder Geral — ${assignTarget.name}`
                : "Líder Geral"}
            </h2>

            <button
              type="button"
              popoverTarget={gmHelpPopoverId}
              aria-label="O que faz o Líder Geral do ministério?"
              aria-expanded={isGmHelpOpen}
              className={styles.helpTriggerButton}
            >
              <span aria-hidden="true">?</span>
            </button>

            <div
              ref={gmHelpPopoverRef}
              id={gmHelpPopoverId}
              popover="auto"
              role="tooltip"
              className={styles.helpPopover}
              onToggle={(event) => {
                const nextState = event?.nativeEvent?.newState;
                setIsGmHelpOpen(
                  nextState
                    ? nextState === "open"
                    : Boolean(event.currentTarget?.matches?.(":popover-open"))
                );
              }}
            >
              <div className={styles.helpPopoverHeader}>
                <div>
                  <p className={styles.helpPopoverEyebrow}>PAPEL &amp; ESCOPO</p>
                  <h3 className={styles.helpPopoverTitle}>
                    O que faz o Líder Geral?
                  </h3>
                </div>
                <button
                  type="button"
                  popoverTarget={gmHelpPopoverId}
                  popoverTargetAction="hide"
                  aria-label="Fechar explicação"
                  className={styles.helpPopoverClose}
                >
                  <CloseIcon />
                </button>
              </div>

              <p className={styles.helpPopoverLead}>
                Responsável pela liderança operacional de um ou mais
                ministérios:
              </p>

              <ul className={styles.helpPopoverList}>
                <li>
                  <strong>Múltiplos ministérios:</strong> pode gerenciar um ou
                  mais ministérios simultaneamente.
                </li>
                <li>
                  <strong>Gestão da equipe:</strong> cadastra membros, altera
                  papéis abaixo do seu e desativa, reativa ou exclui contas dos
                  seus ministérios.
                </li>
                <li>
                  <strong>Credenciais e acessos:</strong> gera códigos
                  temporários de recuperação e encerra sessões de membros sob
                  sua gestão.
                </li>
                <li>
                  <strong>Transferências:</strong> solicita ou aprova trocas de
                  participantes entre ministérios (não edita nem exclui
                  ministérios).
                </li>
              </ul>
            </div>
          </div>
        </div>

        <button
          type="button"
          aria-label="Fechar painel"
          className={styles.drawerCloseButton}
          disabled={isSavingAssign}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <form
        className={styles.drawerForm}
        noValidate
        onSubmit={handleAssignSubmit}
      >
        <div className={styles.drawerBody}>
          {assignTarget && assignCandidates.activeMembers.length === 0 && (
            <div className={styles.warningCallout}>
              <span className={styles.warningBadge} aria-hidden="true">
                <AlertTriangleIcon />
              </span>
              <div className={styles.warningBody}>
                <h3 className={styles.warningTitle}>
                  Nenhum usuário vinculado a este ministério
                </h3>
                <p className={styles.warningText}>
                  Primeiro crie um usuário vinculado a{" "}
                  <strong>{assignTarget.name}</strong> na área de Participantes
                  para que ele possa gerenciar este ministério.
                  {assignCandidates.otherGeneralManagers.length > 0 &&
                    " Se preferir, você também pode vincular abaixo um Líder Geral de outro ministério."}
                </p>
                <button
                  type="button"
                  className={styles.warningActionBtn}
                  onClick={handleGoToCreateParticipant}
                >
                  <UserPlusIcon />
                  <span>Criar usuário para este ministério</span>
                </button>
              </div>
            </div>
          )}

          {assignCandidates.currentGeneralManagers.length > 0 && (
            <section className={styles.currentManagersBox}>
              <h3 className={styles.sectionTitle}>
                Líderes Gerais atuais neste ministério
              </h3>
              <ul className={styles.managersList}>
                {assignCandidates.currentGeneralManagers.map((manager) => {
                  const hasOtherDepartments =
                    (manager.departmentIds?.length || 0) > 1;
                  return (
                    <li key={manager.id} className={styles.managerListItem}>
                      <div className={styles.managerIdentity}>
                        <span className={styles.avatarChip} aria-hidden="true">
                          {manager.initials}
                        </span>
                        <div className={styles.managerIdentityText}>
                          <p className={styles.managerName}>{manager.name}</p>
                          <p className={styles.managerMeta}>
                            {manager.handle || "Primeiro acesso pendente"}
                            {!hasOtherDepartments &&
                              " · Líder Geral exclusivo deste ministério"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isSavingAssign}
                        title={
                          hasOtherDepartments
                            ? `Desvincular ${manager.name} deste ministério`
                            : "Remove do cargo de Líder Geral e mantém como Membro Voluntário neste ministério"
                        }
                        className={styles.unlinkButton}
                        onClick={() => handleUnlinkGeneralManager(manager)}
                      >
                        {hasOtherDepartments
                          ? "Desvincular"
                          : "Remover liderança"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {hasSelectableCandidates && assignTarget && (
            <fieldset
              className={styles.candidateFieldset}
              aria-describedby={candidateError ? candidateErrorId : undefined}
            >
              <div className={styles.candidateFieldHeader}>
                <legend className={styles.fieldLabel}>
                  Selecionar novo Líder Geral
                </legend>
                <span className={styles.candidateCountBadge}>
                  {isCandidateListFiltered
                    ? `${filteredCandidates.totalFiltered} de ${totalSelectableCount}`
                    : `${totalSelectableCount} ${
                        totalSelectableCount === 1 ? "pessoa" : "pessoas"
                      }`}
                </span>
              </div>

              <div className={styles.candidateSearchWrap}>
                <label htmlFor={candidateSearchId} className="visually-hidden">
                  Buscar pessoa para definir como Líder Geral
                </label>
                <SearchIcon className={styles.candidateSearchIcon} />
                <input
                  ref={candidateSearchRef}
                  id={candidateSearchId}
                  type="search"
                  value={candidateQuery}
                  placeholder="Buscar por nome, @apelido, papel ou ministério..."
                  autoCorrect="off"
                  spellCheck={false}
                  className={styles.candidateSearchInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                    }
                  }}
                  onChange={(event) => {
                    setCandidateQuery(event.currentTarget.value);
                    setCandidateVisibleCount(CANDIDATE_BATCH_SIZE);
                    if (candidateError) setCandidateError("");
                  }}
                />
                {candidateQuery && (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    className={styles.candidateSearchClear}
                    onClick={() => {
                      setCandidateQuery("");
                      setCandidateVisibleCount(CANDIDATE_BATCH_SIZE);
                      candidateSearchRef.current?.focus();
                    }}
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>

              {hasBothCandidateGroups && (
                <div
                  className={styles.candidateScopeRow}
                  role="group"
                  aria-label="Filtrar origem dos candidatos"
                >
                  <button
                    type="button"
                    aria-pressed={candidateScope === "all"}
                    className={`${styles.candidateScopePill} ${
                      candidateScope === "all"
                        ? styles.candidateScopePillActive
                        : ""
                    }`}
                    onClick={() => {
                      setCandidateScope("all");
                      setCandidateVisibleCount(CANDIDATE_BATCH_SIZE);
                    }}
                  >
                    Todos ({totalSelectableCount})
                  </button>
                  <button
                    type="button"
                    aria-pressed={candidateScope === "members"}
                    className={`${styles.candidateScopePill} ${
                      candidateScope === "members"
                        ? styles.candidateScopePillActive
                        : ""
                    }`}
                    onClick={() => {
                      setCandidateScope("members");
                      setCandidateVisibleCount(CANDIDATE_BATCH_SIZE);
                    }}
                  >
                    Deste ministério ({assignCandidates.promotableMembers.length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={candidateScope === "managers"}
                    className={`${styles.candidateScopePill} ${
                      candidateScope === "managers"
                        ? styles.candidateScopePillActive
                        : ""
                    }`}
                    onClick={() => {
                      setCandidateScope("managers");
                      setCandidateVisibleCount(CANDIDATE_BATCH_SIZE);
                    }}
                  >
                    Líderes de outros (
                    {assignCandidates.otherGeneralManagers.length})
                  </button>
                </div>
              )}

              {selectedCandidate && (
                <div className={styles.selectedCandidateBanner}>
                  <div className={styles.selectedCandidateInfo}>
                    <span
                      className={styles.candidateCardAvatar}
                      aria-hidden="true"
                    >
                      {selectedCandidate.initials}
                    </span>
                    <div className={styles.candidateCardText}>
                      <span className={styles.candidateCardName}>
                        {selectedCandidate.name}
                      </span>
                      <span className={styles.selectedCandidateMeta}>
                        {selectedCandidate.handle ||
                          "Primeiro acesso pendente"}{" "}
                        ·{" "}
                        {selectedCandidate.roleCode === ROLES.GENERAL_MANAGER
                          ? "Será vinculado(a) a este ministério"
                          : "Será promovido(a) a Líder Geral"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.selectedCandidateClear}
                    onClick={() => setSelectedCandidateId("")}
                  >
                    Limpar
                  </button>
                </div>
              )}

              <div
                className={`${styles.candidateListViewport} ${
                  candidateError ? styles.candidateListViewportError : ""
                }`}
              >
                {filteredCandidates.totalFiltered === 0 ? (
                  <div className={styles.candidateEmpty}>
                    <p>
                      Nenhuma pessoa encontrada
                      {candidateQuery.trim()
                        ? ` para "${candidateQuery.trim()}"`
                        : ""}
                      .
                    </p>
                    <button
                      type="button"
                      className={styles.candidateEmptyReset}
                      onClick={() => {
                        setCandidateQuery("");
                        setCandidateScope("all");
                        setCandidateVisibleCount(CANDIDATE_BATCH_SIZE);
                        candidateSearchRef.current?.focus();
                      }}
                    >
                      Limpar filtros
                    </button>
                  </div>
                ) : (
                  <>
                    {filteredCandidates.promotable.length > 0 && (
                      <div className={styles.candidateGroup}>
                        <div className={styles.candidateGroupHeader}>
                          <span className={styles.candidateGroupTitle}>
                            Membros de {assignTarget.name} · Promover a Líder
                            Geral
                          </span>
                          <span className={styles.candidateGroupCount}>
                            {filteredCandidates.totalPromotable}
                          </span>
                        </div>
                        <div className={styles.candidateGrid}>
                          {filteredCandidates.promotable.map((person, idx) =>
                            renderCandidateCard(
                              person,
                              getRoleLabel(person.roleCode),
                              idx
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {filteredCandidates.otherGms.length > 0 && (
                      <div className={styles.candidateGroup}>
                        <div className={styles.candidateGroupHeader}>
                          <span className={styles.candidateGroupTitle}>
                            Líderes Gerais de outros ministérios · Vincular
                          </span>
                          <span className={styles.candidateGroupCount}>
                            {filteredCandidates.totalOtherGms}
                          </span>
                        </div>
                        <div className={styles.candidateGrid}>
                          {filteredCandidates.otherGms.map((person, idx) =>
                            renderCandidateCard(
                              person,
                              person.ministries?.length
                                ? person.ministries.join(", ")
                                : "Líder Geral",
                              filteredCandidates.promotable.length + idx
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {filteredCandidates.hiddenCount > 0 && (
                      <div className={styles.candidateLoadMoreRow}>
                        <span className={styles.candidateLoadMoreText}>
                          Mostrando {filteredCandidates.shownCount} de{" "}
                          {filteredCandidates.totalFiltered} pessoas
                        </span>
                        <button
                          type="button"
                          className={styles.candidateLoadMoreBtn}
                          onClick={() =>
                            setCandidateVisibleCount(
                              (prev) => prev + CANDIDATE_BATCH_SIZE
                            )
                          }
                        >
                          Mostrar mais (+
                          {Math.min(
                            CANDIDATE_BATCH_SIZE,
                            filteredCandidates.hiddenCount
                          )}
                          )
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {candidateError && (
                <div id={candidateErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{candidateError}</span>
                </div>
              )}
            </fieldset>
          )}

          {assignTarget && assignCandidates.activeMembers.length > 0 && (
            <div className={styles.infoNote}>
              Precisa cadastrar uma nova pessoa vinculada a{" "}
              <strong>{assignTarget.name}</strong> para depois defini-la como
              Líder Geral?{" "}
              <button
                type="button"
                className={styles.inlineLinkButton}
                onClick={handleGoToCreateParticipant}
              >
                Criar usuário em Participantes
              </button>
              .
            </div>
          )}

          {assignFormError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{assignFormError}</span>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.drawerCancelButton}
            disabled={isSavingAssign}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Fechar
          </button>

          {hasSelectableCandidates && (
            <button
              type="submit"
              className={styles.drawerSubmitButton}
              disabled={isSavingAssign}
              aria-busy={isSavingAssign}
            >
              {isSavingAssign ? "Salvando..." : "Confirmar Líder Geral"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
