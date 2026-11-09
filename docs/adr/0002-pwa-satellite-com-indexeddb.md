# O PWA é um Satellite que guarda Tasks e Notes no IndexedDB

Para usar o app no iPhone sem App Store, publicamos um PWA na Vercel. No browser não existem pasta de Vault nem SQLite local (a File System Access API não funciona no Safari/iOS), então o PWA guarda Tasks e Notes (`path` + `content`) no IndexedDB, atrás das mesmas interfaces `LocalStore` e `FileStore` do core, e sincroniza com o Supabase. O PWA é sempre **Satellite**: nunca cria Vault e, em conflito, o Home (Mac) vence, com a versão perdedora guardada como Conflict copy.

## Considered Options

- **Só app nativo iOS via Tauri**: preserva o plugin de arquivos, mas exige Xcode, conta Apple e continua sem Vault real no sandbox do iOS.
- **File System Access API no PWA**: dá pasta de verdade em Chrome desktop, mas não existe no Safari/iOS, que é o alvo.

## Consequences

- O mesmo `apps/app` gera dois builds (Tauri e web); o adaptador é escolhido em build time. Sem segunda UI.
- Na web ficam fora da v1: escolha de Vault, watcher de arquivos e Promote para pasta real. O Promote cria a Note no IndexedDB e sincroniza como qualquer outra.
- O login do PWA usa o código de 6 dígitos, porque o magic link abre no Safari, contexto separado do PWA instalado.
- Offline: service worker para o app shell e edições no IndexedDB que sincronizam ao voltar a rede. Sem push nem background sync (limitados no iOS).
- Exige um projeto Supabase hospedado, com migrations, Site URL e redirects de Auth apontando para o domínio `*.vercel.app`. Trocar de domínio depois exige reinstalar o PWA.
