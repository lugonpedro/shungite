# Deploy

Dois alvos de publicação, ambos a partir de `apps/app`:

| Alvo | O que roda | Onde |
| --- | --- | --- |
| Mac | App Tauri (build `tauri`, target padrão) | Máquina do usuário, `.app`/`.dmg` |
| PWA | Build web (`VITE_TARGET=web`) | Vercel + Supabase hospedado |

O PWA é sempre **Satellite**: guarda as Notes no IndexedDB do navegador e
sincroniza via Supabase (ver [ADR 0002](adr/0002-pwa-satellite-com-indexeddb.md)).
O Mac é o **Home**, dono do Vault de arquivos `.md`.

Este documento cobre o deploy; os passos de desenvolvimento local continuam no
[README](../README.md).

## 1. App Mac (Tauri)

### Pré-requisitos

- Node.js + pnpm e Rust via `rustup` no `PATH`.
- Ferramentas de linha de comando do Xcode para empacotar o `.app`/`.dmg`.

### Build

```bash
pnpm install
pnpm --filter @shungite/app tauri build
```

Esse comando roda `pnpm build` (target `tauri`, sem o service worker) e depois
compila o binário Rust. Saídas esperadas:

- `apps/app/src-tauri/target/release/bundle/macos/Shungite.app`
- `apps/app/src-tauri/target/release/bundle/dmg/Shungite_0.0.0_<arch>.dmg`

Para gerar um binário universal (Apple Silicon + Intel):

```bash
rustup target add x86_64-apple-darwin
pnpm --filter @shungite/app tauri build --target universal-apple-darwin
```

O build é **sem assinatura/notarização**. No primeiro launch o macOS bloqueia o
app; abra com botão direito → **Abrir**, ou remova a quarentena:

```bash
xattr -dr com.apple.quarantine /Applications/Shungite.app
```

### Sync no app empacotado

As variáveis `VITE_*` são embutidas no bundle em tempo de build. Para o app
desktop já sair com Sync ligado, crie `apps/app/.env.local` (ignorado pelo git)
com as credenciais do projeto Supabase hospedado **antes** do `tauri build`:

```bash
cp apps/app/.env.example apps/app/.env.local
# edite o .env.local com a URL e a anon key do projeto hospedado
```

O modelo com os placeholders (e os valores do Supabase local nos comentários)
fica em [`apps/app/.env.example`](../apps/app/.env.example). Ele não contém
nenhuma chave real; o `.env.local` é ignorado pelo git.

Sem essas variáveis o app compila e roda, mas o painel de conta mostra
"Sync desligado". O login no desktop é por magic link, com o código de 6 dígitos
como alternativa.

## 2. Supabase hospedado

### 2.1. Criar o projeto

Crie o projeto em <https://supabase.com/dashboard> (região mais próxima dos
dispositivos) e guarde a senha do banco num gerenciador de senhas. Nada de
chave ou senha entra no repositório.

No painel, em **Project Settings → API**, copie:

- **Project URL** → valor de `VITE_SUPABASE_URL`
- **anon / public key** (publishable) → valor de `VITE_SUPABASE_ANON_KEY`

A `service_role` key **não** é usada pelo app e não deve aparecer em nenhuma
variável `VITE_*` (tudo com prefixo `VITE_` vai para o bundle público).

### 2.2. Aplicar as migrations

As migrations versionadas ficam em `supabase/migrations/` (tabelas `tasks`,
`notes` e `devices`, com RLS por `user_id`). O projeto hospedado começa vazio;
aplique-as com a Supabase CLI, na raiz do repositório:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase migration list --linked   # confira o que é local e o que já está remoto
supabase db push --linked          # aplica as migrations pendentes no projeto hospedado
```

Notas:

- Na Supabase CLI 3.x, `supabase migration list` e `supabase db push` sem
  `--linked` (ou `--remote`) usam o **stack local** por padrão. O comando
  imprime `Target: local stack (127.0.0.1:54322)` quando isso acontece; confira
  o alvo antes de concluir que o remoto foi atualizado.
- `supabase db reset` e `supabase/seed.sql` são **só para o ambiente local**;
  não rode `db reset` contra o projeto hospedado.
- `supabase/config.toml` (Site URL, redirects, template de e-mail) vale apenas
  para o stack local. No hospedado, esses valores são configurados no painel,
  nos passos abaixo.
- Os testes pgTAP (`supabase test db`) rodam contra o banco local.

### 2.3. Auth: Site URL e redirect URLs

Em **Authentication → URL Configuration**:

- **Site URL**: `https://<app>.vercel.app` (domínio de produção do PWA).
- **Redirect URLs**: adicione as origens permitidas, uma por linha:
  - `https://<app>.vercel.app`
  - `https://<app>.vercel.app/**`
  - `https://<projeto>-*-<time>.vercel.app/**` para os deploys de preview, se
    você for testar login em preview (ajuste o padrão ao domínio real que a
    Vercel gera; o Supabase aceita `*` em redirect URLs).
  - `http://localhost:1420` apenas se quiser testar o build web apontando para
    o Supabase hospedado na sua máquina.

Por que importa: o app chama `signInWithOtp` com
`emailRedirectTo: window.location.origin`. Se a origem do PWA não estiver na
lista, o magic link é rejeitado. O código de 6 dígitos não depende do redirect,
mas depende do template de e-mail abaixo.

> Trocar o domínio depois exige **reinstalar o PWA** no iPhone: a identidade do
> app instalado é a origem (`https://<app>.vercel.app`).

### 2.4. Template de e-mail com o código de 6 dígitos

O PWA faz login pelo código de 6 dígitos porque o magic link abre no Safari,
fora do app instalado. O template padrão do Supabase não mostra o token; copie
o conteúdo de [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html)
para **Authentication → Email Templates → Magic Link** no painel. O template
usa `{{ .ConfirmationURL }}` (link) e `{{ .Token }}` (código).

Sem `{{ .Token }}` no template, o login do PWA fica impossível. Opcionalmente,
configure **SMTP customizado** para produção: o serviço de e-mail padrão do
Supabase tem limite baixo de envios por hora.

## 3. PWA na Vercel

### 3.1. Configuração do projeto na Vercel

Importe o repositório em <https://vercel.com/new> e use:

| Ajuste | Valor |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `apps/app` |
| Build Command | `pnpm build:web` |
| Output Directory | `dist` |
| Install Command | deixe o padrão (a Vercel detecta o workspace pnpm) |
| Node.js Version | 22.x (Vite 8 exige Node ≥ 20.19 ou ≥ 22.12) |

Pontos de atenção:

- Use `pnpm build:web`, **não** `pnpm build`: o script `build` gera o target
  `tauri`, sem manifest nem service worker. O `build:web` define
  `VITE_TARGET=web` e roda `tsc -p tsconfig.web.json && vite build`.
- Com Root Directory `apps/app`, a Vercel instala as dependências a partir da
  raiz do monorepo (há `pnpm-workspace.yaml` e `pnpm-lock.yaml` na raiz). Se o
  install reclamar de `@shungite/core`, use Install Command
  `cd ../.. && pnpm install --frozen-lockfile` e habilite a opção de incluir
  arquivos fora do Root Directory no build.
- **Environment Variables** (Production e Preview), com os mesmos nomes do
  modelo [`apps/app/.env.example`](../apps/app/.env.example):
  - `VITE_SUPABASE_URL` = Project URL do Supabase
  - `VITE_SUPABASE_ANON_KEY` = anon/public key

  Não defina `VITE_TARGET` nas variáveis de ambiente; quem define é o script
  `build:web`.

### 3.2. `vercel.json`

Não é necessário. O app não tem rotas de cliente (as abas são estado local), e
o Vite gera `dist/index.html`, `dist/manifest.webmanifest`, `dist/sw.js` e
`dist/registerSW.js` com caminhos absolutos na raiz. A Vercel serve `/` a partir
de `index.html` e os demais arquivos como estáticos. Se no futuro entrarem
rotas de cliente, aí sim vale um rewrite de SPA para `/index.html`.

### 3.3. Build local do PWA

```bash
pnpm install
pnpm --filter @shungite/app build:web
```

Saída em `apps/app/dist/` (`sw.js`, `manifest.webmanifest` e `pwa/`). Para
conferir o build servido:

```bash
pnpm --filter @shungite/app exec vite preview
```

Para desenvolvimento web local (`http://localhost:1420`):

```bash
pnpm app:web
```

### 3.4. Checklist manual no iPhone

Faça com o Mac configurado como Home e logado na mesma conta do iPhone.

**Instalar o PWA**

- [ ] No iPhone, abra `https://<app>.vercel.app` no **Safari** (não Chrome).
- [ ] Toque em **Compartilhar → Adicionar à Tela de Início** e confirme.
- [ ] Abra o Shungite pelo ícone da tela de início: deve abrir em tela cheia,
      sem a barra do Safari.
- [ ] Em Configurações → Conta, entre com o e-mail, pegue o código de 6 dígitos
      no app de e-mail e cole no PWA. O painel deve mostrar "Conectado como …".

**Task do iPhone no Mac**

- [ ] No iPhone, crie uma Task nova com um texto identificável.
- [ ] No Mac, abra o app desktop (logado na mesma conta) e confirme que a Task
      aparece na aba **To-Do**.
- [ ] No Mac, crie outra Task e confirme que ela aparece no iPhone.
- [ ] Marque uma Task como feita no iPhone e confirme o estado no Mac (e
      vice-versa).

**Note editada no iPhone**

- [ ] No iPhone, faça **Promote** de uma Task para Note e escreva um texto
      único no corpo.
- [ ] No Mac, abra a Note correspondente no Vault e confirme o texto.
- [ ] Edite a Note no Mac, volte ao iPhone e confirme a atualização.

**Offline e reabertura**

- [ ] Ative o modo avião no iPhone, edite uma Note e feche o PWA.
- [ ] Desligue o modo avião, reabra o PWA e confirme que a edição sincronizou
      com o Mac.
- [ ] Se o PWA instalado ficar preso numa versão antiga, feche e reabra; se
      persistir, remova o ícone e adicione de novo (o service worker usa
      `autoUpdate`).

Em conflito, a versão do Home (Mac) vence e a perdedora fica como **Conflict
copy** (`Nome (conflito).md`), conforme o glossário e a ADR 0002.

## 4. Problemas comuns

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| Painel mostra "Sync desligado" | `VITE_SUPABASE_URL`/`ANON_KEY` ausentes no build | Defina as env vars e refaça o deploy/build |
| Magic link retorna erro de redirect | Origem fora das Redirect URLs | Adicione a origem exata em Authentication → URL Configuration |
| E-mail chega sem código de 6 dígitos | Template hospedado ainda é o padrão | Copie `supabase/templates/magic_link.html` para o template Magic Link |
| PWA branco após deploy | Build antigo/cache do service worker | Recarregue, feche e reabra; em último caso remova e reinstale o PWA |
| Login funciona no Safari e não no app instalado | Link aberto fora do escopo do PWA | Use o código de 6 dígitos dentro do PWA |
| Tabelas não existem no projeto hospedado | Migrations não aplicadas (ou `db push` foi para o stack local) | `supabase link` + `supabase db push --linked` |
| Indicador mostra "Sync com erro" | Migrations não aplicadas no hospedado: faltam `tasks`, `notes` e `devices` | `supabase migration list --linked`; se o remoto estiver vazio, `supabase db push --linked` |
| App desktop sem Sync | Build feito sem `.env.local` | Recrie `apps/app/.env.local` e rode `tauri build` de novo |
