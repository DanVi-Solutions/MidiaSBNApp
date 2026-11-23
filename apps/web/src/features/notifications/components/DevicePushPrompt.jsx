"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BellIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ENABLE_FAILURE,
  enableDevicePush,
  isDevicePushSupported,
} from "@/features/notifications/lib/devicePush";
import styles from "./DevicePushPrompt.module.css";

const FAILURE_MESSAGES = {
  [ENABLE_FAILURE.DENIED]:
    "As notificações foram bloqueadas. Você pode liberar depois em Meu perfil.",
  [ENABLE_FAILURE.UNAVAILABLE]:
    "As notificações no dispositivo ainda não estão disponíveis. Os avisos continuam no sino.",
  [ENABLE_FAILURE.FAILED]:
    "Não foi possível ativar as notificações agora. Tente de novo em Meu perfil.",
};

export function DevicePushPrompt({ onClose }) {
  const toast = useToast();
  const titleId = useId();
  const dialogRef = useRef(null);
  const [isEnabling, setIsEnabling] = useState(false);
  const canEnableHere = isDevicePushSupported();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const finish = () => {
    dialogRef.current?.close();
    onClose();
  };

  const handleEnable = async () => {
    setIsEnabling(true);
    const result = await enableDevicePush();
    setIsEnabling(false);

    if (result.ok) {
      toast.success("Notificações ativadas neste dispositivo.");
    } else if (FAILURE_MESSAGES[result.reason]) {
      toast.error(FAILURE_MESSAGES[result.reason]);
    }
    finish();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!isEnabling) finish();
      }}
    >
      <div className={styles.content}>
        <span className={styles.badge} aria-hidden="true">
          <BellIcon />
        </span>
        <h2 id={titleId} className={styles.title}>
          Receber avisos no seu dispositivo?
        </h2>
        <p className={styles.text}>
          Avisamos no celular ou no computador quando você entrar em uma escala,
          quando pedirem para você substituir alguém e um dia antes de cada
          escala.
        </p>

        {!canEnableHere && (
          <p className={styles.installHint}>
            No iPhone ou iPad, toque em <strong>Compartilhar</strong> e depois em{" "}
            <strong>Adicionar à Tela de Início</strong>. Abra o app por lá e
            ative as notificações em <strong>Meu perfil</strong>.
          </p>
        )}
      </div>

      <div className={styles.actions}>
        {canEnableHere ? (
          <>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={isEnabling}
              onClick={finish}
            >
              Agora não
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isEnabling}
              aria-busy={isEnabling}
              onClick={handleEnable}
            >
              {isEnabling ? "Ativando..." : "Ativar notificações"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={finish}
          >
            Entendi
          </button>
        )}
      </div>
    </dialog>
  );
}
