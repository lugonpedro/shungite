# TaskManager

Um gerenciador de tarefas local-first inspirado no Obsidian: o usuário anota Tarefas rapidamente e pode transformar qualquer uma delas em um arquivo Markdown dentro de uma pasta sua, com sync entre dispositivos.

## Language

**Vault**:
A pasta no computador do usuário que guarda os arquivos `.md`. Pode ser aberta também no Obsidian.
_Avoid_: Workspace, repositório, pasta de notas

**Task**:
Algo a fazer, com um texto, um estado feita/não feita e uma data opcional. Existe sem precisar de arquivo.
_Avoid_: Todo, item, card

**Note**:
O arquivo `.md` no Vault criado a partir de uma Task. Depois de criada, a Note passa a ser a fonte da verdade daquela Task e aceita texto livre.
_Avoid_: Arquivo da tarefa, documento, página

**Promote**:
Transformar uma Task em Note, por escolha do usuário, com um botão em cada Task.
_Avoid_: Exportar, materializar, converter

## Sync

**Sync**:
O espelhamento das Tasks e Notes entre os dispositivos do usuário, via Supabase. Opcional: o app funciona sem conta.
_Avoid_: Backup, replicação, upload

**Home**:
O dispositivo onde o Vault foi criado e onde os `.md` reais moram, normalmente o Mac. Em conflito, a versão do Home vence.
_Avoid_: Principal, servidor, master

**Satellite**:
Qualquer outro dispositivo com uma cópia sincronizada do Vault, como o iPhone. O PWA na web é sempre Satellite: guarda as Notes no navegador (IndexedDB), sem pasta de Vault.
_Avoid_: Secundário, cliente, réplica

**Conflict copy**:
A versão que perdeu um conflito, guardada como `Nome (conflito).md` para o usuário revisar e apagar. Uma Task em conflito vira uma Task "(conflito)".
_Avoid_: Backup, duplicata

## Interface

**To-Do**:
A aba inicial do app, onde o usuário vê e controla todas as Tarefas.
_Avoid_: Inbox, home, dashboard

**Configurações**:
A tela que concentra o Vault (pasta atual, trocar) e a Conta e Sync. Aberta pelo rodapé da barra lateral.
_Avoid_: Settings, Preferências, Ajustes
