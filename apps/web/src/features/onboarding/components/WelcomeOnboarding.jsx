"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  ChurchIcon,
  ChevronLeftIcon,
} from "@/components/ui/icons";
import {
  replaceMyWeeklyAvailability,
  saveMyWorshipService,
} from "@/features/availability/services/availabilityService";
import {
  ENABLE_FAILURE,
  enableDevicePush,
  isDevicePushSupported,
} from "@/features/notifications/lib/devicePush";
import { isAdmin, resolveRoleCode, ROLES } from "@/lib/roles";
import { WORSHIP_SERVICE_OPTIONS } from "@/lib/worshipServices";
import styles from "./WelcomeOnboarding.module.css";

const WEEK = [
  { code: "SUNDAY", label: "Domingo" },
  { code: "MONDAY", label: "Segunda" },
  { code: "TUESDAY", label: "Terça" },
  { code: "WEDNESDAY", label: "Quarta" },
  { code: "THURSDAY", label: "Quinta" },
  { code: "FRIDAY", label: "Sexta" },
  { code: "SATURDAY", label: "Sábado" },
];

const PERIODS = [
  { key: "morning", label: "Manhã" },
  { key: "afternoon", label: "Tarde" },
  { key: "night", label: "Noite" },
];

const EMPTY_WEEK = Object.fromEntries(
  WEEK.map(({ code }) => [code, { morning: false, afternoon: false, night: false }])
);

const PUSH_RESULT = Object.freeze({
  IDLE: "idle",
  ENABLED: "enabled",
  FAILED: "failed",
});

const firstName = (name) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

function stepsFor(user) {
  const role = resolveRoleCode(user);
  const servesInSchedules = !isAdmin(user) && role !== ROLES.GENERAL_MANAGER;
  return [
    "welcome",
    ...(servesInSchedules ? ["worship", "availability"] : []),
    ...(isAdmin(user) ? [] : ["notifications"]),
  ];
}

export function WelcomeOnboarding({ user, onFinish }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const steps = stepsFor(user);

  const [stepIndex, setStepIndex] = useState(0);
  const [worshipService, setWorshipService] = useState("");
  const [week, setWeek] = useState(EMPTY_WEEK);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [pushResult, setPushResult] = useState(PUSH_RESULT.IDLE);
  const canEnablePushHere = isDevicePushSupported();

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const hasAnyPeriod = Object.values(week).some(
    (day) => day.morning || day.afternoon || day.night
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const finish = () => {
    dialogRef.current?.close();
    onFinish();
  };

  const goNext = () => {
    setError("");
    if (isLastStep) finish();
    else setStepIndex((index) => index + 1);
  };

  const goBack = () => {
    setError("");
    setStepIndex((index) => Math.max(0, index - 1));
  };

  const saveWorship = async () => {
    setIsSaving(true);
    const result = await saveMyWorshipService(worshipService);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error || "Não foi possível salvar seu horário de culto.");
      return;
    }
    goNext();
  };

  const saveAvailability = async () => {
    setIsSaving(true);
    const days = WEEK.map(({ code }) => ({ weekday: code, ...week[code] })).filter(
      (day) => day.morning || day.afternoon || day.night
    );
    const result = await replaceMyWeeklyAvailability(days);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error || "Não foi possível salvar sua disponibilidade.");
      return;
    }
    goNext();
  };

  const askForNotifications = async () => {
    setIsSaving(true);
    const result = await enableDevicePush();
    setIsSaving(false);
    setPushResult(result.ok ? PUSH_RESULT.ENABLED : PUSH_RESULT.FAILED);
    if (!result.ok && result.reason === ENABLE_FAILURE.DENIED) {
      setError("As notificações foram bloqueadas no navegador.");
    }
  };

  const togglePeriod = (dayCode, period) =>
    setWeek((current) => ({
      ...current,
      [dayCode]: { ...current[dayCode], [period]: !current[dayCode][period] },
    }));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.splash}
      onCancel={(event) => event.preventDefault()}
    >
      <div className={styles.stage}>
        {step === "welcome" && (
          <section className={styles.welcome}>
            <Image
              src="/brand/logo-mark.svg"
              alt=""
              aria-hidden="true"
              width={88}
              height={88}
              priority
              className={styles.welcomeMark}
            />
            <p className={styles.welcomeEyebrow}>MÍDIA SOBRENATURAL</p>
            <h1 id={titleId} className={styles.welcomeTitle}>
              Boas-vindas, {firstName(user?.name)}!
            </h1>
            <blockquote className={styles.verse}>
              <p>
                “Cada um exerça o dom que recebeu para servir os outros,
                administrando fielmente a graça de Deus em suas múltiplas
                formas.”
              </p>
              <cite>1 Pedro 4:10</cite>
            </blockquote>
            <p className={styles.welcomeText}>
              {steps.length > 1
                ? "Vamos deixar tudo pronto para você servir com a equipe. Leva menos de um minuto."
                : "Que bom ter você com a gente. Seu acesso já está pronto."}
            </p>
          </section>
        )}

        {step === "worship" && (
          <section className={styles.panel}>
            <span className={styles.panelBadge} aria-hidden="true">
              <ChurchIcon />
            </span>
            <h1 id={titleId} className={styles.panelTitle}>
              Qual é o seu culto de domingo?
            </h1>
            <p className={styles.panelText}>
              Assim evitamos escalar você no horário em que você participa do
              culto.
            </p>
            <div role="radiogroup" aria-labelledby={titleId} className={styles.choiceList}>
              {WORSHIP_SERVICE_OPTIONS.map((option) => {
                const isSelected = worshipService === option.value;
                return (
                  <label
                    key={option.value}
                    className={`${styles.choice} ${isSelected ? styles.choiceSelected : ""}`}
                  >
                    <input
                      type="radio"
                      name="onboardingWorship"
                      value={option.value}
                      checked={isSelected}
                      className="visually-hidden"
                      onChange={() => setWorshipService(option.value)}
                    />
                    <span className={styles.choiceDay}>Domingo</span>
                    <span className={styles.choiceTime}>{option.label}</span>
                    {isSelected && <CheckIcon className={styles.choiceCheck} />}
                  </label>
                );
              })}
            </div>
          </section>
        )}

        {step === "availability" && (
          <section className={styles.panel}>
            <h1 id={titleId} className={styles.panelTitle}>
              Quando você pode servir?
            </h1>
            <p className={styles.panelText}>
              Marque os períodos em que você costuma estar disponível. Você
              pode mudar isso quando quiser em Disponibilidade.
            </p>
            <div className={styles.weekGrid} role="group" aria-labelledby={titleId}>
              {WEEK.map((day) => (
                <div key={day.code} className={styles.weekRow}>
                  <span className={styles.weekDay}>{day.label}</span>
                  <div className={styles.periods}>
                    {PERIODS.map((period) => {
                      const isOn = week[day.code][period.key];
                      return (
                        <button
                          key={period.key}
                          type="button"
                          aria-pressed={isOn}
                          aria-label={`${day.label}, ${period.label}`}
                          className={`${styles.periodChip} ${isOn ? styles.periodChipOn : ""}`}
                          onClick={() => togglePeriod(day.code, period.key)}
                        >
                          {isOn && <CheckIcon />}
                          <span>{period.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === "notifications" && (
          <section className={styles.panel}>
            <span className={styles.panelBadge} aria-hidden="true">
              <BellIcon />
            </span>
            <h1 id={titleId} className={styles.panelTitle}>
              Receba os avisos no seu dispositivo
            </h1>
            <p className={styles.panelText}>
              Avisamos no celular ou no computador quando você entrar em uma
              escala, quando pedirem para você substituir alguém e um dia antes
              de cada escala. Assim você não perde nada.
            </p>

            {pushResult === PUSH_RESULT.ENABLED && (
              <p className={`${styles.status} ${styles.statusOk}`} role="status">
                <CheckIcon /> Notificações ativadas neste dispositivo.
              </p>
            )}
            {pushResult === PUSH_RESULT.FAILED && (
              <p className={`${styles.status} ${styles.statusWarn}`} role="status">
                <AlertCircleIcon />
                <span>
                  {error || "Não foi possível ativar as notificações agora."} Você
                  pode permitir depois em <strong>Meu perfil</strong>.
                </span>
              </p>
            )}
            {!canEnablePushHere && pushResult === PUSH_RESULT.IDLE && (
              <p className={`${styles.status} ${styles.statusWarn}`}>
                <AlertCircleIcon />
                <span>
                  Este navegador não permite notificações agora. No iPhone,
                  adicione o app à Tela de Início e ative em{" "}
                  <strong>Meu perfil</strong>.
                </span>
              </p>
            )}
          </section>
        )}

        {error && step !== "notifications" && (
          <p className={`${styles.status} ${styles.statusWarn}`} role="alert">
            <AlertCircleIcon />
            <span>{error}</span>
          </p>
        )}

        <div className={styles.actions}>
          {stepIndex > 0 && pushResult === PUSH_RESULT.IDLE && (
            <button
              type="button"
              disabled={isSaving}
              className={styles.backButton}
              onClick={goBack}
            >
              <ChevronLeftIcon />
              <span>Voltar</span>
            </button>
          )}

          {step === "welcome" && (
            <button type="button" className={styles.primaryButton} onClick={goNext}>
              <span>{isLastStep ? "Entrar no sistema" : "Começar"}</span>
              <ArrowRightIcon />
            </button>
          )}

          {step === "worship" && (
            <button
              type="button"
              disabled={!worshipService || isSaving}
              aria-busy={isSaving}
              className={styles.primaryButton}
              onClick={saveWorship}
            >
              <span>{isSaving ? "Salvando..." : "Continuar"}</span>
              <ArrowRightIcon />
            </button>
          )}

          {step === "availability" && (
            <button
              type="button"
              disabled={!hasAnyPeriod || isSaving}
              aria-busy={isSaving}
              className={styles.primaryButton}
              onClick={saveAvailability}
            >
              <span>{isSaving ? "Salvando..." : "Continuar"}</span>
              <ArrowRightIcon />
            </button>
          )}

          {step === "notifications" &&
            (pushResult === PUSH_RESULT.IDLE && canEnablePushHere ? (
              <>
                <button
                  type="button"
                  disabled={isSaving}
                  className={styles.secondaryButton}
                  onClick={finish}
                >
                  Agora não
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className={styles.primaryButton}
                  onClick={askForNotifications}
                >
                  <BellIcon />
                  <span>{isSaving ? "Ativando..." : "Ativar notificações"}</span>
                </button>
              </>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={finish}>
                <span>Entrar no sistema</span>
                <ArrowRightIcon />
              </button>
            ))}
        </div>

        {steps.length > 1 && (
          <ol className={styles.dots} aria-label="Etapas">
            {steps.map((name, index) => (
              <li
                key={name}
                aria-current={index === stepIndex ? "step" : undefined}
                className={`${styles.dot} ${
                  index === stepIndex ? styles.dotActive : index < stepIndex ? styles.dotDone : ""
                }`}
              >
                <span className="visually-hidden">
                  Etapa {index + 1} de {steps.length}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
