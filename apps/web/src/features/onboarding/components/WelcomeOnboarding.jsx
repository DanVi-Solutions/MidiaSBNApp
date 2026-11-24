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
  DownloadIcon,
  ShareUpIcon,
  SmartphoneIcon,
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
import {
  INSTALL_OUTCOME,
  INSTALL_PLATFORM,
  canPromptInstall,
  detectInstallPlatform,
  isRunningAsInstalledApp,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/installPrompt";
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

function stepsFor(user, { platform, isInstalled }) {
  const role = resolveRoleCode(user);
  const servesInSchedules = !isAdmin(user) && role !== ROLES.GENERAL_MANAGER;
  const shouldSuggestInstall = !isAdmin(user) && platform !== INSTALL_PLATFORM.DESKTOP && !isInstalled;
  return [
    "welcome",
    ...(servesInSchedules ? ["worship", "availability"] : []),
    ...(shouldSuggestInstall ? ["install"] : []),
    ...(isAdmin(user) ? [] : ["notifications"]),
  ];
}

function useCanPromptInstall() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  useEffect(() => subscribeInstallPrompt(() => setCanPrompt(canPromptInstall())), []);
  return canPrompt;
}

const IOS_STEPS = [
  <>
    Toque em <strong>Compartilhar</strong> <ShareUpIcon className={styles.inlineIcon} /> na barra do Safari.
  </>,
  <>
    Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.
  </>,
  <>
    Toque em <strong>Adicionar</strong>. O ícone da Mídia aparece junto com os seus apps.
  </>,
];

const ANDROID_STEPS = [
  <>
    Toque no menu <strong>⋮</strong> no canto superior do Chrome.
  </>,
  <>
    Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
  </>,
  <>Confirme. O ícone da Mídia aparece junto com os seus apps.</>,
];

export function WelcomeOnboarding({ user, onFinish }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const [platform] = useState(detectInstallPlatform);
  const [isInstalled] = useState(isRunningAsInstalledApp);
  const steps = stepsFor(user, { platform, isInstalled });
  const canPromptHere = useCanPromptInstall();
  const [installOutcome, setInstallOutcome] = useState(null);

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

  const installApp = async () => {
    setIsSaving(true);
    const outcome = await promptInstall();
    setIsSaving(false);
    setInstallOutcome(outcome);
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

        {step === "install" && (
          <section className={styles.panel}>
            <span className={styles.panelBadge} aria-hidden="true">
              <SmartphoneIcon />
            </span>
            <h1 id={titleId} className={styles.panelTitle}>
              {platform === INSTALL_PLATFORM.IOS
                ? "Coloque o app na sua Tela de Início"
                : "Instale o app no seu celular"}
            </h1>
            <p className={styles.panelText}>
              Assim você abre as escalas com um toque, como qualquer aplicativo, sem precisar procurar o site.
              {platform === INSTALL_PLATFORM.IOS &&
                " No iPhone, os avisos no celular só funcionam pelo app da Tela de Início."}
            </p>

            {installOutcome === INSTALL_OUTCOME.ACCEPTED ? (
              <p className={`${styles.status} ${styles.statusOk}`} role="status">
                <CheckIcon /> App instalado. Ele já aparece junto com os seus apps.
              </p>
            ) : platform === INSTALL_PLATFORM.ANDROID && canPromptHere ? null : (
              <ol className={styles.installSteps}>
                {(platform === INSTALL_PLATFORM.IOS ? IOS_STEPS : ANDROID_STEPS).map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ol>
            )}

            {installOutcome === INSTALL_OUTCOME.DISMISSED && (
              <p className={`${styles.status} ${styles.statusWarn}`} role="status">
                <AlertCircleIcon />
                <span>Tudo bem. Você pode instalar depois pelos passos acima.</span>
              </p>
            )}

            {platform === INSTALL_PLATFORM.IOS && (
              <p className={styles.panelNote}>
                Depois, abra o app pela Tela de Início, entre com o seu código e ative os avisos em{" "}
                <strong>Meu perfil</strong>.
              </p>
            )}
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

          {step === "install" &&
            (platform === INSTALL_PLATFORM.ANDROID && canPromptHere && !installOutcome ? (
              <>
                <button type="button" disabled={isSaving} className={styles.secondaryButton} onClick={goNext}>
                  Agora não
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className={styles.primaryButton}
                  onClick={installApp}
                >
                  <DownloadIcon />
                  <span>{isSaving ? "Abrindo..." : "Instalar app"}</span>
                </button>
              </>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={goNext}>
                <span>{isLastStep ? "Entrar no sistema" : "Continuar"}</span>
                <ArrowRightIcon />
              </button>
            ))}

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
