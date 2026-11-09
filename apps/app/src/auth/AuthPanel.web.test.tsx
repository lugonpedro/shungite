import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPanel } from "./AuthPanel";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("./supabaseClient", () => ({
  supabase: { auth: mocks },
}));

vi.mock("./useSession", () => ({
  useSession: () => ({ session: null, loading: false }),
}));

// The web build is the iOS PWA: e-mail → code → session (ADR 0002).
vi.mock("../platform", () => ({
  platform: { target: "web" },
}));

describe("AuthPanel no build web", () => {
  beforeEach(() => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("entra com e-mail e depois com o código", async () => {
    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "  pessoa@example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

    await waitFor(() =>
      expect(mocks.signInWithOtp).toHaveBeenCalledWith({
        email: "pessoa@example.com",
        options: { emailRedirectTo: window.location.origin },
      }),
    );

    const codeInput = await screen.findByLabelText("Código do e-mail");
    const submit = screen.getByRole("button", { name: "Entrar" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Non-digits are dropped and the field stops at six digits.
    fireEvent.change(codeInput, { target: { value: "12a3456" } });
    expect((codeInput as HTMLInputElement).value).toBe("123456");
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submit);

    await waitFor(() =>
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        email: "pessoa@example.com",
        token: "123456",
        type: "email",
      }),
    );
  });

  it("aceita código de 8 dígitos, como o projeto hospedado está configurado", async () => {
    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    const codeInput = await screen.findByLabelText("Código do e-mail");

    fireEvent.change(codeInput, { target: { value: "55477611" } });
    expect((codeInput as HTMLInputElement).value).toBe("55477611");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() =>
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        email: "pessoa@example.com",
        token: "55477611",
        type: "email",
      }),
    );
  });

  it("mantém o magic link como opção secundária", async () => {
    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByText(/magic link/i)).not.toBeNull();
    expect(screen.queryByLabelText("Código do e-mail")).not.toBeNull();
  });

  it("mostra o erro do código e mantém o passo do código na tela", async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: "Token has expired or is invalid" },
    });

    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    const codeInput = await screen.findByLabelText("Código do e-mail");

    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Token has expired or is invalid");
    // The code step stays: the user can retype the right code instead of being
    // silently dropped back to the e-mail form.
    expect(screen.queryByLabelText("Código do e-mail")).not.toBeNull();
    expect(screen.queryByLabelText("E-mail")).toBeNull();
    expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("mostra um erro quando o pedido de verificação falha em vez de ficar em 'Entrando…'", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("Falha de rede"));

    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    const codeInput = await screen.findByLabelText("Código do e-mail");

    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Falha de rede");
    expect(
      (screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
