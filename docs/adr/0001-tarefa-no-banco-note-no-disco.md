# Tarefas sem arquivo vivem num banco local; a Note, depois de promovida, é a fonte da verdade

Uma Task nasce rápida, sem arquivo, e só vira `.md` quando o usuário a promove. Por isso Tasks sem arquivo moram num banco local do app (e vão ao Supabase pelo sync), e só as Notes são arquivos no Vault. Depois de promovida, a Note no disco é a fonte da verdade daquela Task; apagar o `.md` fora do app desfaz a promoção, não apaga a Task.

## Considered Options

- **Um único `To-Do.md` com todas as Tasks**: manteria tudo em arquivo, mas contradiz "um arquivo por tarefa, só quando eu quiser" e mistura captura rápida com notas.
- **Todo Task já nasce como `.md`**: disco como única fonte da verdade, mas enche o Vault de arquivos que o usuário não pediu.

## Consequences

O app funciona sem login e sem Vault para Tasks simples. O sync precisa tratar dois tipos de coisa (linhas de Tasks e arquivos de Notes).
