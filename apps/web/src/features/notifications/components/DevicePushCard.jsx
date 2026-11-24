"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { BellIcon, CheckIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/ToastProvider";
import {
  DEVICE_PUSH_STATE,
  ENABLE_FAILURE,
  disableDevicePush,
  enableDevicePush,
  readDevicePushState,
} from "@/features/notifications/lib/devicePush";
import styles from "./DevicePushCard.module.css";

const STATE_TEXT = {
  [DEVICE_PUSH_STATE.ON]: {
    label: "Ativas neste dispositivo",
    help: "Você recebe aqui os avisos das suas escalas, substituições e lembretes.",
  },
  [DEVICE_PUSH_STATE.OFF]: {
    label: "Desativadas neste dispositivo",
    help: "Ative para receber os avisos mesmo com o sistema fechado. O navegador vai pedir sua permissão.",
  },
  [DEVICE_PUSH_STATE.BLOCKED]: {
    label: "Bloqueadas pelo navegador",
    help: "Libere as notificações nas configurações do site (ícone ao lado do endereço) e recarregue a página.",
  },
  [DEVICE_PUSH_STATE.NEEDS_INSTALL]: {
    label: "Disponível pelo app instalado",
    help: "No iPhone ou iPad, toque em Compartilhar → Adicionar à Tela de Início, abra o app por lá e ative aqui.",
  },
  [DEVICE_PUSH_STATE.UNSUPPORTED]: {
    label: "Não suportadas neste navegador",
    help: "Use um navegador atualizado (Chrome, Edge, Firefox ou Safari) para receber avisos no dispositivo.",
  },
  [DEVICE_PUSH_STATE.UNAVAILABLE]: {
    label: "Indisponíveis no momento",
    help: "As notificações no dispositivo ainda não foram configuradas. Os avisos continuam no sino.",
  },
};

const ENABLE_FAILURE_TEXT = {
  [ENABLE_FAILURE.DENIED]:
    "Permissão negada. Libere as notificações nas configurações do site.",
  [ENABLE_FAILURE.UNAVAILABLE]:
    "As notificações no dispositivo ainda não estão disponíveis.",
  [ENABLE_FAILURE.FAILED]: "Não foi possível ativar as notificações agora.",
};

export function DevicePushCard() {
  const toast = useToast();
  const headingId = useId();
  const [state, setState] = useState(null);
  const [busyAction, setBusyAction] = useState("");

  const refreshState = useCallback(async () => {
    setState(await readDevicePushState());
  }, []);

  useEffect(() => {
    const initialRead = window.setTimeout(refreshState, 0);
    return () => window.clearTimeout(initialRead);
  }, [refreshState]);

  const runAction = async (name, action) => {
    setBusyAction(name);
    await action();
    setBusyAction("");
    await refreshState();
  };

  const handleEnable = () =>
    runAction("enable", async () => {
      const result = await enableDevicePush();
      if (result.ok) {
        toast.success("Notificações ativadas neste dispositivo.");
      } else if (ENABLE_FAILURE_TEXT[result.reason]) {
        toast.error(result.error || ENABLE_FAILURE_TEXT[result.reason]);
      }
    });

  const handleDisable = () =>
    runAction("disable", async () => {
      const result = await disableDevicePush();
      if (result.ok) toast.success("Notificações desativadas neste dispositivo.");
      else toast.error(result.error || "Não foi possível desativar agora.");
    });

  const text = state ? STATE_TEXT[state] : null;
  const isBusy = Boolean(busyAction);

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>NOTIFICAÇÕES</p>
          <h2 id={headingId} className={styles.title}>
            Avisos no dispositivo
          </h2>
          <p className={styles.subtitle}>
            Receba no celular ou no computador os avisos que aparecem no sino.
            A permissão vale para este navegador.
          </p>
        </div>
        <BellIcon className={styles.cornerIcon} />
      </div>

      <div className={styles.statusRow} aria-live="polite">
        {text ? (
          <>
            <span
              className={`${styles.statusPill} ${
                state === DEVICE_PUSH_STATE.ON ? styles.statusOn : ""
              }`}
            >
              {state === DEVICE_PUSH_STATE.ON && <CheckIcon />}
              {text.label}
            </span>
            <p className={styles.help}>{text.help}</p>
          </>
        ) : (
          <p className={styles.help}>Verificando este dispositivo...</p>
        )}
      </div>

      {(state === DEVICE_PUSH_STATE.OFF || state === DEVICE_PUSH_STATE.ON) && (
        <div className={styles.actions}>
          {state === DEVICE_PUSH_STATE.OFF ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isBusy}
              aria-busy={busyAction === "enable"}
              onClick={handleEnable}
            >
              <BellIcon />
              <span>
                {busyAction === "enable" ? "Ativando..." : "Ativar notificações"}
              </span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isBusy}
                aria-busy={busyAction === "disable"}
                onClick={handleDisable}
              >
                <span>
                  {busyAction === "disable" ? "Desativando..." : "Desativar"}
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
