"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  ShieldCheckIcon,
} from "@/components/ui/icons";
import { useToast } from "@/components/ui/ToastProvider";
import { CredentialOnboardingModal } from "@/features/auth/components/CredentialOnboardingModal";
import {
  fetchMyCredential,
  loginWithCredential,
  logoutSession,
  prepareActivationCode,
} from "@/features/auth/services/authService";
import { rememberWelcomeOnboarding } from "@/features/onboarding/lib/welcomeOnboarding";
import { guardAgainstAutofillUiEvents } from "@/lib/autofillEventGuard";
import { CREDENTIAL_STATUS } from "@/lib/roles";
import {
  clearStoredSession,
  getStoredSession,
  subscribeSessionChange,
} from "@/lib/sessionStorage";
import styles from "./LoginForm.module.css";

function resolveValidationMessage(input) {
  const trimmed = input.value.trim();

  if (!trimmed) {
    return "Informe seu código de credencial.";
  }

  if (trimmed.length < 4) {
    return "O código deve ter pelo menos 4 caracteres.";
  }

  return "";
}

export function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const credentialId = useId();
  const errorId = useId();
  const headingId = useId();

  const inputRef = useRef(null);
  const hasInteractedRef = useRef(false);
  const announceTimerRef = useRef(null);

  const [credential, setCredential] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [hasFallbackError, setHasFallbackError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [onboardingState, setOnboardingState] = useState(null);
  const [isCodeVisible, setIsCodeVisible] = useState(false);

  useEffect(() => guardAgainstAutofillUiEvents(), []);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  const openRecoveryFlow = useCallback(async (baseCredential) => {
    const prepResult = await prepareActivationCode();
    if (
      prepResult.ok &&
      prepResult.data?.credentialNumber &&
      prepResult.data?.activationToken
    ) {
      setOnboardingState({
        mode: "recovery",
        credential: baseCredential,
        generatedCode: prepResult.data.credentialNumber,
        activationToken: prepResult.data.activationToken,
      });
      return;
    }

    setOnboardingState({
      mode: "recovery",
      credential: baseCredential,
      recoveryError:
        prepResult.error ||
        "Não foi possível gerar seu novo código de acesso. Tente novamente.",
    });
  }, []);

  const routeByStatus = useCallback(
    async (cred, { fromExistingSession = false } = {}) => {
      if (!cred) return;

      if (cred.status === CREDENTIAL_STATUS.ACTIVE) {
        if (!fromExistingSession) {
          toast.success("Login realizado com sucesso.");
        }
        router.replace("/schedule");
        return;
      }

      if (cred.status === CREDENTIAL_STATUS.PENDING) {
        const meResult = fromExistingSession
          ? { ok: true, data: cred }
          : await fetchMyCredential();
        const fullCred = meResult.ok && meResult.data ? meResult.data : cred;
        setIsSubmitting(false);
        setOnboardingState({
          mode: "first-access",
          credential: fullCred,
        });
        return;
      }

      if (cred.status === CREDENTIAL_STATUS.RECOVERING) {
        await openRecoveryFlow(cred);
        setIsSubmitting(false);
      }
    },
    [openRecoveryFlow, router, toast]
  );

  useEffect(() => {
    const unsubscribe = subscribeSessionChange((nextSession) => {
      if (!nextSession?.accessToken) {
        setIsSubmitting(false);
        setCredential("");
        setErrorMessage("");
        setHasFallbackError(false);
        setOnboardingState(null);
      }
    });

    return () => {
      unsubscribe();
      setIsSubmitting(false);
      setCredential("");
      setOnboardingState(null);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const existing = getStoredSession();
    if (!existing?.accessToken) {
      return undefined;
    }

    fetchMyCredential().then(async (meResult) => {
      if (!active) return;
      if (!meResult.ok || !meResult.data) {
        clearStoredSession();
        return;
      }
      await routeByStatus(meResult.data, { fromExistingSession: true });
    });

    return () => {
      active = false;
    };
  }, [routeByStatus]);

  const scheduleAnnouncement = (message) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    setAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setAnnouncement(`Código de credencial: ${message}`);
    }, 350);
  };

  const applyFieldValidity = (input, { announce = false } = {}) => {
    input.setCustomValidity("");
    const customMsg = resolveValidationMessage(input);
    if (customMsg) {
      input.setCustomValidity(customMsg);
    }

    const valid = input.validity.valid && !customMsg;
    const msg = valid ? "" : customMsg || "Informe um código de credencial válido.";

    setErrorMessage(msg);
    setHasFallbackError(!valid && !CSS.supports("selector(:user-invalid)"));

    if (announce && !valid) {
      scheduleAnnouncement(msg);
    } else if (valid) {
      scheduleAnnouncement("");
    }

    return { valid, message: msg };
  };

  const handleChange = (event) => {
    const input = event.currentTarget;
    hasInteractedRef.current = true;
    setCredential(input.value);

    input.setCustomValidity("");

    // Clear errors immediately once resolved; never nag on every keystroke
    if (errorMessage) {
      const customMsg = resolveValidationMessage(input);
      if (!customMsg && input.validity.valid) {
        setErrorMessage("");
        setHasFallbackError(false);
        scheduleAnnouncement("");
      }
    }
  };

  const handleBlur = (event) => {
    if (!hasInteractedRef.current && !errorMessage) {
      return;
    }
    applyFieldValidity(event.currentTarget, { announce: true });
  };

  const handleInvalid = (event) => {
    event.preventDefault();
    hasInteractedRef.current = true;
    const { message } = applyFieldValidity(event.currentTarget, {
      announce: false,
    });
    toast.error(message || "Informe um código de credencial válido.");
    event.currentTarget.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const input = inputRef.current;
    if (!input) return;

    hasInteractedRef.current = true;
    const { valid: isValid, message } = applyFieldValidity(input, {
      announce: false,
    });

    if (!isValid) {
      toast.error(message || "Informe um código de credencial válido.");
      input.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setHasFallbackError(false);
    scheduleAnnouncement("");

    const result = await loginWithCredential(input.value);

    if (result.ok && result.data?.credential) {
      await routeByStatus(result.data.credential);
      return;
    }

    setIsSubmitting(false);
    setErrorMessage(result.error);
    setHasFallbackError(true);
    toast.error(
      result.error || "Não foi possível entrar. Verifique sua credencial."
    );
    input.focus();
  };

  const handleOnboardingComplete = () => {
    const onboardedCredential = onboardingState?.credential;
    if (onboardingState?.mode === "first-access") {
      rememberWelcomeOnboarding(onboardedCredential?.id);
    }
    setOnboardingState(null);
    toast.success("Acesso liberado! Bem-vindo ao sistema.");
    router.push("/schedule");
  };

  const handleOnboardingLogout = async () => {
    await logoutSession();
    setOnboardingState(null);
    setCredential("");
    setErrorMessage("");
    toast.success("Sessão encerrada.");
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleRetryRecovery = async () => {
    if (!onboardingState?.credential) return;
    await openRecoveryFlow(onboardingState.credential);
  };

  const hasError = Boolean(errorMessage);

  return (
    <aside className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.contentWrap}>
        <div className={styles.formCard}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>ACESSO RESTRITO</p>
            <h1 id={headingId} className={styles.title}>
              Bem-vindo à equipe.
            </h1>
            <p className={styles.subtitle}>
              Use o código fornecido pelo responsável da Mídia Sobrenatural.
            </p>
          </header>

          <form
            className={styles.form}
            method="POST"
            aria-labelledby={headingId}
            onSubmit={handleSubmit}
          >
            <div className={styles.fieldGroup}>
              <label htmlFor={credentialId} className={styles.label}>
                Código de credencial
              </label>

              <div
                className={`${styles.inputShell} ${
                  hasError ? styles.inputShellError : ""
                }`}
              >
                <span className={styles.leadingIcon} aria-hidden="true">
                  <KeyIcon />
                </span>
                <input
                  ref={inputRef}
                  id={credentialId}
                  name="credential"
                  type={isCodeVisible ? "text" : "password"}
                  value={credential}
                  placeholder="EX: SBN-7KQ4M2XPRA"
                  required
                  minLength={4}
                  maxLength={30}
                  autoComplete="current-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  aria-invalid={hasError ? "true" : "false"}
                  aria-describedby={hasError ? errorId : undefined}
                  data-error={errorId}
                  className={`${styles.input} ${
                    hasFallbackError ? "user-invalid-fallback" : ""
                  }`}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  onInvalid={handleInvalid}
                />
                <button
                  type="button"
                  className={styles.revealButton}
                  aria-label={isCodeVisible ? "Ocultar código" : "Mostrar código"}
                  aria-pressed={isCodeVisible}
                  aria-controls={credentialId}
                  onClick={() => setIsCodeVisible((visible) => !visible)}
                >
                  {isCodeVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              <span id={errorId} className="visually-hidden">
                {hasError ? errorMessage : ""}
              </span>
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              <span>
                {isSubmitting ? "Validando acesso..." : "Entrar no sistema"}
              </span>
              <ArrowRightIcon className={styles.submitArrow} />
            </button>
          </form>

          <div className={styles.securityDivider}>
            <p className={styles.securityNote}>
              <ShieldCheckIcon className={styles.securityIcon} />
              <span>Ambiente seguro · Acesso por credencial individual</span>
            </p>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <p className={styles.copyright}>© 2026 Mídia Sobrenatural</p>
      </footer>

      <div className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </div>

      <CredentialOnboardingModal
        onboardingState={onboardingState}
        onComplete={handleOnboardingComplete}
        onAbortLogout={handleOnboardingLogout}
        onRetryRecovery={handleRetryRecovery}
      />
    </aside>
  );
}
