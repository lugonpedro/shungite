import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

vi.mock("../auth/AuthPanel", () => ({
  AuthPanel: () => <p>Painel de conta</p>,
}));

const noop = async (): Promise<void> => {};

describe("Settings no build web", () => {
  afterEach(() => {
    cleanup();
  });

  it("mostra só Conta e Sync, sem Vault nem Promote para pasta", () => {
    render(
      <Settings
        canChooseVault={false}
        notice="Escolha o Vault para promover"
        onChooseVault={noop}
        onUseDefaultVault={noop}
        showVault={false}
        suggestedPath={null}
        syncState="on"
        vaultPath={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Conta e Sync" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Vault" })).toBeNull();
    expect(screen.queryByText(/promover/i)).toBeNull();
    expect(screen.queryByText(/pasta/i)).toBeNull();
  });

  it("mantém o Vault no build Tauri", () => {
    render(
      <Settings
        canChooseVault
        notice={null}
        onChooseVault={noop}
        onUseDefaultVault={noop}
        showVault
        suggestedPath="/Users/pessoa/Documents/TaskManager"
        syncState="on"
        vaultPath="/Users/pessoa/Documents/TaskManager"
      />,
    );

    expect(screen.getByRole("heading", { name: "Vault" })).not.toBeNull();
  });
});
