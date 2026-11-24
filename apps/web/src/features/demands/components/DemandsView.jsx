"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardListIcon,
  CloseIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  deleteDemand,
  listDemands,
  updateDemand,
} from "@/features/demands/services/demandsService";
import {
  canCreateDemandsIn,
  canDeleteDemand,
  canEditDemand,
  canToggleDemandStatus,
  computeInitials,
  computeMinistryCode,
  getAssignableDepartments,
  isAdmin,
  resolveRoleCode,
  ROLES,
} from "@/lib/roles";
import styles from "./DemandsView.module.css";

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDatePtBr(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

const STATUS_FILTERS = [
  { id: "ALL", label: "Todas" },
  { id: "IN_PROGRESS", label: "Em progresso" },
  { id: "COMPLETED", label: "Finalizadas" },
];

export function DemandsView() {
  const {
    currentUser,
    activeMinistry,
    setActiveMinistry,
    departments,
    openWorkspaceDrawer,
    demandsVersion,
    notifyDemandsChanged,
    syncVersion,
  } = usePrivateWorkspace();
  const toast = useToast();

  const searchInputId = useId();
  const ministryFilterId = useId();
  const deleteTitleId = useId();
  const deleteDescId = useId();

  const deleteDialogRef = useRef(null);
  const fetchSeqRef = useRef(0);

  const roleCode = resolveRoleCode(currentUser);
  const userIsAdmin = isAdmin(currentUser);
  const isGeneralManager = roleCode === ROLES.GENERAL_MANAGER;

  const demandDepartments = useMemo(() => {
    const pool = userIsAdmin
      ? departments
      : getAssignableDepartments(currentUser, departments);
    return pool.filter((dept) => Boolean(dept?.hasDemands));
  }, [currentUser, departments, userIsAdmin]);

  const activeDepartment = useMemo(() => {
    if (userIsAdmin) return null;
    if (isGeneralManager) {
      if (!activeMinistry?.id || activeMinistry.isGlobal) return null;
      return (
        demandDepartments.find((dept) => dept.id === activeMinistry.id) || null
      );
    }
    return demandDepartments[0] || null;
  }, [
    activeMinistry,
    demandDepartments,
    isGeneralManager,
    userIsAdmin,
  ]);

  const scopedDepartmentId = userIsAdmin
    ? ""
    : activeDepartment?.id || "";

  const canCreateCurrentScope = userIsAdmin
    ? demandDepartments.length > 0
    : Boolean(
        activeDepartment?.id &&
          canCreateDemandsIn(currentUser, activeDepartment.id)
      );

  const [demands, setDemands] = useState([]);
  const [nowMs, setNowMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [ministryFilter, setMinistryFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const shouldFetchDemands =
    userIsAdmin || Boolean(scopedDepartmentId);

  const loadDemands = useCallback(async () => {
    if (!shouldFetchDemands) {
      setDemands([]);
      setIsLoading(false);
      setLoadError("");
      return;
    }

    const seq = ++fetchSeqRef.current;
    const res = await listDemands(
      scopedDepartmentId ? { departmentId: scopedDepartmentId } : {}
    );
    if (seq !== fetchSeqRef.current) return;

    setIsLoading(false);
    setNowMs(Date.now());
    if (res.ok && Array.isArray(res.data)) {
      setDemands(res.data);
      setLoadError("");
    } else {
      setLoadError(res.error || "Não foi possível carregar as demandas.");
    }
  }, [scopedDepartmentId, shouldFetchDemands]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadDemands();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadDemands, demandsVersion, syncVersion]);

  useEffect(() => {
    return setupClosedByFallback(deleteDialogRef.current, () => {
      if (!isDeleting) {
        deleteDialogRef.current?.close("cancel");
      }
    });
  }, [isDeleting]);

  const selectedMinistryFilter =
    userIsAdmin &&
    ministryFilter &&
    demandDepartments.some((dept) => dept.id === ministryFilter)
      ? ministryFilter
      : "";

  const ministryFilteredDemands = useMemo(() => {
    if (!selectedMinistryFilter) return demands;
    return demands.filter(
      (item) => item.department?.id === selectedMinistryFilter
    );
  }, [demands, selectedMinistryFilter]);

  const counts = useMemo(() => {
    let inProgress = 0;
    let completed = 0;
    for (const item of ministryFilteredDemands) {
      if (item.status === "COMPLETED") completed += 1;
      else inProgress += 1;
    }
    return {
      ALL: ministryFilteredDemands.length,
      IN_PROGRESS: inProgress,
      COMPLETED: completed,
    };
  }, [ministryFilteredDemands]);

  const visibleDemands = useMemo(() => {
    const query = normalizeText(searchQuery);
    return ministryFilteredDemands.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) {
        return false;
      }
      if (!query) return true;
      const assigneeTerms = Array.isArray(item.assignees)
        ? item.assignees.flatMap((person) => [person?.name, person?.username])
        : [];
      const haystack = normalizeText(
        [item.title, item.description, item.department?.name, ...assigneeTerms]
          .filter(Boolean)
          .join(" ")
      );
      return haystack.includes(query);
    });
  }, [ministryFilteredDemands, searchQuery, statusFilter]);

  const handleOpenCreate = () => {
    if (!canCreateCurrentScope) return;
    openWorkspaceDrawer("demand-form", {
      mode: "create",
      defaultDepartmentId: selectedMinistryFilter || scopedDepartmentId || "",
    });
  };

  const handleOpenEdit = (demand) => {
    if (!demand || !canEditDemand(currentUser, demand)) {
      return;
    }
    openWorkspaceDrawer("demand-form", {
      mode: "edit",
      demand,
    });
  };

  const handleQuickToggleStatus = async (demand) => {
    if (!demand || togglingId || !canToggleDemandStatus(currentUser, demand)) {
      return;
    }
    const isCompleting = demand.status !== "COMPLETED";
    const hasAssignees =
      Array.isArray(demand.assignees) && demand.assignees.length > 0;

    if (isCompleting && !hasAssignees) {
      toast.error(
        "Associe ao menos um responsável para finalizar esta demanda."
      );
      handleOpenEdit(demand);
      return;
    }

    const nextStatus = isCompleting ? "COMPLETED" : "IN_PROGRESS";
    setTogglingId(demand.id);
    const result = await updateDemand(demand.id, { status: nextStatus });
    setTogglingId("");

    if (!result.ok || !result.data) {
      toast.error(
        result.error || "Não foi possível atualizar o status da demanda."
      );
      return;
    }

    setDemands((prev) =>
      prev.map((item) => (item.id === demand.id ? result.data : item))
    );
    notifyDemandsChanged();
    toast.success(
      nextStatus === "COMPLETED"
        ? `Demanda "${demand.title}" finalizada.`
        : `Demanda "${demand.title}" reaberta.`
    );
  };

  const handleOpenDelete = (demand) => {
    const dialog = deleteDialogRef.current;
    if (!dialog || dialog.open || !demand) return;
    setDeleteTarget(demand);
    setDeleteError("");
    setIsDeleting(false);
    dialog.returnValue = "";
    dialog.showModal();
  };

  const handleOpenDetail = (demand) => {
    if (!demand) return;
    openWorkspaceDrawer("demand-detail", {
      demand,
      onRequestDelete: handleOpenDelete,
    });
  };

  const handleDeleteDialogClose = () => {
    const dialog = deleteDialogRef.current;
    if (dialog) dialog.returnValue = "";
    setDeleteTarget(null);
    setDeleteError("");
    setIsDeleting(false);
  };

  const handleDeleteConfirm = async (event) => {
    event.preventDefault();
    if (isDeleting || !deleteTarget) return;

    const targetId = deleteTarget.id;
    const targetTitle = deleteTarget.title;

    setIsDeleting(true);
    setDeleteError("");
    const result = await deleteDemand(targetId);
    setIsDeleting(false);

    if (!result.ok) {
      setDeleteError(
        result.error || "Não foi possível excluir a demanda. Tente novamente."
      );
      return;
    }

    deleteDialogRef.current?.close("confirm");
    setDemands((prev) => prev.filter((item) => item.id !== targetId));
    notifyDemandsChanged();
    toast.success(`Demanda "${targetTitle}" excluída com sucesso.`);
  };

  const handleSwitchGeneralManagerMinistry = (dept) => {
    if (!isGeneralManager || !dept) return;
    setActiveMinistry({
      id: dept.id,
      code: computeMinistryCode(dept.name),
      name: dept.name,
      hasDemands: Boolean(dept.hasDemands),
      isGlobal: false,
    });
    toast.success(`Ministério ativo alterado para "${dept.name}".`);
  };

  if (!userIsAdmin && demandDepartments.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyStateCard}>
          <span className={styles.emptyIconBadge} aria-hidden="true">
            <ClipboardListIcon />
          </span>
          <h1 className={styles.emptyTitle}>
            Página de demandas não habilitada
          </h1>
          <p className={styles.emptyHint}>
            O seu ministério não utiliza o painel de demandas no momento.
          </p>
          <Link href="/schedule" className={styles.primaryButton}>
            Voltar à escala
          </Link>
        </div>
      </div>
    );
  }

  if (isGeneralManager && !activeDepartment) {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerLead}>
            <p className={styles.pageEyebrow}>ORGANIZAÇÃO &amp; TAREFAS</p>
            <h1 className={styles.pageTitle}>Demandas</h1>
            <p className={styles.pageSubtitle}>
              O ministério ativo ({activeMinistry?.name}) não usa a página de
              demandas. Escolha um dos seus ministérios habilitados abaixo.
            </p>
          </div>
        </header>

        <div className={styles.switcherCard}>
          <p className={styles.switcherTitle}>
            Ministérios com demandas disponíveis para você:
          </p>
          <div className={styles.switcherButtons}>
            {demandDepartments.map((dept) => (
              <button
                key={dept.id}
                type="button"
                className={styles.primaryButton}
                onClick={() => handleSwitchGeneralManagerMinistry(dept)}
              >
                Ativar {dept.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pageSubtitle = userIsAdmin
    ? "Acompanhe e gerencie as demandas de todos os ministérios habilitados."
    : activeDepartment
      ? `Demandas e entregas do ministério ${activeDepartment.name}.`
      : "Acompanhe e gerencie as demandas da equipe.";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>ORGANIZAÇÃO &amp; TAREFAS</p>
          <h1 className={styles.pageTitle}>Demandas</h1>
          <p className={styles.pageSubtitle}>{pageSubtitle}</p>
        </div>

        <div className={styles.headerActions}>
          {isGeneralManager && demandDepartments.length > 1 && (
            <div className={styles.gmMinistrySwitcher}>
              <label
                htmlFor={ministryFilterId}
                className="visually-hidden"
              >
                Trocar ministério ativo
              </label>
              <select
                id={ministryFilterId}
                value={activeDepartment?.id || ""}
                className={styles.filterSelect}
                onChange={(event) => {
                  const chosen = demandDepartments.find(
                    (d) => d.id === event.currentTarget.value
                  );
                  if (chosen) handleSwitchGeneralManagerMinistry(chosen);
                }}
              >
                {demandDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    Ativo: {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {canCreateCurrentScope && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleOpenCreate}
            >
              <PlusIcon />
              <span>Nova demanda</span>
            </button>
          )}
        </div>
      </header>

      <div className={styles.toolbar}>
        <div
          className={styles.statusTabs}
          role="tablist"
          aria-label="Filtrar demandas por status"
        >
          {STATUS_FILTERS.map((tab) => {
            const isSelected = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`${styles.statusTab} ${
                  isSelected ? styles.statusTabActive : ""
                }`}
                onClick={() => setStatusFilter(tab.id)}
              >
                <span>{tab.label}</span>
                <span className={styles.statusTabCount}>{counts[tab.id]}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.toolbarFilters}>
          {userIsAdmin && demandDepartments.length > 1 && (
            <div>
              <label htmlFor={ministryFilterId} className="visually-hidden">
                Filtrar por ministério
              </label>
              <select
                id={ministryFilterId}
                value={selectedMinistryFilter}
                className={styles.filterSelect}
                onChange={(event) =>
                  setMinistryFilter(event.currentTarget.value)
                }
              >
                <option value="">Todos os ministérios</option>
                {demandDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <search aria-label="Buscar demandas" className={styles.searchWrap}>
            <label htmlFor={searchInputId} className="visually-hidden">
              Buscar demanda
            </label>
            <SearchIcon className={styles.searchIcon} />
            <input
              id={searchInputId}
              type="search"
              value={searchQuery}
              placeholder="Buscar por título ou responsável..."
              className={styles.searchInput}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />
          </search>
        </div>
      </div>

      {loadError && (
        <div className={styles.errorBanner} role="alert">
          <AlertCircleIcon className={styles.errorIcon} />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className={styles.emptyStateCard}>
          <p className={styles.emptyHint}>Carregando demandas...</p>
        </div>
      ) : userIsAdmin && demandDepartments.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <span className={styles.emptyIconBadge} aria-hidden="true">
            <ClipboardListIcon />
          </span>
          <h2 className={styles.emptyTitle}>
            Nenhum ministério usa demandas ainda
          </h2>
          <p className={styles.emptyHint}>
            Ative a opção <strong>Utilizar página de demandas</strong> ao criar
            ou editar um ministério em{" "}
            <Link href="/ministries" className={styles.inlineLink}>
              Ministérios
            </Link>
            .
          </p>
        </div>
      ) : visibleDemands.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <span className={styles.emptyIconBadge} aria-hidden="true">
            <ClipboardListIcon />
          </span>
          <h2 className={styles.emptyTitle}>
            {demands.length === 0
              ? "Nenhuma demanda criada ainda"
              : "Nenhuma demanda encontrada"}
          </h2>
          <p className={styles.emptyHint}>
            {demands.length === 0
              ? canCreateCurrentScope
                ? 'Clique em "Nova demanda" para registrar a primeira tarefa da equipe.'
                : "Quando novas demandas forem criadas pela equipe, elas aparecerão aqui."
              : "Tente ajustar os filtros ou o termo de busca."}
          </p>
        </div>
      ) : (
        <section className={styles.grid} aria-label="Lista de demandas">
          {visibleDemands.map((demand) => {
            const assignees = Array.isArray(demand.assignees)
              ? demand.assignees
              : [];
            const hasAssignees = assignees.length > 0;
            const isCompleted = demand.status === "COMPLETED";
            const canEdit = canEditDemand(currentUser, demand);
            const canDelete = canDeleteDemand(currentUser, demand);
            const canToggle = canToggleDemandStatus(currentUser, demand);
            const isOverdue =
              !isCompleted &&
              nowMs > 0 &&
              demand.dueAt &&
              Date.parse(demand.dueAt) < nowMs;
            const formattedDue = formatDatePtBr(demand.dueAt);
            const isTogglingThis = togglingId === demand.id;

            return (
              <article
                key={demand.id}
                className={`${styles.card} ${
                  isCompleted ? styles.cardCompleted : ""
                }`}
              >
                <header className={styles.cardHeader}>
                  <div className={styles.cardTopRow}>
                    <div className={styles.cardBadges}>
                      <span
                        className={`${styles.statusPill} ${
                          isCompleted
                            ? styles.statusPillCompleted
                            : styles.statusPillInProgress
                        }`}
                      >
                        <span className={styles.statusDot} aria-hidden="true" />
                        {isCompleted ? "Finalizado" : "Em progresso"}
                      </span>

                      {userIsAdmin && demand.department?.name && (
                        <span className={styles.ministryPill}>
                          {demand.department.name}
                        </span>
                      )}
                    </div>

                    <div className={styles.cardTopActions}>
                      <button
                        type="button"
                        aria-label={`Ver detalhes da demanda ${demand.title}`}
                        title="Ver detalhes"
                        className={styles.cardIconAction}
                        onClick={() => handleOpenDetail(demand)}
                      >
                        <EyeIcon />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={`Editar demanda ${demand.title}`}
                          title="Editar demanda"
                          className={styles.cardIconAction}
                          onClick={() => handleOpenEdit(demand)}
                        >
                          <PencilIcon />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          aria-label={`Excluir demanda ${demand.title}`}
                          title="Excluir demanda"
                          className={`${styles.cardIconAction} ${styles.cardIconActionDanger}`}
                          onClick={() => handleOpenDelete(demand)}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </div>

                  <h2 className={styles.cardTitle}>{demand.title}</h2>
                  {demand.description && (
                    <p className={styles.cardDescription}>
                      {demand.description}
                    </p>
                  )}
                </header>

                <div className={styles.cardMetaRegion}>
                  <div className={styles.assigneeRow}>
                    {hasAssignees ? (
                      <>
                        <div
                          className={styles.assigneeAvatarStack}
                          aria-hidden="true"
                        >
                          {assignees.slice(0, 3).map((person) => (
                            <span
                              key={person.id}
                              className={styles.assigneeAvatar}
                            >
                              {computeInitials(person.name)}
                            </span>
                          ))}
                          {assignees.length > 3 && (
                            <span className={styles.assigneeAvatarOverflow}>
                              +{assignees.length - 3}
                            </span>
                          )}
                        </div>
                        <div className={styles.assigneeText}>
                          {assignees.length === 1 ? (
                            <>
                              <span className={styles.assigneeName}>
                                {assignees[0].name}
                              </span>
                              {assignees[0].username && (
                                <span className={styles.assigneeHandle}>
                                  @{assignees[0].username}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className={styles.assigneeName}>
                                {assignees
                                  .slice(0, 2)
                                  .map((person) => person.name.split(" ")[0])
                                  .join(", ")}
                                {assignees.length > 2
                                  ? ` +${assignees.length - 2}`
                                  : ""}
                              </span>
                              <span className={styles.assigneeHandle}>
                                {assignees.length} responsáveis
                              </span>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className={styles.unassignedTag}>
                        Sem responsável associado
                      </span>
                    )}
                  </div>

                  {formattedDue && (
                    <span
                      className={`${styles.dueBadge} ${
                        isOverdue ? styles.dueBadgeOverdue : ""
                      }`}
                    >
                      <CalendarIcon className={styles.dueIcon} />
                      <span>
                        {isOverdue ? "Atrasada · " : "Prazo: "}
                        {formattedDue}
                      </span>
                    </span>
                  )}
                </div>

                {canToggle && (
                  <footer className={styles.cardFooter}>
                    {isCompleted ? (
                      <button
                        type="button"
                        disabled={Boolean(togglingId)}
                        aria-busy={isTogglingThis}
                        className={styles.reopenBtn}
                        onClick={() => handleQuickToggleStatus(demand)}
                      >
                        <RefreshCwIcon />
                        <span>
                          {isTogglingThis ? "Atualizando..." : "Reabrir"}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(togglingId)}
                        aria-busy={isTogglingThis}
                        className={
                          hasAssignees
                            ? styles.completeBtn
                            : styles.completeBtnNeedsAssignee
                        }
                        onClick={() => handleQuickToggleStatus(demand)}
                      >
                        {hasAssignees ? <CheckCircleIcon /> : <CheckIcon />}
                        <span>
                          {isTogglingThis
                            ? "Finalizando..."
                            : hasAssignees
                              ? "Finalizar"
                              : "Associar e finalizar"}
                        </span>
                      </button>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      )}

      <dialog
        ref={deleteDialogRef}
        closedby="any"
        aria-labelledby={deleteTitleId}
        aria-describedby={deleteDescId}
        className={styles.confirmDialog}
        onCancel={(event) => {
          if (isDeleting) event.preventDefault();
        }}
        onClose={handleDeleteDialogClose}
      >
        <form className={styles.confirmForm} onSubmit={handleDeleteConfirm}>
          <div className={styles.confirmHeader}>
            <div>
              <p className={styles.confirmEyebrow}>AÇÃO IRREVERSÍVEL</p>
              <h2 id={deleteTitleId} className={styles.confirmTitle}>
                Excluir demanda
              </h2>
            </div>

            <button
              type="button"
              aria-label="Fechar confirmação"
              className={styles.confirmCloseBtn}
              disabled={isDeleting}
              onClick={() => deleteDialogRef.current?.close("cancel")}
            >
              <CloseIcon />
            </button>
          </div>

          <div className={styles.confirmBody}>
            <div className={styles.confirmCallout}>
              <span className={styles.confirmBadge} aria-hidden="true">
                <AlertTriangleIcon />
              </span>
              <div>
                <h3 className={styles.confirmCalloutTitle}>
                  Excluir &ldquo;{deleteTarget?.title}&rdquo;?
                </h3>
                <p id={deleteDescId} className={styles.confirmCalloutDesc}>
                  Esta demanda será removida permanentemente do ministério.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className={styles.errorBanner} role="alert">
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{deleteError}</span>
              </div>
            )}
          </div>

          <div className={styles.confirmFooter}>
            <button
              type="button"
              autoFocus
              className={styles.confirmCancelBtn}
              disabled={isDeleting}
              onClick={() => deleteDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting}
              aria-busy={isDeleting}
              className={styles.confirmDangerBtn}
            >
              {isDeleting ? "Excluindo..." : "Excluir demanda"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
