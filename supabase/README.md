# Supabase Postgres no Enfaflix

## 1. Criar o projeto no Supabase
- Crie um projeto novo no Supabase.
- Copie a `DATABASE_URL` da area de conexao do Postgres.
- Se o host exigir SSL, mantenha `PGSSL=true`.

## 2. Criar as tabelas
- Abra o SQL Editor do Supabase.
- Cole o conteudo de `supabase/schema.sql`.
- Execute o script uma vez.

## 3. Migrar os dados atuais do SQLite
No terminal do projeto, com `DATABASE_URL` configurada:

```powershell
$env:DB_CLIENT='postgres'
$env:DATABASE_URL='sua-connection-string-aqui'
npm.cmd run migrate:postgres
```

Esse script:
- aplica o schema no Postgres
- limpa as tabelas do Postgres antes da copia
- copia usuarios, cursos, aulas, matriculas, pedidos, progresso, certificados e avaliacoes
- sincroniza os IDs para novos cadastros continuarem funcionando

## 4. Trocar o projeto para Postgres
No `.env` local e depois no Render:

```env
DB_CLIENT=postgres
DATABASE_URL=sua-connection-string-aqui
PGSSL=true
```

## 5. Publicar com seguranca
Mantenha tambem configurado:

```env
NODE_ENV=production
APP_BASE_URL=https://seu-site.onrender.com
JWT_SECRET=uma-chave-bem-forte
ALLOW_SQLITE_IN_PRODUCTION=false
ALLOW_LOCAL_FILE_UPLOADS=false
```

## 6. Observacoes importantes
- O projeto continua funcionando localmente com SQLite enquanto voce nao migrar.
- Em producao, o ideal e usar `DB_CLIENT=postgres`.
- Os videos podem continuar como YouTube nao listado.
- Materiais complementares ainda estao em arquivo local; para publicacao mais robusta, o proximo passo ideal e mover isso para um storage externo.
