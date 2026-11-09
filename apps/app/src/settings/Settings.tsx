import { useState } from "react";
import { version } from "../../package.json";
import { AuthPanel } from "../auth/AuthPanel";
import { syncLabel, type SyncState } from "../use-sync";

interface SettingsProps {
  vaultPath: string | null;
  suggestedPath: string | null;
  notice: string | null;
  syncState: SyncState;
  /** When the last successful Sync round finished, for the status label. */
  lastSyncedAt?: Date | null;
  /** Message of the last failed Sync round, shown instead of swallowing it. */
  syncError?: string | null;
  /** Why the default Vault path could not be discovered, if it failed. */
  suggestedPathError?: string | null;
  /**
   * False on iOS: the Vault lives in the app sandbox and is fed only by Sync,
   * so there is no folder to suggest or pick.
   */
  canChooseVault: boolean;
  /**
   * False on the web build: the PWA is always a Satellite and has no Vault
   * folder, so Configurações shows only Conta e Sync (ADR 0002).
   */
  showVault: boolean;
  onUseDefaultVault: () => Promise<void>;
  onChooseVault: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Configurações concentrates the Vault (current folder and change) and Conta e
 * Sync (magic-link sign-in, sign-out and Sync state). The AuthPanel lives here
 * instead of over the Task list.
 */
export function Settings({
  vaultPath,
  suggestedPath,
  notice,
  syncState,
  lastSyncedAt = null,
  syncError = null,
  suggestedPathError = null,
  canChooseVault,
  showVault,
  onUseDefaultVault,
  onChooseVault,
}: SettingsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const alreadyDefault = vaultPath !== null && vaultPath === suggestedPath;

  return (
    <>
      <header className="app__header">
        <h1>Configurações</h1>
      </header>

      {/* The only notice today is the "choose a Vault to Promote" prompt, which
          does not apply to the web build (always a Satellite). */}
      {showVault && notice !== null && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="settings">
        {showVault && (
          <section aria-labelledby="vault-heading" className="settings__section">
            <h2 id="vault-heading">Vault</h2>
            <p className="settings__hint">
              {canChooseVault
                ? "A pasta do seu computador onde as Notes .md ficam."
                : "Neste dispositivo as Notes ficam no armazenamento local do app e são alimentadas só pelo Sync."}
            </p>

            {vaultPath !== null ? (
              <p className="settings__current">
                Pasta atual: <code>{vaultPath}</code>
              </p>
            ) : canChooseVault ? (
              <p className="settings__current">
                Nenhum Vault escolhido ainda. Sugestão:{" "}
                <code>~/Documents/Shungite</code>
              </p>
            ) : (
              <p className="settings__current">O Vault do app ainda não foi criado.</p>
            )}

            {suggestedPathError !== null && (
              <p className="error" role="alert">
                {suggestedPathError}
              </p>
            )}

            {canChooseVault && (
              <div className="settings__actions">
                {!alreadyDefault && (
                  <button
                    disabled={busy || suggestedPath === null}
                    onClick={() => void run(onUseDefaultVault)}
                    type="button"
                  >
                    Usar ~/Documents/Shungite
                  </button>
                )}
                <button
                  className="button--ghost"
                  disabled={busy}
                  onClick={() => void run(onChooseVault)}
                  type="button"
                >
                  Escolher outra pasta…
                </button>
              </div>
            )}

            {error !== null && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        )}

        <section
          aria-labelledby="account-heading"
          className="settings__section"
        >
          <h2 id="account-heading">Conta e Sync</h2>
          <p className="settings__sync">
            Estado do Sync:{" "}
            <strong
              className={
                syncState === "on"
                  ? "settings__sync-state settings__sync-state--on"
                  : "settings__sync-state"
              }
            >
              {syncLabel(syncState, lastSyncedAt)}
            </strong>
          </p>
          {syncError !== null && (
            <p className="error" role="alert">
              {syncError}
            </p>
          )}
          <AuthPanel />
        </section>

        <p className="settings__version">Versão {version}</p>
      </div>
    </>
  );
}
