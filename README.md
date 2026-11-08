# TaskManager

Todo list local-first inspirado no Obsidian: seus todos viram arquivos `.md` numa pasta do seu computador, com sync online entre Mac e iPhone.

## Funcionalidades iniciais (v1)

1. **Todo list** — criar, concluir e organizar tarefas.
2. **Todos em Markdown** — cada lista é salva como arquivo `.md` (checkboxes GFM `- [ ]`) numa pasta local (vault).
3. **Sync online** — sincronização entre dispositivos via Supabase, sem abrir mão dos arquivos locais.

## Stack

- **App**: Tauri 2 (macOS, depois iOS) + React + TypeScript + Vite
- **Core**: pacote TypeScript puro (modelo, parser/serializer Markdown, sync engine)
- **Backend**: Supabase (Postgres + Auth + Realtime)
- **Monorepo**: pnpm workspaces

## Como rodar

### Pré-requisitos

- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/) (o projeto declara `packageManager` no `package.json`)
- [Rust via rustup](https://rustup.rs/) — necessário para compilar/rodar o app desktop (`pnpm app:dev`). No macOS com Homebrew, o binário costuma ficar em `/opt/homebrew/opt/rustup/bin` (adicione ao `PATH` se necessário).
- [Supabase CLI](https://supabase.com/docs/guides/cli) — necessário para rodar o backend local (`supabase start`).

### Instalação

```bash
pnpm install
```

### Testes e verificação de tipos

```bash
pnpm test       # roda os testes em todos os pacotes (ex.: core com Vitest)
pnpm typecheck  # checagem de tipos em todos os pacotes
```

### App desktop (Tauri)

```bash
pnpm app:dev
```

Requer Rust instalado (via `rustup`) e disponível no `PATH`. A primeira compilação do Rust pode levar alguns minutos; depois o app abre e recarrega em modo de desenvolvimento.

### Supabase local

```bash
supabase start
```

Inicia os serviços locais do Supabase (Postgres, Auth, Realtime etc.) usando a configuração em `supabase/`. Requer a Supabase CLI instalada.

## Documentação

Decisões detalhadas ficam em `docs/adr/` e o vocabulário do domínio em `GLOSSARY.md`.
