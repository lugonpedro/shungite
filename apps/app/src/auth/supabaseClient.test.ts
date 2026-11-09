import { describe, expect, it } from "vitest";
import { AUTH_OPTIONS } from "./supabaseClient";

describe("Supabase auth options", () => {
  it("persiste a sessão para o PWA continuar conectado ao reabrir", () => {
    expect(AUTH_OPTIONS.auth.persistSession).toBe(true);
    expect(AUTH_OPTIONS.auth.autoRefreshToken).toBe(true);
  });
});
