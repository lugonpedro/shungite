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

### App iOS (simulador)

O iPhone é um **Satellite**: o Vault vive no sandbox do app
(`Library/Application Support/com.lugonpedro.taskmanager/vault`, criado no
primeiro launch) e é alimentado só pelo Sync. O dispositivo nunca vira Home.

Pré-requisitos, além dos do app desktop:

- Xcode completo (não só as Command Line Tools) e o simulador de um iPhone.
- Alvos Rust de iOS:
  `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`
- [CocoaPods](https://cocoapods.org/) (`brew install cocoapods`).

Se `xcode-select -p` aponta para as Command Line Tools, prefixe os comandos de
Xcode com `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (não é
preciso rodar `xcode-select -s`). O projeto Xcode nativo é gerado em
`src-tauri/gen/` (ignorado pelo git); para recriá-lo:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  pnpm --filter @taskmanager/app tauri ios init
```

Rodar em modo de desenvolvimento (abre o Vite, compila e instala no simulador):

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  pnpm --filter @taskmanager/app tauri ios dev "iPhone 17"
```

Ou gerar o bundle e instalar pelo `simctl`:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  pnpm --filter @taskmanager/app tauri ios build --debug -t aarch64-sim

xcrun simctl boot "iPhone 17"
xcrun simctl install "iPhone 17" \
  apps/app/src-tauri/gen/apple/build/arm64-sim/TaskManager.app
xcrun simctl launch "iPhone 17" com.lugonpedro.taskmanager
xcrun simctl io "iPhone 17" screenshot shot.png
```

Para o login, o mesmo magic link do desktop: no simulador, use o código de 6
dígitos do e-mail (o deep link `tauri://localhost` não é necessário). Com
`supabase start`, pegue o código no Mailpit em `http://127.0.0.1:54324`. A URL
do Supabase local deve ser `http://127.0.0.1:54321`: o simulador compartilha a
rede do Mac.

### Supabase local

```bash
supabase start
supabase db reset   # aplica as migrations do zero + seed
supabase test db    # testes de RLS e timestamps (pgTAP)
```

Inicia os serviços locais do Supabase (Postgres, Auth, Realtime etc.) usando a configuração em `supabase/`. Requer a Supabase CLI instalada.

As migrations ficam em `supabase/migrations/` (tabelas `tasks`, `notes` e `devices`, todas com RLS por `user_id`).

### Login no app (magic link)

O Sync é opcional: sem as variáveis abaixo o app roda só com dados locais e o painel de conta mostra "Sync desligado".

```bash
cp apps/app/.env.example apps/app/.env.local
# preencha VITE_SUPABASE_ANON_KEY com a ANON_KEY de `supabase status`
pnpm app:web   # ou pnpm app:dev
```

O login é por magic link: digite o e-mail, abra o link recebido (ou use o código de 6 dígitos mostrado no e-mail) e o Sync liga. No Supabase local os e-mails não saem de verdade: aparecem no Mailpit em `http://127.0.0.1:54324`. O botão "Sair" encerra a sessão e o app volta a funcionar só localmente.

## Documentação

Decisões detalhadas ficam em `docs/adr/` e o vocabulário do domínio em `GLOSSARY.md`.
