"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { CredentialCodeModal } from "@/components/ui/CredentialCodeModal";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  IdCardIcon,
  KeyIcon,
  MoonIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
} from "@/components/ui/icons";
import { useTheme } from "@/lib/theme";
import {
  checkUsernameAvailabilityRequest,
  deleteAccountRequest,
  regenerateOwnCredentialRequest,
  updateProfileRequest,
} from "@/features/profile/services/profileService";
import { DevicePushCard } from "@/features/notifications/components/DevicePushCard";
import {
  computeInitials,
  CREDENTIAL_STATUS,
  isAdmin,
  normalizeUsername,
  validateDisplayName,
  validateUsername,
} from "@/lib/roles";
import styles from "./ProfileView.module.css";

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

export function ProfileView() {
  const router = useRouter();
  const toast = useToast();
  const {
    currentUser,
    refreshCurrentUser,
    refreshParticipants,
    notifySchedulesChanged,
    updateCurrentUser,
  } = usePrivateWorkspace();

  const profileFormId = useId();
  const identHeadingId = useId();
  const accessHeadingId = useId();
  const appearanceHeadingId = useId();
  const dangerHeadingId = useId();
  const { theme, setTheme } = useTheme();
  const fullNameId = useId();
  const fullNameErrorId = useId();
  const usernameId = useId();
  const usernameHintId = useId();
  const usernameErrorId = useId();
  const rotateModalTitleId = useId();
  const deleteModalTitleId = useId();
  const confirmUsernameId = useId();
  const deleteErrorId = useId();

  const fullNameRef = useRef(null);
  const usernameRef = useRef(null);
  const rotateDialogRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const confirmUsernameRef = useRef(null);
  const fullNameTouchedRef = useRef(false);
  const usernameTouchedRef = useRef(false);
  const availabilityReqRef = useRef(0);
  const announceTimerRef = useRef(null);

  const initialUsername = (
    currentUser.username ||
    currentUser.handle?.replace(/^@+/, "") ||
    ""
  ).toLowerCase();

  const [nameDraft, setNameDraft] = useState(null);
  const [usernameDraft, setUsernameDraft] = useState(null);
  const fullName = nameDraft ?? (currentUser.name || "");
  const username = usernameDraft ?? initialUsername;

  const [fullNameError, setFullNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const [codeModalState, setCodeModalState] = useState(null);

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
    const cleanRotate = setupClosedByFallback(rotateDialogRef.current);
    const cleanDelete = setupClosedByFallback(deleteDialogRef.current);

    return () => {
      if (cleanRotate) cleanRotate();
      if (cleanDelete) cleanDelete();
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

  const checkAvailabilityOnBlur = async (rawValue) => {
    const syntaxError = validateUsername(rawValue);
    if (syntaxError) {
      setUsernameStatus("idle");
      setUsernameError(syntaxError);
      return;
    }

    const clean = normalizeUsername(rawValue);
    if (clean === initialUsername) {
      setUsernameStatus("idle");
      setUsernameError("");
      return;
    }

    const reqId = ++availabilityReqRef.current;
    setUsernameStatus("checking");
    const result = await checkUsernameAvailabilityRequest(clean);
    if (reqId !== availabilityReqRef.current) return;

    if (!result.ok) {
      setUsernameStatus("idle");
      return;
    }

    if (result.data?.available === false) {
      setUsernameStatus("taken");
      setUsernameError("Este apelido já está em uso.");
      return;
    }

    setUsernameStatus("available");
    setUsernameError("");
  };

  const handleFullNameChange = (event) => {
    const nextValue = event.currentTarget.value;
    fullNameTouchedRef.current = true;
    setNameDraft(nextValue);

    if (fullNameError && !validateDisplayName(nextValue)) {
      setFullNameError("");
    }
  };

  const handleUsernameChange = (event) => {
    const nextValue = event.currentTarget.value;
    usernameTouchedRef.current = true;
    setUsernameDraft(nextValue);
    setUsernameStatus("idle");

    if (usernameError && !validateUsername(nextValue)) {
      setUsernameError("");
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    fullNameTouchedRef.current = true;
    usernameTouchedRef.current = true;

    const nextFullNameError = validateDisplayName(fullName);
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
    const cleanUsername = normalizeUsername(username);

    setIsSaving(true);

    if (cleanUsername !== initialUsername) {
      const availRes = await checkUsernameAvailabilityRequest(cleanUsername);
      if (availRes.ok && availRes.data?.available === false) {
        setIsSaving(false);
        setUsernameStatus("taken");
        setUsernameError("Este apelido já está em uso.");
        usernameRef.current?.focus();
        return;
      }
    }

    const payload = {};
    if (trimmedName !== currentUser.name) {
      payload.name = trimmedName;
    }
    if (cleanUsername !== initialUsername) {
      payload.username = cleanUsername;
    }

    if (!payload.name && !payload.username) {
      setIsSaving(false);
      toast.success("Nenhuma alteração pendente.");
      return;
    }

    const result = await updateProfileRequest(payload);
    setIsSaving(false);

    if (!result.ok) {
      if (result.status === 409) {
        setUsernameStatus("taken");
        setUsernameError(
          result.error || "Este apelido já está em uso."
        );
        usernameRef.current?.focus();
      } else {
        toast.error(
          result.error || "Não foi possível salvar as alterações do perfil."
        );
      }
      return;
    }

    setNameDraft(null);
    setUsernameDraft(null);
    setUsernameStatus("idle");
    fullNameTouchedRef.current = false;
    usernameTouchedRef.current = false;
    updateCurrentUser({
      name: trimmedName,
      username: cleanUsername,
      handle: `@${cleanUsername}`,
    });
    await Promise.all([
      refreshCurrentUser(),
      refreshParticipants({ silent: true }),
    ]);
    notifySchedulesChanged();

    toast.success("Alterações de perfil salvas com sucesso.");
  };

  const handleOpenRotateDialog = () => {
    const dialog = rotateDialogRef.current;
    if (!dialog || dialog.open) return;
    setIsRegeneratingCode(false);
    dialog.showModal();
  };

  const handleRotateDialogClose = () => {
    const dialog = rotateDialogRef.current;
    if (dialog) dialog.returnValue = "";
    setIsRegeneratingCode(false);
  };

  const handleConfirmRotateCredential = async (event) => {
    event.preventDefault();
    if (isRegeneratingCode) return;

    setIsRegeneratingCode(true);
    const result = await regenerateOwnCredentialRequest(currentUser.id);
    setIsRegeneratingCode(false);

    if (!result.ok || !result.data?.credentialNumber) {
      toast.error(
        result.error || "Não foi possível gerar um novo código de credencial."
      );
      return;
    }

    rotateDialogRef.current?.close("done");
    await refreshCurrentUser();
    setCodeModalState({
      variant: "hashed-self",
      title: "Seu novo código de acesso",
      subtitle:
        "Sua credencial foi substituída por um novo código.",
      personName: currentUser.name,
      status: CREDENTIAL_STATUS.ACTIVE,
      credentialNumber: result.data.credentialNumber,
    });
    toast.success("Novo código de credencial gerado com sucesso.");
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

  const expectedUsername = initialUsername;

  const handleConfirmDelete = async (event) => {
    event.preventDefault();
    if (isDeleting) return;

    const typed = normalizeUsername(confirmUsername);
    if (!typed) {
      const msg = "Digite seu apelido para confirmar a exclusão.";
      setDeleteError(msg);
      announce(msg);
      confirmUsernameRef.current?.focus();
      return;
    }

    if (typed !== expectedUsername) {
      const msg = `O apelido informado não confere com "${expectedUsername}".`;
      setDeleteError(msg);
      announce(msg);
      confirmUsernameRef.current?.focus();
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    const result = await deleteAccountRequest(currentUser.id);

    if (result.ok) {
      deleteDialogRef.current?.close("deleted");
      toast.success("Conta excluída com sucesso.");
      router.replace("/");
      return;
    }

    setIsDeleting(false);
    setDeleteError(result.error);
    announce(result.error);
    confirmUsernameRef.current?.focus();
  };

  const previewName = fullName.trim() || currentUser.name;
  const previewUsername = normalizeUsername(username) || expectedUsername;
  const previewInitials = computeInitials(previewName);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>CONTA PESSOAL</p>
          <h1 className={styles.pageTitle}>Meu perfil</h1>
          <p className={styles.pageSubtitle}>
            Atualize seus dados pessoais ou troque sua credencial de acesso.
          </p>
        </div>

        <button
          type="submit"
          form={profileFormId}
          disabled={isSaving}
          aria-busy={isSaving}
          className={styles.saveButton}
        >
          <CheckIcon />
          <span>{isSaving ? "Salvando..." : "Salvar alterações"}</span>
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
          <p className={styles.identityHandle}>
            {previewUsername ? `@${previewUsername}` : "Sem apelido"}
          </p>
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
                      setFullNameError(validateDisplayName(fullName));
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
                  Apelido
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
                  maxLength={15}
                  aria-invalid={usernameError ? "true" : "false"}
                  aria-describedby={`${usernameHintId}${
                    usernameError ? ` ${usernameErrorId}` : ""
                  }`}
                  className={`${styles.input} ${
                    usernameError ? styles.inputError : ""
                  }`}
                  onChange={handleUsernameChange}
                  onBlur={() => {
                    if (usernameTouchedRef.current) {
                      checkAvailabilityOnBlur(username);
                    }
                  }}
                />
                <span id={usernameHintId} className={styles.fieldHint}>
                  3 a 15 caracteres: letras, números, _ ou .
                </span>
                {usernameError ? (
                  <div id={usernameErrorId} className={styles.errorMsg}>
                    <AlertCircleIcon className={styles.errorIcon} />
                    <span>{usernameError}</span>
                  </div>
                ) : usernameStatus === "checking" ? (
                  <span className={styles.availabilityChecking}>
                    Verificando disponibilidade...
                  </span>
                ) : usernameStatus === "available" ? (
                  <span className={styles.availabilityOk}>
                    <CheckIcon />
                    <span>Apelido disponível</span>
                  </span>
                ) : null}
              </div>
            </form>
          </section>

          <section className={styles.card} aria-labelledby={accessHeadingId}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>ACESSO &amp; CREDENCIAL</p>
                <h2 id={accessHeadingId} className={styles.cardTitle}>
                  Informações pessoais e de acesso
                </h2>
                <p className={styles.cardSubtitle}>
                  Somente você sabe o seu código de acesso, e ele não fica
                  visível após o primeiro acesso. Você pode gerar um novo código
                  a qualquer momento.
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
                  <dd>
                    {currentUser.ministries?.length > 0
                      ? currentUser.ministries.join(", ")
                      : "Administração Geral"}
                  </dd>
                </div>
              </div>

              <div className={styles.readonlyTile}>
                <span className={styles.tileIconWrap} aria-hidden="true">
                  <KeyIcon />
                </span>
                <div className={styles.credentialTileBody}>
                  <div>
                    <dt>CÓDIGO DE CREDENCIAL</dt>
                    <dd className={styles.monoValue}>
                      Protegido
                    </dd>
                  </div>
                  <button
                    type="button"
                    className={styles.rotateCredentialBtn}
                    onClick={handleOpenRotateDialog}
                  >
                    <RefreshCwIcon />
                    <span>Trocar código</span>
                  </button>
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

          <section className={styles.card} aria-labelledby={appearanceHeadingId}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>PREFERÊNCIAS</p>
                <h2 id={appearanceHeadingId} className={styles.cardTitle}>
                  Aparência
                </h2>
                <p className={styles.cardSubtitle}>
                  Escolha o tema visual da plataforma. Sua preferência fica
                  salva automaticamente neste navegador.
                </p>
              </div>
              {theme === "dark" ? (
                <MoonIcon className={styles.cardCornerIcon} />
              ) : (
                <SunIcon className={styles.cardCornerIcon} />
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Tema da interface"
              className={styles.themeOptionsGrid}
            >
              {[
                {
                  id: "light",
                  label: "Modo claro",
                  badge: "Padrão",
                  description: "Fundo claro com alto contraste",
                  Icon: SunIcon,
                },
                {
                  id: "dark",
                  label: "Modo escuro",
                  badge: null,
                  description: "Superfícies escuras no mesmo estilo visual",
                  Icon: MoonIcon,
                },
              ].map(({ id: optionId, label, badge, description, Icon }) => {
                const isSelected = theme === optionId;
                return (
                  <button
                    key={optionId}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`${styles.themeOption} ${
                      isSelected ? styles.themeOptionActive : ""
                    }`}
                    onClick={() => {
                      if (theme === optionId) {
                        return;
                      }
                      setTheme(optionId);
                      const msg =
                        optionId === "dark"
                          ? "Modo escuro ativado."
                          : "Modo claro ativado.";
                      announce(msg);
                      toast.success(msg);
                    }}
                  >
                    <span className={styles.themeOptionIcon} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={styles.themeOptionBody}>
                      <span className={styles.themeOptionTitleRow}>
                        <span className={styles.themeOptionTitle}>{label}</span>
                        {badge ? (
                          <span className={styles.themeOptionTag}>{badge}</span>
                        ) : null}
                      </span>
                      <span className={styles.themeOptionDesc}>
                        {description}
                      </span>
                    </span>
                    {isSelected ? (
                      <span
                        className={styles.themeOptionCheck}
                        aria-hidden="true"
                      >
                        <CheckIcon />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          {!isAdmin(currentUser) && <DevicePushCard />}

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
        ref={rotateDialogRef}
        closedby="any"
        aria-labelledby={rotateModalTitleId}
        className={styles.deleteDialog}
        onCancel={(event) => {
          if (isRegeneratingCode) event.preventDefault();
        }}
        onClose={handleRotateDialogClose}
      >
        <form className={styles.modalForm} onSubmit={handleConfirmRotateCredential}>
          <div className={styles.modalHeader}>
            <span className={styles.modalWarningBadge} aria-hidden="true">
              <AlertTriangleIcon />
            </span>
            <div>
              <h2 id={rotateModalTitleId} className={styles.modalTitle}>
                Trocar seu código de credencial?
              </h2>
              <p className={styles.modalSubtitle}>
                Um novo código será gerado imediatamente. Seu código atual deixará de funcionar
                e todos os outros dispositivos conectados serão desconectados.
              </p>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              disabled={isRegeneratingCode}
              className={styles.modalCancelButton}
              onClick={() => rotateDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isRegeneratingCode}
              aria-busy={isRegeneratingCode}
              className={styles.modalPrimaryButton}
            >
              <RefreshCwIcon />
              <span>
                {isRegeneratingCode ? "Gerando..." : "Gerar novo código"}
              </span>
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        closedby="any"
        aria-labelledby={deleteModalTitleId}
        className={styles.deleteDialog}
        onCancel={(event) => {
          if (isDeleting) event.preventDefault();
        }}
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
              disabled={isDeleting}
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
              {isDeleting
                ? "Excluindo conta..."
                : "Excluir conta permanentemente"}
            </button>
          </div>
        </form>
      </dialog>

      <CredentialCodeModal
        modalState={codeModalState}
        onClose={() => setCodeModalState(null)}
      />
    </div>
  );
}
