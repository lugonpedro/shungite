import { useState, type FormEvent } from "react";
import { supabase } from "./supabaseClient";
import { useSession } from "./useSession";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "verifying"; email: string }
  | { kind: "error"; message: string };

/**
 * Magic-link sign-in and sign-out. Sync is optional: when Supabase is not
 * configured, or nobody is signed in, the rest of the app keeps working with
 * local data only.
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

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setStatus({ kind: "sending" });
    const { error } = await auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    setStatus({ kind: "sent", email: trimmedEmail });
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status.kind !== "sent") return;

    const token = code.trim();
    if (!token) return;

    const { email: pendingEmail } = status;
    setStatus({ kind: "verifying", email: pendingEmail });
    const { error } = await auth.verifyOtp({
      email: pendingEmail,
      token,
      type: "email",
    });

    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }

    setCode("");
    setStatus({ kind: "idle" });
  }

  const sentEmail =
    status.kind === "sent" || status.kind === "verifying" ? status.email : null;

  return (
    <div className="auth">
      {sentEmail ? (
        <form onSubmit={(event) => void verifyCode(event)}>
          <p>
            Enviamos um link e um código para <strong>{sentEmail}</strong>. Abra o link no navegador ou
            cole o código aqui.
          </p>
          <label>
            Código do e-mail
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="submit" disabled={status.kind === "verifying"}>
            {status.kind === "verifying" ? "Entrando…" : "Entrar"}
          </button>
          <button type="button" onClick={() => setStatus({ kind: "idle" })}>
            Usar outro e-mail
          </button>
        </form>
      ) : (
        <form onSubmit={(event) => void sendMagicLink(event)}>
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
            {status.kind === "sending" ? "Enviando…" : "Entrar com magic link"}
          </button>
          <span>Sem conta? Continue sem entrar: tudo fica só neste dispositivo.</span>
        </form>
      )}

      {status.kind === "error" ? <p role="alert">Não foi possível entrar: {status.message}</p> : null}
    </div>
  );
}
