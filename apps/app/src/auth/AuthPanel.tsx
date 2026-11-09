import { useState, type FormEvent } from "react";
import { platform } from "../platform";
import { supabase } from "./supabaseClient";
import { useSession } from "./useSession";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "verifying"; email: string }
  | { kind: "error"; email: string | null; message: string };

const isWeb = platform.target === "web";
// O tamanho do código é configurado no projeto Supabase (Email OTP Length) e
// pode ser 6 ou 8 dígitos; aceitamos os dois para não depender de uma config.
const WEB_CODE_PATTERN = /^\d{6,8}$/;
const WEB_CODE_MAX_LENGTH = 8;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sign-in and sign-out. Sync is optional: when Supabase is not configured, or
 * nobody is signed in, the rest of the app keeps working with local data only.
 *
 * On the web build (the iOS PWA in ADR 0002) the primary flow is e-mail → the
 * 6-digit code sent by Supabase → session, because on iOS the magic link opens
 * in Safari, outside the installed PWA. The magic link stays available as a
 * secondary option. The Tauri build keeps the magic-link-first flow.
 */
export function AuthPanel() {
  const client = supabase;
  const { session, loading } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  if (!client) {
    return (
      <p className="auth auth--disabled">
        Sync desligado: Supabase não configurado. O app continua funcionando só neste dispositivo.
      </p>
    );
  }

  const auth = client.auth;

  if (loading) {
    return <p className="auth">Carregando conta…</p>;
  }

  if (session) {
    return (
      <div className="auth">
        <span>Conectado como {session.user.email ?? session.user.id}</span>
        <button type="button" onClick={() => void auth.signOut()}>
          Sair
        </button>
      </div>
    );
  }

  async function sendLoginEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setStatus({ kind: "sending" });
    try {
      const { error } = await auth.signInWithOtp({
        email: trimmedEmail,
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        setStatus({ kind: "error", email: null, message: error.message });
        return;
      }
    } catch (cause) {
      // A rejected request (offline, blocked storage) must not leave the panel
      // without feedback.
      setStatus({ kind: "error", email: null, message: errorMessage(cause) });
      return;
    }

    setStatus({ kind: "sent", email: trimmedEmail });
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind !== "sent") return;

    const token = code.trim();
    if (token === "" || (isWeb && !WEB_CODE_PATTERN.test(token))) return;

    const { email: pendingEmail } = status;
    setStatus({ kind: "verifying", email: pendingEmail });

    try {
      const { error } = await auth.verifyOtp({
        email: pendingEmail,
        token,
        type: "email",
      });

      if (error) {
        // Keep the code step and the e-mail on screen: the user retries with
        // the right code instead of being silently sent back to the e-mail form.
        setStatus({ kind: "error", email: pendingEmail, message: error.message });
        return;
      }
    } catch (cause) {
      setStatus({ kind: "error", email: pendingEmail, message: errorMessage(cause) });
      return;
    }

    setCode("");
    setStatus({ kind: "idle" });
  }

  const sentEmail =
    status.kind === "sent" || status.kind === "verifying" || status.kind === "error"
      ? status.email
      : null;
  const verifying = status.kind === "verifying";
  const codeIsValid = !isWeb || WEB_CODE_PATTERN.test(code.trim());

  return (
    <div className="auth">
      {status.kind === "error" ? (
        <p role="alert">Não foi possível entrar: {status.message}</p>
      ) : null}

      {sentEmail ? (
        <form onSubmit={(event) => void verifyCode(event)}>
          {isWeb ? (
            <p>
              Enviamos um código para <strong>{sentEmail}</strong>.
            </p>
          ) : (
            <p>
              Enviamos um link e um código para <strong>{sentEmail}</strong>. Abra o link no navegador
              ou cole o código aqui.
            </p>
          )}
          <label>
            Código do e-mail
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={isWeb ? WEB_CODE_MAX_LENGTH : undefined}
              pattern="[0-9]*"
              value={code}
              onChange={(event) =>
                setCode(
                  isWeb
                    ? event.target.value.replace(/\D/g, "").slice(0, WEB_CODE_MAX_LENGTH)
                    : event.target.value,
                )
              }
            />
          </label>
          <button type="submit" disabled={verifying || !codeIsValid}>
            {verifying ? "Entrando…" : "Entrar"}
          </button>
          <button type="button" onClick={() => setStatus({ kind: "idle" })}>
            Usar outro e-mail
          </button>
          {isWeb && (
            <p className="auth__hint">
              O e-mail também traz um magic link, mas no iPhone ele abre no Safari, fora do PWA
              instalado. Por isso, prefira digitar o código aqui.
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={(event) => void sendLoginEmail(event)}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit" disabled={status.kind === "sending"}>
            {status.kind === "sending"
              ? "Enviando…"
              : isWeb
                ? "Enviar código"
                : "Entrar com magic link"}
          </button>
          <span>
            {isWeb
              ? "Vamos enviar um código de 6 dígitos. O e-mail também traz um magic link, que no iPhone abre no Safari."
              : "Sem conta? Continue sem entrar: tudo fica só neste dispositivo."}
          </span>
        </form>
      )}
    </div>
  );
}
