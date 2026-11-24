"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CloseIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { deleteDepartment } from "@/features/ministries/services/departmentsService";
import { getDepartmentIds, isAdmin, resolveRoleCode, ROLES } from "@/lib/roles";
import styles from "./MinistriesView.module.css";

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

export function MinistriesView() {
  const {
    currentUser,
    activeMinistry,
    setActiveMinistry,
    ministries,
    refreshDepartments,
    refreshParticipants,
    notifySchedulesChanged,
    openWorkspaceDrawer,
  } = usePrivateWorkspace();
  const toast = useToast();

  const userIsAdmin = isAdmin(currentUser);
  const isGeneralManager = resolveRoleCode(currentUser) === ROLES.GENERAL_MANAGER;
  const userDepartmentIds = useMemo(
    () => getDepartmentIds(currentUser),
    [currentUser]
  );

  const deleteTitleId = useId();
  const deleteDescId = useId();

  const deleteDialogRef = useRef(null);
  const announceTimerRef = useRef(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [announcement, setAnnouncement] = useState("");

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
    return setupClosedByFallback(deleteDialogRef.current, () => {
      if (!isDeleting) {
        deleteDialogRef.current?.close("cancel");
      }
    });
  }, [isDeleting]);

  const handleOpenCreateDrawer = () => {
    if (!userIsAdmin) return;
    openWorkspaceDrawer("ministry-form", { mode: "create" });
  };

  const handleOpenEditDrawer = (ministry) => {
    if (!userIsAdmin || !ministry) return;
    openWorkspaceDrawer("ministry-form", { mode: "edit", ministry });
  };

  const handleOpenDeleteDialog = (ministry) => {
    const dialog = deleteDialogRef.current;
    if (!dialog || dialog.open || !userIsAdmin || !ministry) return;

    setDeleteTarget(ministry);
    setDeleteError("");
    setIsDeleting(false);
    dialog.returnValue = "";
    dialog.showModal();
  };

  const handleDeleteDialogClose = () => {
    const dialog = deleteDialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setDeleteTarget(null);
    setDeleteError("");
    setIsDeleting(false);
  };

  const handleDeleteConfirm = async (event) => {
    event.preventDefault();
    if (isDeleting || !deleteTarget) return;

    const targetId = deleteTarget.id;
    const targetName = deleteTarget.name;

    setDeleteError("");
    setIsDeleting(true);
    const result = await deleteDepartment(targetId);
    setIsDeleting(false);

    if (!result.ok) {
      const msg =
        result.error || "Não foi possível excluir o ministério. Tente novamente.";
      setDeleteError(msg);
      announce(msg);
      return;
    }

    deleteDialogRef.current?.close("confirm");
    await Promise.all([
      refreshDepartments(),
      refreshParticipants({ silent: true }),
    ]);
    notifySchedulesChanged();
    toast.success(`Ministério "${targetName}" excluído com sucesso.`);
  };

  const handleOpenAssignDrawer = (ministry) => {
    if (!userIsAdmin || !ministry) return;
    openWorkspaceDrawer("ministry-assign", { ministryId: ministry.id });
  };

  const handleSelectActiveMinistry = (ministry) => {
    if (!isGeneralManager || !ministry) return;
    setActiveMinistry({
      id: ministry.id,
      code: ministry.code,
      name: ministry.name,
      hasDemands: Boolean(ministry.hasDemands),
      isGlobal: false,
    });
    const message = `Ministério ativo alterado para "${ministry.name}".`;
    announce(message);
    toast.success(message);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>ESTRUTURA DA EQUIPE</p>
          <h1 className={styles.pageTitle}>Ministérios</h1>
          <p className={styles.pageSubtitle}>
            {userIsAdmin
              ? "Visão global de todos os ministérios e seus Líderes Gerais."
              : isGeneralManager
                ? "Gerencie seus ministérios e escolha qual está ativo no seu painel."
                : "Visualize todos os ministérios existentes na igreja."}
          </p>
        </div>

        {userIsAdmin && (
          <button
            type="button"
            className={styles.createButton}
            onClick={handleOpenCreateDrawer}
          >
            <PlusIcon />
            <span>Novo ministério</span>
          </button>
        )}
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </div>

      {ministries.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIconBadge} aria-hidden="true">
            <LayersIcon />
          </span>
          <p className={styles.emptyTitle}>Nenhum ministério cadastrado ainda</p>
          {userIsAdmin && (
            <p className={styles.emptyHint}>
              Use o botão <strong>Novo ministério</strong> acima para criar o
              primeiro departamento.
            </p>
          )}
        </div>
      ) : (
        <section className={styles.grid} aria-label="Lista de ministérios">
          {ministries.map((ministry) => {
            const isOwnMinistry =
              !userIsAdmin && userDepartmentIds.includes(ministry.id);
            const isActiveOwnMinistry =
              isOwnMinistry &&
              (isGeneralManager ? activeMinistry?.id === ministry.id : true);
            const canSwitchToThisMinistry =
              isGeneralManager && isOwnMinistry && !isActiveOwnMinistry;
            const showLeaderInfo =
              userIsAdmin || isOwnMinistry || ministry.hasGeneralManager;
            const showCardFooter =
              userIsAdmin ||
              canSwitchToThisMinistry ||
              ministry.members.length > 0;
            const needsGeneralManager =
              userIsAdmin && !ministry.hasGeneralManager;

            return (
              <article
                key={ministry.id}
                className={`${styles.card} ${
                  isActiveOwnMinistry ? styles.cardActive : ""
                }`}
              >
                <header className={styles.cardHeader}>
                  <div className={styles.cardTopRow}>
                    <div className={styles.cardTopLead}>
                      {userIsAdmin ? (
                        needsGeneralManager ? (
                          <span
                            className={styles.pendingIndicator}
                            title="Aguardando definição de Líder Geral"
                          >
                            <span className="visually-hidden">
                              Aguardando definição de Líder Geral
                            </span>
                          </span>
                        ) : (
                          <span
                            className={styles.readyIndicator}
                            title="Líder Geral definido"
                          >
                            <span className="visually-hidden">
                              Líder Geral definido
                            </span>
                          </span>
                        )
                      ) : (
                        <span
                          className={styles.readyIndicator}
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    {userIsAdmin ? (
                      <div className={styles.cardTopActions}>
                        <button
                          type="button"
                          aria-label={`Editar ministério ${ministry.name}`}
                          title="Editar ministério"
                          className={styles.cardIconAction}
                          onClick={() => handleOpenEditDrawer(ministry)}
                        >
                          <PencilIcon />
                        </button>

                        <button
                          type="button"
                          aria-label={`Excluir ministério ${ministry.name}`}
                          title="Excluir ministério"
                          className={`${styles.cardIconAction} ${styles.cardIconActionDanger}`}
                          onClick={() => handleOpenDeleteDialog(ministry)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ) : isActiveOwnMinistry ? (
                      <span className={styles.activeBadge}>
                        <CheckCircleIcon />
                        <span>
                          {isGeneralManager
                            ? "MINISTÉRIO ATIVO"
                            : "SEU MINISTÉRIO"}
                        </span>
                      </span>
                    ) : isOwnMinistry ? (
                      <span className={styles.managedBadge}>SEU MINISTÉRIO</span>
                    ) : null}
                  </div>

                  <h2 className={styles.cardTitle}>{ministry.name}</h2>
                  <p className={styles.cardDescription}>
                    {ministry.description || "Sem descrição cadastrada."}
                  </p>
                </header>

                <div className={styles.statsRegion}>
                  <span className={styles.statRow}>
                    <UsersIcon className={styles.statIcon} />
                    <span>
                      {ministry.participantCount}{" "}
                      {ministry.participantCount === 1
                        ? "participante"
                        : "participantes"}
                    </span>
                  </span>
                  {showLeaderInfo && (
                    <span
                      className={`${styles.leaderRow} ${
                        !ministry.hasGeneralManager ? styles.leaderPending : ""
                      }`}
                    >
                      {ministry.hasGeneralManager
                        ? `Líder Geral: ${ministry.leaderHandle}`
                        : "Sem Líder Geral definido"}
                    </span>
                  )}
                </div>

                {showCardFooter && (
                  <footer className={styles.cardFooter}>
                    <ul
                      className={styles.avatarGroup}
                      aria-label="Participantes do ministério"
                    >
                      {ministry.members.map((member) => (
                        <li
                          key={member.id || member.initials}
                          className={styles.avatarChip}
                          title={member.name}
                        >
                          <span aria-hidden="true">{member.initials}</span>
                          <span className="visually-hidden">{member.name}</span>
                        </li>
                      ))}
                    </ul>

                    {canSwitchToThisMinistry && (
                      <button
                        type="button"
                        className={styles.manageButton}
                        onClick={() => handleSelectActiveMinistry(ministry)}
                      >
                        <span>Gerenciar ministério</span>
                      </button>
                    )}

                    {userIsAdmin && (
                      <button
                        type="button"
                        className={
                          needsGeneralManager
                            ? styles.manageButton
                            : styles.managingLink
                        }
                        onClick={() => handleOpenAssignDrawer(ministry)}
                      >
                        <span>
                          {needsGeneralManager
                            ? "Definir Líder Geral"
                            : "Líder Geral"}
                        </span>
                        <span className="visually-hidden">
                          {" "}
                          de {ministry.name}
                        </span>
                        <ArrowUpRightIcon />
                      </button>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      )}

      {userIsAdmin && (
        <dialog
          ref={deleteDialogRef}
          closedby="any"
          aria-labelledby={deleteTitleId}
          aria-describedby={deleteDescId}
          className={styles.confirmDialog}
          onCancel={(event) => {
            if (isDeleting) {
              event.preventDefault();
            }
          }}
          onClose={handleDeleteDialogClose}
        >
          <form className={styles.confirmForm} onSubmit={handleDeleteConfirm}>
            <div className={styles.confirmHeader}>
              <div>
                <p className={styles.confirmEyebrow}>AÇÃO IRREVERSÍVEL</p>
                <h2 id={deleteTitleId} className={styles.confirmTitle}>
                  Excluir ministério
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
              <div className={`${styles.confirmCallout} ${styles.confirmCalloutDanger}`}>
                <span
                  className={`${styles.confirmBadge} ${styles.confirmBadgeDanger}`}
                  aria-hidden="true"
                >
                  <AlertTriangleIcon />
                </span>

                <div>
                  <h3 className={styles.confirmCalloutTitle}>
                    Excluir permanentemente &ldquo;{deleteTarget?.name}&rdquo;?
                  </h3>
                  <p id={deleteDescId} className={styles.confirmCalloutDesc}>
                    Esta ação remove o ministério definitivamente e só é permitida
                    quando não há membros vinculados nem escalas associadas a ele.
                  </p>
                  {deleteTarget && deleteTarget.participantCount > 0 && (
                    <p className={styles.confirmMembersHint}>
                      Atualmente este ministério possui{" "}
                      <strong>{deleteTarget.participantCount}</strong>{" "}
                      {deleteTarget.participantCount === 1
                        ? "participante vinculado"
                        : "participantes vinculados"}
                      . Transfira ou remova os membros antes de excluir.
                    </p>
                  )}
                </div>
              </div>

              {deleteError && (
                <div className={styles.formBannerError} role="alert">
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
                {isDeleting ? "Excluindo..." : "Excluir ministério"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
