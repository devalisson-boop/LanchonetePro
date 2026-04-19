# Lanchonete Pro

Sistema web para gestao de lanchonete com foco em operacao diaria, pedidos, caixa, estoque e acompanhamento do negocio em um unico painel.

## Descricao

O **Lanchonete Pro** e uma aplicacao full stack desenvolvida para centralizar a rotina de uma lanchonete. O projeto combina frontend em React, backend em NestJS e autenticacao com Supabase para entregar uma experiencia administrativa moderna, organizada e escalavel.

## Tecnologias Utilizadas

### Frontend

- React 19
- Vite
- TypeScript
- React Router DOM
- Supabase JS

### Backend

- NestJS
- TypeScript
- PostgreSQL
- `pg`
- `class-validator`
- `class-transformer`
- `jose`
- Swagger

### Infraestrutura e Banco

- Supabase
- SQL versionado em `infra/supabase`
- Docker
- Docker Compose

## Funcionalidades Principais

- Autenticacao de usuarios com login, cadastro, refresh de sessao e logout
- Dashboard com visao geral da operacao
- Gestao de pedidos
- Controle de caixa com abertura, fechamento, sangria, suprimento e pagamentos
- Controle de estoque e movimentacoes
- Cadastro e gerenciamento de produtos, categorias e ingredientes
- Relatorios operacionais e indicadores de desempenho
- Documentacao da API via Swagger

## Performance e SEO

### Performance

- Frontend construido com Vite para desenvolvimento rapido e build otimizada
- Backend com NestJS e pool de conexoes com PostgreSQL
- Validacao tipada de payloads para reduzir erros em runtime
- Estrutura modular para facilitar manutencao e evolucao do sistema

### SEO

Como este projeto e um **painel administrativo autenticado**, o foco principal atual e performance operacional, seguranca e organizacao da interface.

Hoje o frontend ja possui:

- `lang="pt-BR"` no documento HTML
- `viewport` configurado para responsividade
- titulo da aplicacao definido

Melhorias futuras recomendadas para paginas publicas:

- meta description
- Open Graph e Twitter Cards
- sitemap e `robots.txt`
- metadados dinamicos por rota publica

## Instalacao

### Pre-requisitos

- Node.js 20+ recomendado
- npm
- projeto Supabase configurado

### 1. Clone o repositorio

```bash
git clone <URL_DO_REPOSITORIO>
cd projeto de lanchonete
```

### 2. Instale as dependencias

```bash
npm install
```

### 3. Configure os arquivos de ambiente

Revise e preencha:

- `apps/api/.env`
- `apps/web/.env`

Campos importantes:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 4. Aplique a estrutura SQL no banco

```bash
npm run db:migrate
```

## Como Rodar Localmente

### Backend

```bash
npm run dev:api
```

API disponivel em:

- `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`

### Frontend

```bash
npm run dev:web
```

Aplicacao disponivel em:

- `http://localhost:5173`

## Build de Producao

```bash
npm run build
```

## Executar com Docker

```bash
docker compose up --build
```

Servicos:

- API: `http://localhost:3000`
- Frontend: `http://localhost:8080`

## Deploy na Render

Este projeto ja esta preparado para deploy com **Render** usando dois servicos Docker:

- `lanchonete-pro-api`
- `lanchonete-pro-web`

O arquivo [render.yaml](./render.yaml) foi adicionado para facilitar esse processo via Blueprint.

### Passo a passo

1. Suba este repositorio para o GitHub.
2. Acesse a Render e escolha a opcao para criar um novo projeto via **Blueprint**.
3. Conecte o repositorio e importe o arquivo `render.yaml`.
4. No primeiro deploy, preencha as variaveis pedidas pela Render.

### Variaveis da API

- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FRONTEND_URL`

### Variaveis do Frontend

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Ordem recomendada de configuracao

Como o frontend precisa saber a URL publica da API e a API precisa liberar o dominio do frontend no CORS, faca assim:

1. Faça o primeiro deploy com as credenciais do Supabase e banco.
2. Depois que a Render gerar as URLs publicas dos servicos, copie a URL do frontend e configure `FRONTEND_URL` na API.
3. Copie a URL publica da API e configure `VITE_API_URL` no frontend no formato:

```text
https://SUA-API.onrender.com/api
```

4. Salve e redeploye os dois servicos.

### Arquivos de exemplo

Para facilitar a configuracao, o projeto agora inclui:

- `apps/api/.env.example`
- `apps/web/.env.example`

### Observacoes importantes

- O health check da API esta em `/api/health`
- O frontend usa `env.js` em runtime, o que combina bem com deploy em container
- Em producao, prefira configurar dominio proprio e HTTPS
- O plano `free` funciona para testes, mas pode nao ser o ideal para uso comercial continuo

## Estrutura de Pastas

```text
apps/
  api/                    # Backend NestJS
  web/                    # Frontend React + Vite
infra/
  docker/                 # Dockerfiles, nginx e configuracoes de container
  scripts/                # Scripts utilitarios
  supabase/               # SQL versionado para schema, ajustes e seed
```

## Scripts Principais

```bash
npm run dev:api
npm run dev:web
npm run build
npm run lint
npm run db:migrate
```

## Licenca

No momento, este projeto **ainda nao possui uma licenca definida** no repositorio.

## Contato

- LinkedIn: [Alisson da Rocha Trindade](https://www.linkedin.com/in/alisson-da-rocha-trindade-754219368)
- Instagram: [@r.alissonxt](https://instagram.com/r.alissonxt)
- GitHub: [devalisson-boop](https://github.com/devalisson-boop)
