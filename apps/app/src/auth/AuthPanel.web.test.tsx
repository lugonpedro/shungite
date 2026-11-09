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

// The web build is the iOS PWA: e-mail → 6-digit code → session (ADR 0002).
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

  it("entra com e-mail e depois com o código de 6 dígitos", async () => {
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

    const codeInput = await screen.findByLabelText("Código de 6 dígitos");
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

  it("mantém o magic link como opção secundária", async () => {
    render(<AuthPanel />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "pessoa@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByText(/magic link/i)).not.toBeNull();
    expect(screen.queryByLabelText("Código de 6 dígitos")).not.toBeNull();
  });
});
