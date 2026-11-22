"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CloseIcon,
  PlusIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { PARTICIPANT_ROLES } from "@/features/participants/data/mockParticipantsData";
import styles from "./MinistriesView.module.css";

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

function computeMinistryCode(name) {
  const cleaned = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase().padEnd(2, "X");
  }
  return "MN";
}

function slugifyMinistry(name) {
  const slug = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "ministerio";
}

export function MinistriesView() {
  const {
    activeMinistry,
    setActiveMinistry,
    ministries,
    addMinistry,
    participants,
  } = usePrivateWorkspace();
  const toast = useToast();

  const drawerTitleId = useId();
  const nameInputId = useId();
  const nameErrorId = useId();
  const descriptionInputId = useId();
  const generalManagerSelectId = useId();
  const generalManagerErrorId = useId();
  const ministryManagerSelectId = useId();
  const scheduleManagerSelectId = useId();

  const createDialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const generalManagerSelectRef = useRef(null);
  const idCounterRef = useRef(1);
  const announceTimerRef = useRef(null);

  const [ministryName, setMinistryName] = useState("");
  const [ministryDescription, setMinistryDescription] = useState("");
  const [generalManagerId, setGeneralManagerId] = useState("");
  const [ministryManagerId, setMinistryManagerId] = useState("");
  const [scheduleManagerId, setScheduleManagerId] = useState("");

  const [nameError, setNameError] = useState("");
  const [generalManagerError, setGeneralManagerError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const generalManagers = useMemo(
    () =>
      participants.filter(
        (person) => person.role === PARTICIPANT_ROLES.GENERAL_MANAGER
      ),
    [participants]
  );

  const ministryManagers = useMemo(
    () =>
      participants.filter(
        (person) => person.role === PARTICIPANT_ROLES.MINISTRY_MANAGER
      ),
    [participants]
  );

  const scheduleManagers = useMemo(
    () =>
      participants.filter(
        (person) => person.role === PARTICIPANT_ROLES.SCHEDULE_MANAGER
      ),
    [participants]
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

    return () => {
      if (cleanCreate) cleanCreate();
    };
  }, [closeAnimatedDialog]);

  const resetCreateForm = () => {
    setMinistryName("");
    setMinistryDescription("");
    setGeneralManagerId("");
    setMinistryManagerId("");
    setScheduleManagerId("");
    setNameError("");
    setGeneralManagerError("");
  };

  const handleOpenCreateDrawer = () => {
    const dialog = createDialogRef.current;
    if (!dialog || dialog.open) return;

    resetCreateForm();
    dialog.removeAttribute("data-closing");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  };

  const handleCreateDialogClose = () => {
    const dialog = createDialogRef.current;
    if (!dialog) return;
    dialog.returnValue = "";
    setNameError("");
    setGeneralManagerError("");
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();

    const trimmedName = ministryName.trim();
    const generalManager =
      generalManagers.find((person) => person.id === generalManagerId) || null;

    let nextNameError = "";
    if (!trimmedName) {
      nextNameError = "Informe o nome do ministério.";
    } else if (trimmedName.length < 2) {
      nextNameError = "O nome do ministério deve ter pelo menos 2 caracteres.";
    }

    let nextGeneralManagerError = "";
    if (!generalManager) {
      nextGeneralManagerError = "Selecione o gerente geral do ministério.";
    }

    setNameError(nextNameError);
    setGeneralManagerError(nextGeneralManagerError);

    if (nextNameError) {
      announce(nextNameError);
      nameInputRef.current?.focus();
      return;
    }

    if (nextGeneralManagerError) {
      announce(nextGeneralManagerError);
      generalManagerSelectRef.current?.focus();
      return;
    }

    const ministryManager =
      ministryManagers.find((person) => person.id === ministryManagerId) ||
      null;
    const scheduleManager =
      scheduleManagers.find((person) => person.id === scheduleManagerId) ||
      null;

    const seenIds = new Set();
    const members = [];
    for (const manager of [generalManager, ministryManager, scheduleManager]) {
      if (!manager || seenIds.has(manager.id)) continue;
      seenIds.add(manager.id);
      members.push({
        id: manager.id,
        initials: manager.initials,
        name: manager.name,
      });
    }

    idCounterRef.current += 1;
    const newMinistry = {
      id: `min-${slugifyMinistry(trimmedName)}-${idCounterRef.current}`,
      number: String(ministries.length + 1).padStart(2, "0"),
      code: computeMinistryCode(trimmedName),
      name: trimmedName,
      description: ministryDescription.trim(),
      participantCount: members.length,
      leaderHandle:
        (ministryManager || generalManager).handle ||
        (ministryManager || generalManager).name,
      generalManagerId: generalManager.id,
      ministryManagerId: ministryManager?.id || "",
      scheduleManagerId: scheduleManager?.id || "",
      members,
    };

    addMinistry(newMinistry);
    await closeAnimatedDialog(createDialogRef.current);
    toast.success(`Ministério "${newMinistry.name}" criado com sucesso.`);
  };

  const handleSelectMinistry = (ministry) => {
    setActiveMinistry({
      id: ministry.id,
      code: ministry.code,
      name: ministry.name,
    });
    toast.success(`Ministério ativo alterado para ${ministry.name}.`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>ESTRUTURA DA EQUIPE</p>
          <h1 className={styles.pageTitle}>Ministérios</h1>
          <p className={styles.pageSubtitle}>
            Áreas que tornam a comunicação da igreja possível.
          </p>
        </div>

        <button
          type="button"
          className={styles.createButton}
          onClick={handleOpenCreateDrawer}
        >
          <PlusIcon />
          <span>Novo ministério</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </div>

      <section className={styles.grid} aria-label="Lista de ministérios">
        {ministries.map((ministry) => {
          const isActive = activeMinistry.id === ministry.id;

          return (
            <article
              key={ministry.id}
              className={`${styles.card} ${isActive ? styles.cardActive : ""}`}
            >
              <header className={styles.cardHeader}>
                <div className={styles.cardTopRow}>
                  <span className={styles.cardNumber}>{ministry.number}</span>

                  {isActive ? (
                    <span className={styles.activeBadge}>
                      <CheckCircleIcon />
                      <span>MINISTÉRIO ATIVO</span>
                    </span>
                  ) : (
                    <span className={styles.readyIndicator} aria-hidden="true" />
                  )}
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
                <span className={styles.leaderRow}>
                  Resp. {ministry.leaderHandle}
                </span>
              </div>

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

                {isActive ? (
                  <Link href="/schedule" className={styles.managingLink}>
                    <span>Em gerenciamento</span>
                    <span className="visually-hidden">
                      {" "}
                      — abrir escala de {ministry.name}
                    </span>
                    <ArrowUpRightIcon />
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={styles.manageButton}
                    onClick={() => handleSelectMinistry(ministry)}
                  >
                    <span>Gerenciar Ministério</span>
                    <span className="visually-hidden"> {ministry.name}</span>
                    <ArrowUpRightIcon />
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </section>

      {/* Right-Side Animated Drawer: Novo ministério */}
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
            <p className={styles.drawerEyebrow}>ESTRUTURA</p>
            <h2 id={drawerTitleId} className={styles.drawerTitle}>
              Novo ministério
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
          onSubmit={handleCreateSubmit}
        >
          <div className={styles.drawerBody}>
            <div className={styles.fieldGroup}>
              <label htmlFor={nameInputId} className={styles.fieldLabel}>
                Nome
              </label>
              <input
                ref={nameInputRef}
                id={nameInputId}
                name="ministryName"
                type="text"
                value={ministryName}
                placeholder="Ex.: Iluminação"
                required
                minLength={2}
                maxLength={80}
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby={nameError ? nameErrorId : undefined}
                className={`${styles.input} ${
                  nameError ? styles.inputError : ""
                }`}
                onChange={(event) => {
                  setMinistryName(event.currentTarget.value);
                  if (nameError) setNameError("");
                }}
              />
              {nameError && (
                <div id={nameErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{nameError}</span>
                </div>
              )}
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor={descriptionInputId} className={styles.fieldLabel}>
                Descrição
              </label>
              <textarea
                id={descriptionInputId}
                name="ministryDescription"
                rows={3}
                value={ministryDescription}
                maxLength={200}
                placeholder="Descreva a atuação desta equipe."
                className={styles.textarea}
                onChange={(event) =>
                  setMinistryDescription(event.currentTarget.value)
                }
              />
            </div>

            <fieldset className={styles.managersFieldset}>
              <legend className={styles.sectionLegend}>
                Responsáveis do ministério
              </legend>
              <p className={styles.sectionHint}>
                Selecione entre os membros cadastrados em cada cargo.
              </p>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label
                    htmlFor={generalManagerSelectId}
                    className={styles.fieldLabel}
                  >
                    Gerente geral
                  </label>
                  <span className={styles.requiredTag}>Obrigatório</span>
                </div>
                <select
                  ref={generalManagerSelectRef}
                  id={generalManagerSelectId}
                  name="generalManagerId"
                  value={generalManagerId}
                  required
                  aria-invalid={generalManagerError ? "true" : "false"}
                  aria-describedby={
                    generalManagerError ? generalManagerErrorId : undefined
                  }
                  className={`${styles.select} ${
                    generalManagerError ? styles.inputError : ""
                  }`}
                  onChange={(event) => {
                    setGeneralManagerId(event.currentTarget.value);
                    if (generalManagerError) setGeneralManagerError("");
                  }}
                >
                  <option value="" disabled>
                    {generalManagers.length > 0
                      ? "Selecione o gerente geral..."
                      : "Nenhum gerente geral cadastrado"}
                  </option>
                  {generalManagers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.handle
                        ? `${person.name} (${person.handle})`
                        : person.name}
                    </option>
                  ))}
                </select>
                {generalManagerError && (
                  <div id={generalManagerErrorId} className={styles.errorMsg}>
                    <AlertCircleIcon className={styles.errorIcon} />
                    <span>{generalManagerError}</span>
                  </div>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label
                    htmlFor={ministryManagerSelectId}
                    className={styles.fieldLabel}
                  >
                    Gerente do ministério
                  </label>
                  <span className={styles.optionalTag}>Opcional</span>
                </div>
                <select
                  id={ministryManagerSelectId}
                  name="ministryManagerId"
                  value={ministryManagerId}
                  className={styles.select}
                  onChange={(event) =>
                    setMinistryManagerId(event.currentTarget.value)
                  }
                >
                  <option value="">
                    {ministryManagers.length > 0
                      ? "Nenhum selecionado"
                      : "Nenhum gerente do ministério cadastrado"}
                  </option>
                  {ministryManagers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.handle
                        ? `${person.name} (${person.handle})`
                        : person.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label
                    htmlFor={scheduleManagerSelectId}
                    className={styles.fieldLabel}
                  >
                    Gerente de escala
                  </label>
                  <span className={styles.optionalTag}>Opcional</span>
                </div>
                <select
                  id={scheduleManagerSelectId}
                  name="scheduleManagerId"
                  value={scheduleManagerId}
                  className={styles.select}
                  onChange={(event) =>
                    setScheduleManagerId(event.currentTarget.value)
                  }
                >
                  <option value="">
                    {scheduleManagers.length > 0
                      ? "Nenhum selecionado"
                      : "Nenhum gerente de escala cadastrado"}
                  </option>
                  {scheduleManagers.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.handle
                        ? `${person.name} (${person.handle})`
                        : person.name}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
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
              Criar ministério
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
