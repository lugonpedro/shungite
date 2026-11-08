# TaskManager

Todo list local-first inspirado no Obsidian: seus todos viram arquivos `.md` numa pasta do seu computador, com sync online entre Mac e iPhone.

## Features iniciais (v1)

1. **Todo list** — criar, concluir e organizar tarefas.
2. **Todos em Markdown** — cada lista é salva como arquivo `.md` (checkboxes GFM `- [ ]`) numa pasta local (vault).
3. **Sync online** — sincronização entre dispositivos via Supabase, sem abrir mão dos arquivos locais.

## Stack (proposta)

- **App**: Tauri 2 (macOS, depois iOS) + React + TypeScript + Vite
- **Core**: pacote TypeScript puro (modelo, parser/serializer Markdown, sync engine)
- **Backend**: Supabase (Postgres + Auth + Realtime)
- **Monorepo**: pnpm workspaces

> Decisões detalhadas ficam em `docs/adr/` e o vocabulário do domínio em `GLOSSARY.md`.
