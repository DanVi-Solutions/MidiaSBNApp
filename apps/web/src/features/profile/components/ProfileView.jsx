"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CheckIcon,
  IdCardIcon,
  KeyIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserIcon,
} from "@/components/ui/icons";
import { deleteAccountRequest } from "@/features/profile/services/profileService";
import styles from "./ProfileView.module.css";

function getInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function normalizeUsername(raw) {
  return String(raw ?? "").trim().replace(/^@+/, "");
}

function validateFullName(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Informe seu nome completo.";
  if (trimmed.length < 2) return "O nome deve ter pelo menos 2 caracteres.";
  return "";
}

function validateUsername(value) {
  const normalized = normalizeUsername(value);
  if (!normalized) return "Informe seu nome de usuário.";
  if (normalized.length < 3) {
    return "O nome de usuário deve ter pelo menos 3 caracteres.";
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    return "Use apenas letras, números, ponto, hífen ou sublinhado.";
  }
  return "";
}

export function ProfileView() {
  const router = useRouter();
  const toast = useToast();
  const { currentUser, updateCurrentUser } = usePrivateWorkspace();

  const profileFormId = useId();
  const identHeadingId = useId();
  const accessHeadingId = useId();
  const dangerHeadingId = useId();
  const fullNameId = useId();
  const fullNameErrorId = useId();
  const usernameId = useId();
  const usernameErrorId = useId();
  const deleteModalTitleId = useId();
  const confirmUsernameId = useId();
  const deleteErrorId = useId();

  const fullNameRef = useRef(null);
  const usernameRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const confirmUsernameRef = useRef(null);
  const fullNameTouchedRef = useRef(false);
  const usernameTouchedRef = useRef(false);
  const announceTimerRef = useRef(null);

  const [fullName, setFullName] = useState(currentUser.name);
  const [username, setUsername] = useState(
    currentUser.handle.replace(/^@+/, "")
  );
  const [fullNameError, setFullNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const [confirmUsername, setConfirmUsername] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
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
  }, []);

  const announce = (message) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    setLiveAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setLiveAnnouncement(message);
    }, 200);
  };

  const handleFullNameChange = (event) => {
    const nextValue = event.currentTarget.value;
    fullNameTouchedRef.current = true;
    setFullName(nextValue);

    if (fullNameError && !validateFullName(nextValue)) {
      setFullNameError("");
    }
  };

  const handleUsernameChange = (event) => {
    const nextValue = event.currentTarget.value;
    usernameTouchedRef.current = true;
    setUsername(nextValue);

    if (usernameError && !validateUsername(nextValue)) {
      setUsernameError("");
    }
  };

  const handleSaveProfile = (event) => {
    event.preventDefault();

    fullNameTouchedRef.current = true;
    usernameTouchedRef.current = true;

    const nextFullNameError = validateFullName(fullName);
    const nextUsernameError = validateUsername(username);

    setFullNameError(nextFullNameError);
    setUsernameError(nextUsernameError);

    if (nextFullNameError) {
      announce(nextFullNameError);
      fullNameRef.current?.focus();
      return;
    }

    if (nextUsernameError) {
      announce(nextUsernameError);
      usernameRef.current?.focus();
      return;
    }

    const trimmedName = fullName.trim();
    const cleanUsername = normalizeUsername(username).toLowerCase();

    setFullName(trimmedName);
    setUsername(cleanUsername);
    updateCurrentUser({
      name: trimmedName,
      handle: `@${cleanUsername}`,
    });

    toast.success("Alterações de perfil salvas com sucesso.");
  };

  const handleOpenDeleteDialog = () => {
    const dialog = deleteDialogRef.current;
    if (!dialog || dialog.open) return;
    setConfirmUsername("");
    setDeleteError("");
    dialog.showModal();
  };

  const handleDeleteDialogClose = () => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    dialog.returnValue = "";
    setConfirmUsername("");
    setDeleteError("");
    setIsDeleting(false);
  };

  const expectedUsername = currentUser.handle.replace(/^@+/, "");

  const handleConfirmDelete = async (event) => {
    event.preventDefault();

    const typed = normalizeUsername(confirmUsername).toLowerCase();
    if (!typed) {
      const msg = "Digite seu nome de usuário para confirmar a exclusão.";
      setDeleteError(msg);
      announce(msg);
      confirmUsernameRef.current?.focus();
      return;
    }

    if (typed !== expectedUsername.toLowerCase()) {
      const msg = `O nome informado não confere com "${expectedUsername}".`;
      setDeleteError(msg);
      announce(msg);
      confirmUsernameRef.current?.focus();
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    const result = await deleteAccountRequest();

    if (result.ok) {
      deleteDialogRef.current?.close("deleted");
      toast.success("Conta excluída com sucesso.");
      router.push("/");
      return;
    }

    setIsDeleting(false);
    setDeleteError(result.error);
    announce(result.error);
    confirmUsernameRef.current?.focus();
  };

  const previewName = fullName.trim() || currentUser.name;
  const previewUsername = normalizeUsername(username) || expectedUsername;
  const previewInitials = getInitials(previewName);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>CONTA PESSOAL</p>
          <h1 className={styles.pageTitle}>Meu perfil</h1>
          <p className={styles.pageSubtitle}>
            Atualize o nome de usuário exibido para a equipe.
          </p>
        </div>

        <button
          type="submit"
          form={profileFormId}
          className={styles.saveButton}
        >
          <CheckIcon />
          <span>Salvar alterações</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <div className={styles.layoutGrid}>
        <aside className={styles.identityCard} aria-label="Resumo do perfil">
          <div className={styles.avatarRing} aria-hidden="true">
            <span className={styles.avatarCircle}>{previewInitials}</span>
          </div>
          <h2 className={styles.identityName}>{previewName}</h2>
          <p className={styles.identityHandle}>@{previewUsername}</p>
          <span className={styles.accessBadge}>
            <span className={styles.accessDot} aria-hidden="true" />
            {currentUser.accessBadgeLabel}
          </span>
        </aside>

        <div className={styles.cardsColumn}>
          <section className={styles.card} aria-labelledby={identHeadingId}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>INFORMAÇÕES EDITÁVEIS</p>
                <h2 id={identHeadingId} className={styles.cardTitle}>
                  Identificação
                </h2>
                <p className={styles.cardSubtitle}>
                  Atualize seu nome completo e o identificador exibido no
                  sistema.
                </p>
              </div>
              <UserIcon className={styles.cardCornerIcon} />
            </div>

            <form
              id={profileFormId}
              method="POST"
              noValidate
              className={styles.profileForm}
              onSubmit={handleSaveProfile}
            >
              <div className={styles.fieldGroup}>
                <label htmlFor={fullNameId} className={styles.fieldLabel}>
                  Nome completo
                </label>
                <input
                  ref={fullNameRef}
                  id={fullNameId}
                  name="fullName"
                  type="text"
                  value={fullName}
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  aria-invalid={fullNameError ? "true" : "false"}
                  aria-describedby={fullNameError ? fullNameErrorId : undefined}
                  className={`${styles.input} ${
                    fullNameError ? styles.inputError : ""
                  }`}
                  onChange={handleFullNameChange}
                  onBlur={() => {
                    if (fullNameTouchedRef.current) {
                      setFullNameError(validateFullName(fullName));
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

              <div className={styles.fieldGroup}>
                <label htmlFor={usernameId} className={styles.fieldLabel}>
                  Nome de usuário
                </label>
                <input
                  ref={usernameRef}
                  id={usernameId}
                  name="username"
                  type="text"
                  value={username}
                  autoComplete="username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  minLength={3}
                  maxLength={30}
                  aria-invalid={usernameError ? "true" : "false"}
                  aria-describedby={usernameError ? usernameErrorId : undefined}
                  className={`${styles.input} ${
                    usernameError ? styles.inputError : ""
                  }`}
                  onChange={handleUsernameChange}
                  onBlur={() => {
                    if (usernameTouchedRef.current) {
                      setUsernameError(validateUsername(username));
                    }
                  }}
                />
                {usernameError && (
                  <div id={usernameErrorId} className={styles.errorMsg}>
                    <AlertCircleIcon className={styles.errorIcon} />
                    <span>{usernameError}</span>
                  </div>
                )}
              </div>
            </form>
          </section>

          <section className={styles.card} aria-labelledby={accessHeadingId}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>SOMENTE VISUALIZAÇÃO</p>
                <h2 id={accessHeadingId} className={styles.cardTitle}>
                  Informações pessoais e de acesso
                </h2>
                <p className={styles.cardSubtitle}>
                  Esses dados são administrados pela liderança e não podem ser
                  alterados aqui.
                </p>
              </div>
              <ShieldCheckIcon className={styles.cardCornerIcon} />
            </div>

            <dl className={styles.readonlyGrid}>
              <div className={styles.readonlyTile}>
                <span className={styles.tileIconWrap} aria-hidden="true">
                  <IdCardIcon />
                </span>
                <div>
                  <dt>PERFIL DE ACESSO</dt>
                  <dd>{currentUser.roleLabel}</dd>
                </div>
              </div>

              <div className={styles.readonlyTile}>
                <span className={styles.tileIconWrap} aria-hidden="true">
                  <UserIcon />
                </span>
                <div>
                  <dt>MINISTÉRIO</dt>
                  <dd>{currentUser.ministries.join(", ")}</dd>
                </div>
              </div>

              <div className={styles.readonlyTile}>
                <span className={styles.tileIconWrap} aria-hidden="true">
                  <KeyIcon />
                </span>
                <div>
                  <dt>CÓDIGO DE CREDENCIAL</dt>
                  <dd className={styles.monoValue}>
                    {currentUser.credentialCode}
                  </dd>
                </div>
              </div>

              <div className={styles.readonlyTile}>
                <span className={styles.tileIconWrap} aria-hidden="true">
                  <ShieldCheckIcon />
                </span>
                <div>
                  <dt>STATUS</dt>
                  <dd>{currentUser.statusLabel}</dd>
                </div>
              </div>
            </dl>
          </section>

          <section
            className={`${styles.card} ${styles.dangerCard}`}
            aria-labelledby={dangerHeadingId}
          >
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.dangerEyebrow}>ZONA DE PERIGO</p>
                <h2 id={dangerHeadingId} className={styles.cardTitle}>
                  Excluir conta
                </h2>
                <p className={styles.cardSubtitle}>
                  Ao excluir sua conta, seu acesso individual e sua participação
                  nas escalas serão removidos permanentemente.
                </p>
              </div>
            </div>

            <div className={styles.dangerActions}>
              <button
                type="button"
                className={styles.deleteTriggerButton}
                onClick={handleOpenDeleteDialog}
              >
                <TrashIcon />
                <span>Excluir minha conta</span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <dialog
        ref={deleteDialogRef}
        closedby="any"
        aria-labelledby={deleteModalTitleId}
        className={styles.deleteDialog}
        onClose={handleDeleteDialogClose}
      >
        <form
          className={styles.modalForm}
          noValidate
          onSubmit={handleConfirmDelete}
        >
          <div className={styles.modalHeader}>
            <span className={styles.modalDangerBadge} aria-hidden="true">
              <TrashIcon />
            </span>
            <div>
              <h2 id={deleteModalTitleId} className={styles.modalTitle}>
                Excluir sua conta?
              </h2>
              <p className={styles.modalSubtitle}>
                Esta ação não pode ser desfeita. Sua credencial deixará de
                funcionar imediatamente.
              </p>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor={confirmUsernameId} className={styles.fieldLabel}>
              Digite <strong>{expectedUsername}</strong> para confirmar
            </label>
            <input
              ref={confirmUsernameRef}
              id={confirmUsernameId}
              type="text"
              value={confirmUsername}
              placeholder={expectedUsername}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={deleteError ? "true" : "false"}
              aria-describedby={deleteError ? deleteErrorId : undefined}
              className={`${styles.input} ${
                deleteError ? styles.inputError : ""
              }`}
              onChange={(event) => {
                setConfirmUsername(event.currentTarget.value);
                if (deleteError) setDeleteError("");
              }}
            />
            {deleteError && (
              <div id={deleteErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{deleteError}</span>
              </div>
            )}
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              className={styles.modalCancelButton}
              onClick={() => deleteDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting}
              aria-busy={isDeleting}
              className={styles.modalDeleteButton}
            >
              {isDeleting ? "Excluindo conta..." : "Excluir conta permanentemente"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
