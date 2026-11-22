"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  TrashIcon,
  UserPlusIcon,
} from "@/components/ui/icons";
import { PARTICIPANT_ROLES } from "@/features/participants/data/mockParticipantsData";
import { MINISTRY_OPTIONS } from "@/features/recurring-events/data/mockRecurringEventsData";
import styles from "./ParticipantsView.module.css";

let supportsDisplayTransition;

function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) {
    return supportsDisplayTransition;
  }
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  window.getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition =
    window.getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

function setupBackdropDismiss(dialog, onDismiss) {
  if (!dialog) return undefined;

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
    pressedOutside = event.target === dialog && isOutside(event);
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

function setupClosedByFallback(dialog) {
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
      dialog.close("cancel");
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

function computeInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function generateCredentialCode(existingCodes, excludeCode = "") {
  const taken = new Set(existingCodes.filter(Boolean));
  if (excludeCode) taken.add(excludeCode);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const digits = 1000 + Math.floor(Math.random() * 9000);
    const candidate = `MEM-${digits}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return `MEM-${Date.now().toString().slice(-4)}`;
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

function doesParticipantMatchQuery(person, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystack = [
    person.name,
    person.handle,
    person.role,
    person.availability,
    ...person.ministries,
  ]
    .map(normalizeText)
    .join(" ");

  return haystack.includes(normalizedQuery);
}

const ROLE_OPTIONS = [
  PARTICIPANT_ROLES.VOLUNTEER,
  PARTICIPANT_ROLES.SCHEDULE_MANAGER,
  PARTICIPANT_ROLES.MINISTRY_MANAGER,
  PARTICIPANT_ROLES.GENERAL_MANAGER,
];

export function ParticipantsView() {
  const {
    participants,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    ministries,
    activeMinistry,
  } = usePrivateWorkspace();
  const toast = useToast();

  const searchInputId = useId();
  const tableCaptionId = useId();
  const drawerTitleId = useId();
  const fullNameInputId = useId();
  const fullNameErrorId = useId();
  const roleSelectId = useId();
  const ministrySelectId = useId();
  const confirmModalTitleId = useId();

  const createDialogRef = useRef(null);
  const confirmDialogRef = useRef(null);
  const confirmCancelBtnRef = useRef(null);
  const fullNameInputRef = useRef(null);
  const roleSelectRef = useRef(null);
  const idCounterRef = useRef(1);
  const announceTimerRef = useRef(null);
  const copyTimerRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [editingParticipant, setEditingParticipant] = useState(null);
  const [fullName, setFullName] = useState("");
  const [selectedRole, setSelectedRole] = useState(PARTICIPANT_ROLES.VOLUNTEER);
  const [selectedMinistry, setSelectedMinistry] = useState(
    activeMinistry?.name || MINISTRY_OPTIONS[0]
  );
  const [fullNameError, setFullNameError] = useState("");
  const [confirmModal, setConfirmModal] = useState(null);
  const [copiedParticipantId, setCopiedParticipantId] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const availableMinistryOptions = useMemo(() => {
    const options = [...MINISTRY_OPTIONS];
    const seen = new Set(options);
    for (const item of ministries || []) {
      if (item?.name && !seen.has(item.name)) {
        options.push(item.name);
        seen.add(item.name);
      }
    }
    return options;
  }, [ministries]);

  const filteredParticipants = useMemo(() => {
    const query = normalizeText(searchQuery);
    if (!query) return participants;

    return participants.filter((person) =>
      doesParticipantMatchQuery(person, query)
    );
  }, [participants, searchQuery]);

  const isEditing = Boolean(editingParticipant);
  const isVolunteerRole = selectedRole === PARTICIPANT_ROLES.VOLUNTEER;

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
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

  const closeAnimatedDialog = useCallback(async (dialog) => {
    if (!dialog || !dialog.open) return;

    if (!supportsTopLayerExit()) {
      dialog.setAttribute("data-closing", "");
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((resolve) => window.setTimeout(resolve, 1000)),
        ]);
      }
      if (!dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
    }

    if (dialog.open) {
      dialog.close();
    }
  }, []);

  useEffect(() => {
    const cleanCreate = setupBackdropDismiss(createDialogRef.current, () => {
      closeAnimatedDialog(createDialogRef.current);
    });
    const cleanConfirm = setupClosedByFallback(confirmDialogRef.current);

    return () => {
      if (cleanCreate) cleanCreate();
      if (cleanConfirm) cleanConfirm();
    };
  }, [closeAnimatedDialog]);

  const resolveDefaultMinistry = () =>
    availableMinistryOptions.includes(activeMinistry?.name)
      ? activeMinistry.name
      : availableMinistryOptions[0] || "";

  const handleOpenCreateDrawer = () => {
    const dialog = createDialogRef.current;
    if (!dialog || dialog.open) return;

    setEditingParticipant(null);
    setFullName("");
    setSelectedRole(PARTICIPANT_ROLES.VOLUNTEER);
    setSelectedMinistry(resolveDefaultMinistry());
    setFullNameError("");

    dialog.removeAttribute("data-closing");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      fullNameInputRef.current?.focus();
    });
  };

  const handleOpenEditDrawer = (person) => {
    const dialog = createDialogRef.current;
    if (!dialog || dialog.open) return;

    const currentMinistry = person.ministries?.[0];
    setEditingParticipant(person);
    setSelectedRole(person.role || PARTICIPANT_ROLES.VOLUNTEER);
    setSelectedMinistry(
      currentMinistry && availableMinistryOptions.includes(currentMinistry)
        ? currentMinistry
        : currentMinistry || resolveDefaultMinistry()
    );
    setFullNameError("");

    dialog.removeAttribute("data-closing");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      roleSelectRef.current?.focus();
    });
  };

  const handleCreateDialogClose = () => {
    const dialog = createDialogRef.current;
    if (!dialog) return;
    dialog.returnValue = "";
    setEditingParticipant(null);
    setFullNameError("");
  };

  const handleDrawerSubmit = async (event) => {
    event.preventDefault();

    if (editingParticipant) {
      const nextMinistries =
        isVolunteerRole && selectedMinistry ? [selectedMinistry] : [];

      updateParticipant(editingParticipant.id, {
        role: selectedRole,
        ministries: nextMinistries,
      });

      const updatedName = editingParticipant.name;
      await closeAnimatedDialog(createDialogRef.current);
      toast.success(`Papel e ministério de "${updatedName}" atualizados.`);
      return;
    }

    const trimmedName = fullName.trim();
    let nextFullNameError = "";
    if (!trimmedName) {
      nextFullNameError = "Informe o nome completo do participante.";
    } else if (trimmedName.length < 2) {
      nextFullNameError = "O nome deve ter pelo menos 2 caracteres.";
    }

    setFullNameError(nextFullNameError);
    if (nextFullNameError) {
      announce(nextFullNameError);
      fullNameInputRef.current?.focus();
      return;
    }

    const assignedMinistries =
      isVolunteerRole && selectedMinistry ? [selectedMinistry] : [];
    const existingCodes = participants.map((item) => item.credentialCode);

    idCounterRef.current += 1;
    const newParticipant = {
      id: `p-custom-${idCounterRef.current}`,
      initials: computeInitials(trimmedName),
      name: trimmedName,
      handle: "",
      credentialCode: generateCredentialCode(existingCodes),
      ministries: assignedMinistries,
      role: selectedRole,
      availability: "Não informada",
      statusLabel: "Ativo",
      statusTone: "active",
    };

    addParticipant(newParticipant);

    const normalizedQuery = normalizeText(searchQuery);
    if (
      normalizedQuery &&
      !doesParticipantMatchQuery(newParticipant, normalizedQuery)
    ) {
      setSearchQuery("");
    }

    await closeAnimatedDialog(createDialogRef.current);
    toast.success(`Participante "${newParticipant.name}" adicionado à equipe.`);
  };

  const handleCopyCredential = async (person) => {
    const code = person.credentialCode || "MEM-0000";
    const copied = await copyTextToClipboard(code);

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }

    if (copied) {
      setCopiedParticipantId(person.id);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedParticipantId("");
      }, 2000);
      toast.success(`Código de credencial de ${person.name} (${code}) copiado.`);
    } else {
      toast.error(
        `Não foi possível copiar automaticamente. Código de ${person.name}: ${code}.`
      );
    }
  };

  const openConfirmModal = (payload) => {
    const dialog = confirmDialogRef.current;
    if (!dialog || dialog.open) return;

    setConfirmModal(payload);
    dialog.showModal();
    window.requestAnimationFrame(() => {
      confirmCancelBtnRef.current?.focus();
    });
  };

  const handleConfirmDialogClose = () => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;

    const action = dialog.returnValue;
    dialog.returnValue = "";

    if (action === "confirm" && confirmModal?.participant) {
      const target = confirmModal.participant;

      if (confirmModal.type === "regenerate") {
        const nextCode = generateCredentialCode(
          participants.map((item) => item.credentialCode),
          target.credentialCode
        );
        updateParticipant(target.id, { credentialCode: nextCode });
        toast.success(
          `Novo código de credencial gerado para ${target.name}: ${nextCode}.`
        );
      } else if (confirmModal.type === "revoke") {
        updateParticipant(target.id, {
          statusLabel: "Revogado",
          statusTone: "revoked",
        });
        toast.success(`Acesso de ${target.name} à área privada revogado.`);
      } else if (confirmModal.type === "restore") {
        updateParticipant(target.id, {
          statusLabel: "Ativo",
          statusTone: "active",
        });
        toast.success(`Acesso de ${target.name} restaurado.`);
      } else if (confirmModal.type === "delete") {
        deleteParticipant(target.id);
        toast.success(`Participante "${target.name}" excluído definitivamente.`);
      }
    }

    setConfirmModal(null);
  };

  const countLabel =
    filteredParticipants.length === 1
      ? "1 participante"
      : `${filteredParticipants.length} participantes`;

  const drawerMinistryOptions =
    selectedMinistry && !availableMinistryOptions.includes(selectedMinistry)
      ? [selectedMinistry, ...availableMinistryOptions]
      : availableMinistryOptions;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PESSOAS &amp; ACESSO</p>
          <h1 className={styles.pageTitle}>Participantes</h1>
          <p className={styles.pageSubtitle}>
            Pessoas que servem com você no ministério.
          </p>
        </div>

        <button
          type="button"
          className={styles.addButton}
          onClick={handleOpenCreateDrawer}
        >
          <UserPlusIcon />
          <span>Adicionar membro</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

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
            placeholder="Buscar participante.."
            autoCorrect="off"
            spellCheck={false}
            className={styles.searchInput}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </div>

        <span className={styles.countLabel}>{countLabel}</span>
      </search>

      {filteredParticipants.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>
            Nenhum participante encontrado para esta busca.
          </p>
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setSearchQuery("")}
          >
            Limpar busca
          </button>
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
              Lista de participantes do ministério
            </caption>

            <thead>
              <tr>
                <th scope="col">PARTICIPANTE</th>
                <th scope="col">MINISTÉRIO</th>
                <th scope="col">PAPEL</th>
                <th scope="col">DISPONIBILIDADE</th>
                <th scope="col">STATUS</th>
                <th scope="col" className={styles.actionsHeader}>
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredParticipants.map((person) => {
                const isRevoked = person.statusTone === "revoked";
                const isCopied = copiedParticipantId === person.id;

                return (
                  <tr key={person.id}>
                    <th scope="row" className={styles.participantCell}>
                      <div className={styles.participantIdentity}>
                        <span className={styles.avatar} aria-hidden="true">
                          {person.initials}
                        </span>
                        <div className={styles.identityText}>
                          <span className={styles.memberName}>
                            {person.name}
                          </span>
                          {person.handle && (
                            <span className={styles.memberHandle}>
                              {person.handle}
                            </span>
                          )}
                        </div>
                      </div>
                    </th>

                    <td>
                      {person.ministries.length > 0 ? (
                        <div className={styles.ministriesGroup}>
                          {person.ministries.map((ministry) => (
                            <span key={ministry} className={styles.ministryPill}>
                              {ministry}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className={styles.noMinistryLabel}>—</span>
                      )}
                    </td>

                    <td className={styles.roleCell}>{person.role}</td>

                    <td className={styles.availabilityCell}>
                      {person.availability}
                    </td>

                    <td>
                      <span
                        className={`${styles.statusPill} ${
                          isRevoked ? styles.statusPillRevoked : ""
                        }`}
                      >
                        <span className={styles.statusDot} aria-hidden="true" />
                        {person.statusLabel}
                      </span>
                    </td>

                    <td className={styles.actionsCell}>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          title="Copiar código de credencial"
                          aria-label={`Copiar código de credencial de ${person.name}`}
                          className={`${styles.iconActionButton} ${
                            isCopied ? styles.iconActionCopied : ""
                          }`}
                          onClick={() => handleCopyCredential(person)}
                        >
                          {isCopied ? <CheckIcon /> : <CopyIcon />}
                        </button>

                        <button
                          type="button"
                          title="Gerar novo código de credencial"
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

                        <button
                          type="button"
                          title={
                            isRevoked
                              ? "Restaurar acesso à área privada"
                              : "Revogar acesso à área privada"
                          }
                          aria-label={
                            isRevoked
                              ? `Restaurar acesso privado de ${person.name}`
                              : `Revogar acesso privado de ${person.name}`
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

                        <button
                          type="button"
                          title="Editar papel e ministério"
                          aria-label={`Editar papel e ministério de ${person.name}`}
                          className={styles.iconActionButton}
                          onClick={() => handleOpenEditDrawer(person)}
                        >
                          <PencilIcon />
                        </button>

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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-Side Animated Drawer: Adicionar à equipe / Editar papel e ministério */}
      <dialog
        ref={createDialogRef}
        aria-labelledby={drawerTitleId}
        className={styles.createDrawer}
        onCancel={(event) => {
          if (event.cancelable) {
            event.preventDefault();
            closeAnimatedDialog(createDialogRef.current);
          }
        }}
        onClose={handleCreateDialogClose}
      >
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
            onClick={() => closeAnimatedDialog(createDialogRef.current)}
          >
            <CloseIcon />
          </button>
        </div>

        <form
          className={styles.drawerForm}
          noValidate
          onSubmit={handleDrawerSubmit}
        >
          <div className={styles.drawerBody}>
            {isEditing ? (
              <div className={styles.editMemberSummary}>
                <span className={styles.avatar} aria-hidden="true">
                  {editingParticipant.initials}
                </span>
                <div className={styles.identityText}>
                  <span className={styles.memberName}>
                    {editingParticipant.name}
                  </span>
                  {editingParticipant.handle && (
                    <span className={styles.memberHandle}>
                      {editingParticipant.handle}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.fieldGroup}>
                <label htmlFor={fullNameInputId} className={styles.fieldLabel}>
                  Nome completo
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
                    setFullName(event.currentTarget.value);
                    if (fullNameError) setFullNameError("");
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

            <div
              className={
                isVolunteerRole ? styles.twoColFields : styles.singleColField
              }
            >
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
                    setSelectedRole(event.currentTarget.value)
                  }
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              {isVolunteerRole && (
                <div className={styles.fieldGroup}>
                  <label
                    htmlFor={ministrySelectId}
                    className={styles.fieldLabel}
                  >
                    Ministério
                  </label>
                  <select
                    id={ministrySelectId}
                    name="ministry"
                    value={selectedMinistry}
                    className={styles.select}
                    onChange={(event) =>
                      setSelectedMinistry(event.currentTarget.value)
                    }
                  >
                    {drawerMinistryOptions.map((ministry) => (
                      <option key={ministry} value={ministry}>
                        {ministry}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className={styles.drawerFooter}>
            <button
              type="button"
              className={styles.drawerCancelButton}
              onClick={() => closeAnimatedDialog(createDialogRef.current)}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.drawerSubmitButton}>
              {isEditing ? <CheckIcon /> : <PlusIcon />}
              <span>{isEditing ? "Salvar alterações" : "Criar membro"}</span>
            </button>
          </div>
        </form>
      </dialog>

      {/* Confirmation Modal (<dialog>) for Regenerate / Revoke / Restore / Delete */}
      <dialog
        ref={confirmDialogRef}
        closedby="any"
        aria-labelledby={confirmModalTitleId}
        className={styles.confirmDialog}
        onClose={handleConfirmDialogClose}
      >
        <form method="dialog" className={styles.confirmForm}>
          <div className={styles.confirmHeader}>
            <div>
              <p className={styles.confirmEyebrow}>CONFIRMAÇÃO NECESSÁRIA</p>
              <h2 id={confirmModalTitleId} className={styles.confirmTitle}>
                {confirmModal?.type === "regenerate"
                  ? "Gerar novo código?"
                  : confirmModal?.type === "revoke"
                    ? "Revogar acesso privado?"
                    : confirmModal?.type === "restore"
                      ? "Restaurar acesso privado?"
                      : "Excluir participante?"}
              </h2>
            </div>

            <button
              type="submit"
              value="cancel"
              aria-label="Fechar confirmação"
              className={styles.confirmCloseBtn}
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
                        Um novo código de credenciamento será gerado para{" "}
                        <strong>{confirmModal.participant.name}</strong> e o
                        código anterior (
                        <strong>
                          {confirmModal.participant.credentialCode}
                        </strong>
                        ) deixará de funcionar imediatamente.
                      </>
                    )}
                  {confirmModal?.type === "revoke" &&
                    confirmModal.participant && (
                      <>
                        O acesso de{" "}
                        <strong>{confirmModal.participant.name}</strong> à área
                        privada do site será revogado imediatamente. Esta ação
                        restringe o uso da credencial atual.
                      </>
                    )}
                  {confirmModal?.type === "restore" &&
                    confirmModal.participant && (
                      <>
                        O acesso de{" "}
                        <strong>{confirmModal.participant.name}</strong> à área
                        privada do site será restaurado imediatamente,
                        reativando a credencial atual.
                      </>
                    )}
                  {confirmModal?.type === "delete" &&
                    confirmModal.participant && (
                      <>
                        O participante{" "}
                        <strong>{confirmModal.participant.name}</strong> será
                        removido definitivamente da lista de membros e perderá o
                        acesso. Esta ação não poderá ser desfeita.
                      </>
                    )}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.confirmFooter}>
            <button
              ref={confirmCancelBtnRef}
              type="submit"
              value="cancel"
              autoFocus
              className={styles.confirmCancelBtn}
            >
              Cancelar
            </button>

            <button
              type="submit"
              value="confirm"
              className={
                confirmModal?.type === "regenerate" ||
                confirmModal?.type === "restore"
                  ? styles.confirmPrimaryBtn
                  : styles.confirmDangerBtn
              }
            >
              {confirmModal?.type === "regenerate"
                ? "Gerar novo código"
                : confirmModal?.type === "revoke"
                  ? "Revogar acesso"
                  : confirmModal?.type === "restore"
                    ? "Restaurar acesso"
                    : "Excluir membro"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
