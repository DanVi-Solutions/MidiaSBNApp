"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  KeyIcon,
  LogOutIcon,
  RefreshCwIcon,
} from "@/components/ui/icons";
import {
  checkUsernameAvailability,
  completeAccountRecovery,
  prepareActivationCode,
  submitFirstAccess,
} from "@/features/auth/services/authService";
import {
  copyTextToClipboard,
  getRoleLabel,
  normalizeUsername,
  ROLES,
  validateDisplayName,
  validateUsername,
} from "@/lib/roles";
import styles from "./CredentialOnboardingModal.module.css";

function getMinistryWelcomeTitle(credential) {
  if (!credential) return "Boas-vindas à equipe!";
  if (credential.role === ROLES.ADMINISTRATOR) {
    return "Boas-vindas à Mídia Sobrenatural!";
  }

  const departments = Array.isArray(credential.departments)
    ? credential.departments.filter((d) => d?.name)
    : [];

  if (departments.length === 1) {
    return `Boas-vindas ao ministério ${departments[0].name}!`;
  }
  if (departments.length > 1) {
    return "Boas-vindas aos seus ministérios!";
  }
  return "Boas-vindas ao ministério!";
}

function CredentialOnboardingContent({
  onboardingState,
  headingId,
  stepTwoHeadingId,
  recoveryHeadingId,
  nameInputRef,
  recoveryHeadingRef,
  copyButtonRef,
  confirmCheckboxRef,
  step,
  onStepChange,
  cancelGuardNotice,
  onClearCancelGuard,
  onComplete,
  onAbortLogout,
  onRetryRecovery,
}) {
  const toast = useToast();

  const nameInputId = useId();
  const nameErrorId = useId();
  const usernameInputId = useId();
  const usernameHelpId = useId();
  const usernameErrorId = useId();
  const confirmCheckboxId = useId();
  const confirmErrorId = useId();
  const guardNoticeId = useId();

  const usernameInputRef = useRef(null);
  const stepTwoHeadingRef = useRef(null);
  const nameTouchedRef = useRef(false);
  const usernameTouchedRef = useRef(false);
  const availabilityReqRef = useRef(0);
  const copyTimerRef = useRef(null);

  const mode = onboardingState.mode || "first-access";
  const credential = onboardingState.credential || null;
  const recoveryCode = onboardingState.generatedCode || "";
  const recoveryError = onboardingState.recoveryError || "";

  const [name, setName] = useState(credential?.name || "");
  const [username, setUsername] = useState(credential?.username || "");
  const [nameError, setNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameAvailabilityState, setUsernameAvailabilityState] =
    useState("idle");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [generatedCode, setGeneratedCode] = useState(recoveryCode);
  const [activationToken, setActivationToken] = useState(
    onboardingState.activationToken || ""
  );
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [commitError, setCommitError] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [isRefreshingCode, setIsRefreshingCode] = useState(false);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const checkAvailabilityOnBlur = async (rawValue) => {
    const syntaxError = validateUsername(rawValue);
    if (syntaxError) {
      setUsernameAvailabilityState("idle");
      setUsernameError(syntaxError);
      return false;
    }

    const reqId = ++availabilityReqRef.current;
    setUsernameAvailabilityState("checking");
    const result = await checkUsernameAvailability(rawValue);
    if (reqId !== availabilityReqRef.current) return true;

    if (!result.ok) {
      setUsernameAvailabilityState("idle");
      return true;
    }

    if (result.data?.available === false) {
      setUsernameAvailabilityState("taken");
      setUsernameError("Este apelido já está em uso.");
      return false;
    }

    setUsernameAvailabilityState("available");
    setUsernameError("");
    return true;
  };

  const handleNameChange = (event) => {
    const nextValue = event.currentTarget.value;
    nameTouchedRef.current = true;
    setName(nextValue);
    setFormError("");

    if (nameError && !validateDisplayName(nextValue)) {
      setNameError("");
    }
  };

  const handleUsernameChange = (event) => {
    const nextValue = event.currentTarget.value;
    usernameTouchedRef.current = true;
    setUsername(nextValue);
    setUsernameAvailabilityState("idle");
    setFormError("");

    if (usernameError && !validateUsername(nextValue)) {
      setUsernameError("");
    }
  };

  const handleFirstAccessSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    nameTouchedRef.current = true;
    usernameTouchedRef.current = true;

    const nextNameError = validateDisplayName(name);
    const nextUsernameError = validateUsername(username);

    setNameError(nextNameError);
    setUsernameError(nextUsernameError);
    setFormError("");

    if (nextNameError) {
      nameInputRef.current?.focus();
      return;
    }

    if (nextUsernameError) {
      usernameInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    const cleanUsername = normalizeUsername(username);

    const availCheck = await checkUsernameAvailability(cleanUsername);
    if (availCheck.ok && availCheck.data?.available === false) {
      setIsSubmitting(false);
      setUsernameAvailabilityState("taken");
      setUsernameError("Este apelido já está em uso.");
      usernameInputRef.current?.focus();
      return;
    }

    const prepResult = await prepareActivationCode();

    setIsSubmitting(false);

    if (
      !prepResult.ok ||
      !prepResult.data?.credentialNumber ||
      !prepResult.data?.activationToken
    ) {
      setFormError(
        prepResult.error ||
          "Não foi possível gerar seu novo código de acesso. Tente novamente."
      );
      return;
    }

    setGeneratedCode(prepResult.data.credentialNumber);
    setActivationToken(prepResult.data.activationToken);
    setCopied(false);
    setConfirmed(false);
    setConfirmError("");
    setCommitError("");
    onClearCancelGuard();
    onStepChange("reveal-code");

    toast.success("Código gerado! Copie e confirme para concluir o acesso.");

    window.requestAnimationFrame(() => {
      stepTwoHeadingRef.current?.focus();
    });
  };

  const activeCode = generatedCode || recoveryCode;

  const handleCopy = async () => {
    if (!activeCode) return;

    const didCopy = await copyTextToClipboard(activeCode);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }

    if (didCopy) {
      setCopied(true);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2200);
      toast.success("Novo código copiado para a área de transferência.");
    } else {
      toast.error(
        `Não foi possível copiar automaticamente. Código: ${activeCode}`
      );
    }
  };

  const handleRegeneratePreviewCode = async () => {
    if (isRefreshingCode || isActivating) return;
    setIsRefreshingCode(true);
    const prepResult = await prepareActivationCode();
    setIsRefreshingCode(false);

    if (
      !prepResult.ok ||
      !prepResult.data?.credentialNumber ||
      !prepResult.data?.activationToken
    ) {
      const msg = prepResult.error || "Não foi possível gerar um novo código.";
      setCommitError(msg);
      toast.error(msg);
      return;
    }

    setGeneratedCode(prepResult.data.credentialNumber);
    setActivationToken(prepResult.data.activationToken);
    setCopied(false);
    setConfirmed(false);
    setConfirmError("");
    setCommitError("");
    toast.success("Novo código gerado! Copie e confirme para continuar.");
    copyButtonRef.current?.focus();
  };

  const handleEnterSystem = async () => {
    if (!confirmed || isActivating || isRefreshingCode) {
      if (!confirmed) {
        setConfirmError(
          "Confirme que você copiou ou anotou seu novo código antes de entrar."
        );
        confirmCheckboxRef.current?.focus();
      }
      return;
    }

    setCommitError("");
    setConfirmError("");
    setIsActivating(true);

    if (mode === "recovery") {
      const result = await completeAccountRecovery({ activationToken });
      setIsActivating(false);

      if (!result.ok || !result.data) {
        const msg =
          result.error ||
          "Não foi possível concluir a recuperação da sua credencial.";
        setCommitError(msg);
        toast.error(msg);
        return;
      }

      onComplete(result.data);
      return;
    }

    const result = await submitFirstAccess({
      name: name.trim(),
      username: normalizeUsername(username),
      activationToken,
    });
    setIsActivating(false);

    if (!result.ok || !result.data) {
      const errorText = String(result.error || "");
      if (result.status === 409 && /username|usuário|apelido/i.test(errorText)) {
        const takenMsg =
          result.error || "Este apelido já está em uso.";
        setUsernameAvailabilityState("taken");
        setUsernameError(takenMsg);
        onStepChange("confirm-info");
        toast.error(takenMsg);
        window.requestAnimationFrame(() => {
          usernameInputRef.current?.focus();
        });
        return;
      }

      const msg =
        result.error ||
        "Não foi possível ativar sua credencial. Tente novamente.";
      setCommitError(msg);
      toast.error(msg);
      return;
    }

    onComplete(result.data);
  };
  const departments = Array.isArray(credential?.departments)
    ? credential.departments.filter((d) => d?.name)
    : [];

  return (
    <>
      {mode === "first-access" && (
        <nav
          aria-label="Progresso do primeiro acesso"
          className={styles.progressBar}
        >
          <ol className={styles.progressList}>
            <li
              aria-current={step === "confirm-info" ? "step" : undefined}
              className={`${styles.progressStep} ${
                step === "confirm-info"
                  ? styles.progressStepActive
                  : styles.progressStepDone
              }`}
            >
              <span className={styles.stepDot} aria-hidden="true">
                {step === "reveal-code" ? <CheckIcon /> : "1"}
              </span>
              <span>Confirmar informações</span>
            </li>
            <li
              aria-current={step === "reveal-code" ? "step" : undefined}
              className={`${styles.progressStep} ${
                step === "reveal-code" ? styles.progressStepActive : ""
              }`}
            >
              <span className={styles.stepDot} aria-hidden="true">
                2
              </span>
              <span>Novo código</span>
            </li>
          </ol>
        </nav>
      )}

      {mode === "first-access" && step === "confirm-info" && (
        <form
          method="POST"
          noValidate
          className={styles.modalForm}
          onSubmit={handleFirstAccessSubmit}
        >
          <div className={styles.modalHeader}>
            <p className={styles.eyebrow}>PRIMEIRO ACESSO AO SISTEMA</p>
            <h2 id={headingId} className={styles.title}>
              {getMinistryWelcomeTitle(credential)}
            </h2>
            <p className={styles.subtitle}>
              Confirme suas informações abaixo para ativar sua conta e gerar seu
              novo código de acesso.
            </p>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.welcomeContextCard}>
              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>Papel atribuído</span>
                <span className={styles.contextValue}>
                  {getRoleLabel(credential?.role)}
                </span>
              </div>

              <div className={styles.contextItem}>
                <span className={styles.contextLabel}>
                  {departments.length > 1 ? "Ministérios" : "Ministério"}
                </span>
                {departments.length > 0 ? (
                  <div className={styles.ministryChips}>
                    {departments.map((dept) => (
                      <span key={dept.id} className={styles.ministryChip}>
                        {dept.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.contextValue}>
                    Administração Geral
                  </span>
                )}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label htmlFor={nameInputId} className={styles.fieldLabel}>
                  Nome completo
                </label>
                <span className={styles.requiredTag}>Obrigatório</span>
              </div>
              <input
                ref={nameInputRef}
                id={nameInputId}
                name="name"
                type="text"
                value={name}
                required
                minLength={2}
                maxLength={80}
                autoFocus
                autoComplete="name"
                enterKeyHint="next"
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby={
                  [nameError ? nameErrorId : "", cancelGuardNotice ? guardNoticeId : ""]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className={`${styles.input} ${
                  nameError ? styles.inputError : ""
                }`}
                onChange={handleNameChange}
                onBlur={() => {
                  if (nameTouchedRef.current) {
                    setNameError(validateDisplayName(name));
                  }
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
              <div className={styles.fieldLabelRow}>
                <label htmlFor={usernameInputId} className={styles.fieldLabel}>
                  Apelido
                </label>
                <span className={styles.requiredTag}>Obrigatório</span>
              </div>
              <input
                ref={usernameInputRef}
                id={usernameInputId}
                name="username"
                type="text"
                value={username}
                placeholder="ex: maria.silva"
                required
                minLength={3}
                maxLength={15}
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                aria-invalid={usernameError ? "true" : "false"}
                aria-describedby={`${usernameHelpId}${
                  usernameError ? ` ${usernameErrorId}` : ""
                }`}
                className={`${styles.input} ${
                  usernameError ? styles.inputError : ""
                }`}
                onChange={handleUsernameChange}
                onBlur={() => {
                  if (usernameTouchedRef.current || username.trim()) {
                    checkAvailabilityOnBlur(username);
                  }
                }}
              />
              <span id={usernameHelpId} className={styles.fieldHint}>
                3 a 15 caracteres: letras minúsculas, números, _ ou . (sem
                espaços).
              </span>

              {usernameError ? (
                <div id={usernameErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{usernameError}</span>
                </div>
              ) : usernameAvailabilityState === "checking" ? (
                <span className={styles.availabilityChecking}>
                  Verificando disponibilidade...
                </span>
              ) : usernameAvailabilityState === "available" ? (
                <span className={styles.availabilityOk}>
                  <CheckIcon />
                  <span>Apelido disponível</span>
                </span>
              ) : null}
            </div>

            {formError && (
              <div className={styles.formBannerError} role="alert">
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{formError}</span>
              </div>
            )}

            <p
              id={guardNoticeId}
              className={`${styles.guardNotice} ${
                cancelGuardNotice ? styles.guardNoticeVisible : ""
              }`}
              aria-live="polite"
            >
              {cancelGuardNotice ||
                "Confirme suas informações para continuar."}
            </p>
          </div>

          <div className={styles.modalFooterBetween}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={isSubmitting}
              onClick={onAbortLogout}
            >
              <LogOutIcon />
              <span>Sair</span>
            </button>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              <span>
                {isSubmitting ? "Gerando código..." : "Confirmar e gerar código"}
              </span>
              <ArrowRightIcon />
            </button>
          </div>
        </form>
      )}

      {mode === "recovery" && recoveryError && !activeCode && (
        <div className={styles.modalForm}>
          <div className={styles.modalHeader}>
            <p className={styles.eyebrow}>RECUPERAÇÃO DE ACESSO</p>
            <h2
              ref={recoveryHeadingRef}
              tabIndex={-1}
              id={recoveryHeadingId}
              className={styles.title}
            >
              Não foi possível gerar seu novo código
            </h2>
            <p className={styles.subtitle}>{recoveryError}</p>
          </div>

          <div className={styles.modalFooterBetween}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onAbortLogout}
            >
              <LogOutIcon />
              <span>Sair</span>
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={onRetryRecovery}
            >
              <RefreshCwIcon />
              <span>Tentar novamente</span>
            </button>
          </div>
        </div>
      )}

      {((mode === "first-access" && step === "reveal-code") ||
        (mode === "recovery" && Boolean(activeCode))) && (
        <div className={styles.modalForm}>
          <div className={styles.modalHeader}>
            {mode === "recovery" && (
              <p className={styles.eyebrow}>RECUPERAÇÃO CONCLUÍDA</p>
            )}
            <h2
              ref={mode === "recovery" ? recoveryHeadingRef : stepTwoHeadingRef}
              tabIndex={-1}
              id={mode === "recovery" ? recoveryHeadingId : stepTwoHeadingId}
              className={styles.title}
            >
              Seu novo código de acesso
            </h2>
            <p className={styles.subtitle}>
              {mode === "recovery"
                ? "Copie e guarde este código antes de acessar o sistema. Ao confirmar sua entrada, o código temporário será substituído."
                : "Copie e guarde este código antes de acessar o sistema. Ao confirmar sua entrada, sua conta será ativada e o código inicial será substituído."}
            </p>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.codeCard}>
              <div className={styles.codeCardTop}>
                <span className={styles.codeLabel}>
                  <KeyIcon />
                  <span>Novo código</span>
                </span>
                <button
                  ref={copyButtonRef}
                  type="button"
                  className={`${styles.copyButton} ${
                    copied ? styles.copyButtonSuccess : ""
                  }`}
                  onClick={handleCopy}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  <span>{copied ? "Copiado" : "Copiar código"}</span>
                </button>
              </div>
              <p className={styles.codeValue}>{activeCode}</p>
            </div>

            <div className={styles.securityCallout}>
              <span className={styles.calloutIcon} aria-hidden="true">
                <AlertTriangleIcon />
              </span>
              <div className={styles.calloutBody}>
                <p className={styles.calloutTitle}>
                  Guarde este código com segurança
                </p>
                <p className={styles.calloutText}>
                  Ao clicar em <strong>Acessar o sistema</strong>, seu código
                  anterior deixará de ser válido e{" "}
                  <strong>somente você saberá este novo código</strong>. Anote-o
                  em um lugar seguro.
                </p>
              </div>
            </div>

            <div className={styles.confirmBox}>
              <div className={styles.checkboxRow}>
                <input
                  ref={confirmCheckboxRef}
                  id={confirmCheckboxId}
                  type="checkbox"
                  checked={confirmed}
                  disabled={isActivating || isRefreshingCode}
                  aria-invalid={confirmError ? "true" : "false"}
                  aria-describedby={
                    [
                      confirmError ? confirmErrorId : "",
                      cancelGuardNotice ? guardNoticeId : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  className={styles.checkbox}
                  onChange={(event) => {
                    setConfirmed(event.currentTarget.checked);
                    if (event.currentTarget.checked) {
                      setConfirmError("");
                      onClearCancelGuard();
                    }
                  }}
                />
                <label
                  htmlFor={confirmCheckboxId}
                  className={styles.checkboxLabel}
                >
                  Confirmo que copiei ou anotei meu novo código de acesso.
                </label>
              </div>

              {confirmError && (
                <div id={confirmErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{confirmError}</span>
                </div>
              )}

              {commitError && (
                <div className={styles.formBannerError} role="alert">
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span className={styles.bannerErrorText}>{commitError}</span>
                  <button
                    type="button"
                    className={styles.refreshCodeButton}
                    disabled={isRefreshingCode || isActivating}
                    onClick={handleRegeneratePreviewCode}
                  >
                    {isRefreshingCode ? "Gerando..." : "Gerar outro código"}
                  </button>
                </div>
              )}

              <p
                id={guardNoticeId}
                className={`${styles.guardNotice} ${
                  cancelGuardNotice ? styles.guardNoticeVisible : ""
                }`}
                aria-live="polite"
              >
                {cancelGuardNotice ||
                  "Confirme que anotou o código antes de acessar o sistema."}
              </p>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!confirmed || isActivating || isRefreshingCode}
              aria-busy={isActivating}
              onClick={handleEnterSystem}
            >
              <span>
                {isActivating ? "Ativando acesso..." : "Acessar o sistema"}
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function CredentialOnboardingModal({
  onboardingState,
  onComplete,
  onAbortLogout,
  onRetryRecovery,
}) {
  const headingId = useId();
  const stepTwoHeadingId = useId();
  const recoveryHeadingId = useId();

  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const recoveryHeadingRef = useRef(null);
  const copyButtonRef = useRef(null);
  const confirmCheckboxRef = useRef(null);

  const [step, setStep] = useState("confirm-info");
  const [cancelGuardNotice, setCancelGuardNotice] = useState("");

  const isOpen = Boolean(onboardingState);
  const mode = onboardingState?.mode || "first-access";
  const credentialId = onboardingState?.credential?.id || "";
  const recoveryCode = onboardingState?.generatedCode || "";
  const recoveryError = onboardingState?.recoveryError || "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!isOpen) {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    window.requestAnimationFrame(() => {
      if (mode === "first-access") {
        nameInputRef.current?.focus();
      } else if (recoveryCode) {
        copyButtonRef.current?.focus();
      } else {
        recoveryHeadingRef.current?.focus();
      }
    });
  }, [isOpen, mode, credentialId, recoveryCode, recoveryError]);

  const handleCancel = (event) => {
    event.preventDefault();
    setCancelGuardNotice(
      mode === "first-access" && step === "confirm-info"
        ? "Confirme seus dados de primeiro acesso ou clique em Sair para trocar de conta."
        : "Copie seu novo código de credencial e marque a confirmação antes de prosseguir."
    );

    if (mode === "first-access" && step === "confirm-info") {
      nameInputRef.current?.focus();
    } else if (confirmCheckboxRef.current) {
      confirmCheckboxRef.current.focus();
    }
  };

  const handleComplete = (targetCredential) => {
    setStep("confirm-info");
    setCancelGuardNotice("");
    dialogRef.current?.close("done");
    onComplete?.(targetCredential);
  };

  const handleAbort = () => {
    setStep("confirm-info");
    setCancelGuardNotice("");
    onAbortLogout?.();
  };

  const activeTitleId =
    mode === "recovery"
      ? recoveryHeadingId
      : step === "confirm-info"
        ? headingId
        : stepTwoHeadingId;

  const activationTokenKey = onboardingState?.activationToken || "";

  const instanceKey = isOpen
    ? `${mode}:${credentialId}:${recoveryCode}:${activationTokenKey}:${recoveryError}`
    : "closed";

  return (
    <dialog
      ref={dialogRef}
      closedby="none"
      aria-labelledby={activeTitleId}
      className={styles.dialog}
      onCancel={handleCancel}
    >
      {isOpen && (
        <CredentialOnboardingContent
          key={instanceKey}
          onboardingState={onboardingState}
          headingId={headingId}
          stepTwoHeadingId={stepTwoHeadingId}
          recoveryHeadingId={recoveryHeadingId}
          nameInputRef={nameInputRef}
          recoveryHeadingRef={recoveryHeadingRef}
          copyButtonRef={copyButtonRef}
          confirmCheckboxRef={confirmCheckboxRef}
          step={mode === "recovery" ? "reveal-code" : step}
          onStepChange={setStep}
          cancelGuardNotice={cancelGuardNotice}
          onClearCancelGuard={() => setCancelGuardNotice("")}
          onComplete={handleComplete}
          onAbortLogout={handleAbort}
          onRetryRecovery={onRetryRecovery}
        />
      )}
    </dialog>
  );
}
