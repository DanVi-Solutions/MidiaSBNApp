"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from "@/components/ui/icons";
import {
  fetchSystemConfig,
  updateSystemConfig,
} from "@/features/settings/services/systemService";
import { isDeveloper } from "@/lib/roles";
import styles from "./SettingsView.module.css";

function formatUpdatedAt(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function SettingsView() {
  const router = useRouter();
  const toast = useToast();
  const {
    currentUser,
    maintenanceMode,
    setMaintenanceMode,
    broadcastWorkspaceSync,
  } = usePrivateWorkspace();

  const maintenanceHeadingId = useId();
  const maintenanceSwitchId = useId();
  const maintenanceHintId = useId();
  const announceTimerRef = useRef(null);

  const userIsDeveloper = isDeveloper(currentUser);
  const [draftMaintenanceMode, setDraftMaintenanceMode] =
    useState(maintenanceMode);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  useEffect(() => {
    if (currentUser?.id && !userIsDeveloper) {
      router.replace("/schedule");
    }
  }, [currentUser?.id, router, userIsDeveloper]);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userIsDeveloper) return undefined;
    let active = true;

    fetchSystemConfig().then((result) => {
      if (!active) return;
      setIsLoading(false);

      if (result.ok && result.data) {
        const persistedValue = Boolean(result.data.maintenanceMode);
        setMaintenanceMode(persistedValue);
        setDraftMaintenanceMode(persistedValue);
        setUpdatedAt(result.data.updatedAt ?? null);
        setLoadError("");
      } else {
        setLoadError(
          result.error || "Não foi possível carregar as configurações do sistema."
        );
      }
    });

    return () => {
      active = false;
    };
  }, [setMaintenanceMode, userIsDeveloper]);

  const announce = (message) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    setLiveAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setLiveAnnouncement(message);
    }, 180);
  };

  const hasUnsavedChanges =
    !isLoading && draftMaintenanceMode !== maintenanceMode;

  const handleToggleMaintenance = (event) => {
    if (isLoading || isSaving) return;
    setDraftMaintenanceMode(event.currentTarget.checked);
    setLoadError("");
  };

  const handleDiscard = () => {
    if (isLoading || isSaving) return;
    setDraftMaintenanceMode(maintenanceMode);
    setLoadError("");
  };

  const handleSave = async () => {
    if (isLoading || isSaving || !hasUnsavedChanges) return;

    const targetValue = draftMaintenanceMode;
    setIsSaving(true);
    setLoadError("");

    const result = await updateSystemConfig({ maintenanceMode: targetValue });
    setIsSaving(false);

    if (!result.ok || !result.data) {
      const errMsg =
        result.error || "Não foi possível atualizar o modo de manutenção.";
      setLoadError(errMsg);
      toast.error(errMsg);
      announce(errMsg);
      return;
    }

    const savedValue = Boolean(result.data.maintenanceMode);
    setMaintenanceMode(savedValue);
    setDraftMaintenanceMode(savedValue);
    setUpdatedAt(result.data.updatedAt ?? null);
    broadcastWorkspaceSync();

    const successMsg = savedValue
      ? "Modo de manutenção ativado. Novos logins foram bloqueados."
      : "Modo de manutenção desativado. O acesso ao sistema foi liberado.";
    announce(successMsg);
    toast.success(successMsg);
  };

  if (!userIsDeveloper) {
    return null;
  }

  const formattedUpdatedAt = formatUpdatedAt(updatedAt);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>DESENVOLVEDOR</p>
          <h1 className={styles.pageTitle}>Configurações</h1>
          <p className={styles.pageSubtitle}>
            Gerencie opções globais do sistema restritas à equipe de
            desenvolvimento.
          </p>
        </div>

        <span
          className={`${styles.statusBadge} ${
            maintenanceMode ? styles.statusBadgeWarning : styles.statusBadgeOnline
          }`}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          {isLoading
            ? "Verificando estado..."
            : maintenanceMode
              ? "Manutenção ativa"
              : "Sistema online"}
        </span>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <section
        className={styles.card}
        aria-labelledby={maintenanceHeadingId}
      >
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.cardEyebrow}>CONTROLE DE ACESSO</p>
            <h2 id={maintenanceHeadingId} className={styles.cardTitle}>
              Modo de manutenção
            </h2>
            <p className={styles.cardSubtitle}>
              Bloqueia o login e o uso da plataforma para todos os demais
              usuários enquanto ajustes ou manutenções estiverem em andamento.
            </p>
          </div>
          <WrenchIcon className={styles.cardCornerIcon} />
        </div>

        {loadError && (
          <div className={styles.errorBanner} role="alert">
            <AlertCircleIcon className={styles.errorIcon} />
            <span>{loadError}</span>
          </div>
        )}

        <div
          className={`${styles.switchCard} ${
            draftMaintenanceMode ? styles.switchCardActive : ""
          }`}
        >
          <div className={styles.switchHeaderRow}>
            <div className={styles.switchLead}>
              <label
                htmlFor={maintenanceSwitchId}
                className={styles.switchTitle}
              >
                Ativar modo de manutenção
              </label>
              <p id={maintenanceHintId} className={styles.switchHint}>
                Quando ligado e salvo, nenhum usuário (incluindo
                administradores) consegue fazer login ou permanecer autenticado
                até que esta opção seja desligada.
              </p>
            </div>

            <input
              id={maintenanceSwitchId}
              type="checkbox"
              role="switch"
              name="maintenanceMode"
              checked={draftMaintenanceMode}
              disabled={isLoading || isSaving}
              aria-describedby={maintenanceHintId}
              className={styles.switchInput}
              onChange={handleToggleMaintenance}
            />
          </div>

          {draftMaintenanceMode ? (
            <div className={styles.activeCallout} role="status">
              <AlertTriangleIcon className={styles.activeCalloutIcon} />
              <div className={styles.activeCalloutBody}>
                <p className={styles.activeCalloutTitle}>
                  Acesso restrito a desenvolvedores
                </p>
                <p className={styles.activeCalloutText}>
                  Somente contas com papel de desenvolvedor conseguem entrar e
                  operar o sistema enquanto o modo de manutenção permanecer
                  ligado.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.onlineNote}>
              <ShieldCheckIcon className={styles.onlineNoteIcon} />
              <span>
                O sistema está operando normalmente e aceitando logins de todos
                os usuários autorizados.
              </span>
            </div>
          )}
        </div>

        {hasUnsavedChanges && (
          <div className={styles.unsavedNotice} role="status">
            <AlertTriangleIcon className={styles.errorIcon} />
            <span>
              Alteração pendente:{" "}
              {draftMaintenanceMode
                ? "o sistema entrará em modo de manutenção"
                : "o acesso ao sistema será liberado"}{" "}
              após clicar em &ldquo;Salvar alterações&rdquo;.
            </span>
          </div>
        )}

        <div className={styles.cardFooter}>
          <div>
            {formattedUpdatedAt && (
              <p className={styles.metaText}>
                Última atualização: {formattedUpdatedAt}
              </p>
            )}
          </div>

          <div className={styles.footerActions}>
            {hasUnsavedChanges && (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isSaving}
                onClick={handleDiscard}
              >
                Descartar
              </button>
            )}
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isLoading || isSaving || !hasUnsavedChanges}
              aria-busy={isSaving}
              onClick={handleSave}
            >
              <CheckIcon />
              <span>{isSaving ? "Salvando..." : "Salvar alterações"}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
