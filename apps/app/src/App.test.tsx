import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./App";

const noop = (): void => {};

function Harness({ onNavigate }: { onNavigate: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Layout
      menuOpen={menuOpen}
      onCloseMenu={() => setMenuOpen(false)}
      onNavigate={onNavigate}
      onToggleMenu={() => setMenuOpen((current) => !current)}
      screen="todo"
      syncState="off"
      vaultExplorer={<p>Vault</p>}
    >
      <p>Conteúdo</p>
    </Layout>
  );
}

function sidebar(): HTMLElement {
  const element = document.getElementById("app-sidebar");
  if (element === null) {
    throw new Error("sidebar não encontrada");
  }
  return element;
}

describe("Layout: menu hambúrguer no mobile", () => {
  afterEach(() => {
    cleanup();
  });

  it("começa fechado e abre/fecha pelo botão", () => {
    render(<Harness onNavigate={noop} />);

    const toggle = screen.getByRole("button", { name: "Abrir menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(sidebar().classList.contains("sidebar--open")).toBe(false);

    fireEvent.click(toggle);

    const close = screen.getByRole("button", { name: "Fechar menu" });
    expect(close.getAttribute("aria-expanded")).toBe("true");
    expect(sidebar().classList.contains("sidebar--open")).toBe(true);

    fireEvent.click(close);
    expect(sidebar().classList.contains("sidebar--open")).toBe(false);
  });

  it("fecha ao tocar fora do menu", () => {
    render(<Harness onNavigate={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const backdrop = document.querySelector(".sidebar__backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);

    expect(sidebar().classList.contains("sidebar--open")).toBe(false);
  });

  it("fecha ao escolher um item e mantém a navegação", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.click(screen.getByRole("button", { name: "To-Do" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(sidebar().classList.contains("sidebar--open")).toBe(false);
  });

  it("fecha com Escape", () => {
    render(<Harness onNavigate={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(sidebar().classList.contains("sidebar--open")).toBe(false);
  });
});
