# Focca em microsserviços

Todos os serviços do diagrama de componentes (`Focca_Servicos_Casos_de_Uso_e_Componentes.asta`) estão implementados:

- Serviço de Autenticação;
- Serviço de Semestre e Matriz Curricular;
- Serviço de Notas;
- Serviço de Frequência;
- Serviço de Agenda Acadêmica.

Junto com eles vão o **API Gateway Focca**, que é a fachada do sistema, e o **Discovery**, onde os serviços se registram e são encontrados.

## Tecnologias

| Item | Tecnologia |
|---|---|
| Linguagem | JavaScript (Node.js 24) |
| Rotas HTTP | [Express 5](https://expressjs.com/) em todos os componentes |
| Encaminhamento no gateway | [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware) |
| Banco de dados | PostgreSQL 17, um servidor para cada serviço (driver `pg`) |
| Senhas | scrypt (módulo `node:crypto`) |
| Contêineres | Docker e Docker Compose |
| Testes | `node:test` |

## Arquitetura

```
                          Cliente (só conhece o gateway, porta 8080)
                                          │
                                          ▼
                    API Gateway Focca (fachada) ─── localiza serviços ───► Discovery :3000
                    confere o login no Serviço de Autenticação                ▲
          ┌───────────────┬───────────────┼───────────────┬───────────────┐   │ todos se registram
          ▼               ▼               ▼               ▼               ▼   │ e se localizam aqui
   Autenticação       Semestre          Notas         Frequência        Agenda
          │               │  ──cadastra──────────────────►│               │
          │               │               │  ──consulta──►│               │
          ▼               ▼               ▼               ▼               ▼
  db-autenticacao    db-semestre      db-notas      db-frequencia     db-agenda
```

| Componente do modelo | Pasta | Caso de uso | Porta exposta? |
|---|---|---|---|
| API Gateway Focca «API gateway» | `gateway/` | todos (fachada) | Sim, 8080 |
| Discovery «discovery» | `discovery/` | — | Sim, 3000 |
| Serviço de Autenticação + BD Autenticação | `servico-autenticacao/` + `db-autenticacao` | UC01 Autenticar no sistema, Criar conta, Entrar com conta Google, Encerrar sessão | Não |
| Serviço de Semestre + BD Semestre | `servico-semestre/` + `db-semestre` | UC02 Configurar semestre atual, Importar matriz, Usar matriz base | Não |
| Serviço de Notas + BD Notas | `servico-notas/` + `db-notas` | UC05 Registrar e acompanhar notas, Calcular situação acadêmica | Não |
| Serviço de Frequência + BD Frequência | `servico-frequencia/` + `db-frequencia` | UC06 Registrar e acompanhar faltas, Calcular resumo de frequência | Não |
| Serviço de Agenda Acadêmica + BD Agenda | `servico-agenda/` + `db-agenda` | UC08 Planejar atividade, Sincronizar no Google Agenda, Obter autorização | Não |
| Validação «global» | `src/validacao.js` de cada serviço | — | — |

## Decisões principais

- **Serviços independentes.** Cada pasta é um projeto separado, com `package.json`, dependências, `Dockerfile` e código próprios. Não existe pasta de código compartilhado.
- **Banco de dados independente por serviço:** cinco servidores PostgreSQL, cada um com volume, usuário e senha próprios. Um serviço não conhece as credenciais do outro.
- **Toda comunicação passa pelo Discovery.** Nenhum endereço de serviço fica fixo no código.
  - Cada serviço se registra ao iniciar (`POST /servicos`) e renova a cada 10 s.
  - Quem precisa de um serviço pergunta ao Discovery (`GET /servicos/:nome`).
  - Sem renovação por 30 s, o serviço sai da lista. Ao desligar, cancela o próprio registro.
- **Gateway como fachada e porta de segurança.**
  - O cliente só fala com o gateway, e só o gateway e o Discovery publicam portas.
  - Fora de `/api/autenticacao`, toda chamada exige `Authorization: Bearer <token>`. O gateway confere o token no Serviço de Autenticação, localizado pelo Discovery.
  - Cada estudante só acessa os próprios dados (`/estudantes/<seu id>/...`). Qualquer outro id recebe 403.
  - `/api/estudantes/{id}/resumo` é uma operação da fachada: uma chamada do cliente vira quatro chamadas internas (semestre, notas, frequência e agenda), e o gateway junta as respostas.
- **Comunicação entre serviços (sempre via Discovery):**
  - O Serviço de Semestre, ao configurar o semestre atual, cadastra as disciplinas no Serviço de Frequência, com a carga horária.
  - O Serviço de Notas consulta o Serviço de Frequência: a `situacaoFinal` vira `reprovado-por-falta` quando o limite de faltas foi ultrapassado.
  - Se um serviço estiver fora do ar, o outro continua respondendo.
- **Sistemas externos atrás de adaptadores (portas e adaptadores):**
  - **Login com Google:** o `adaptador-google.js` valida o ID token no Google e confere o `GOOGLE_CLIENT_ID`.
  - **Google Agenda:** o `adaptador-google-agenda.js` cria o evento pela Google Calendar API, com o token de acesso do estudante (a "autorização de acesso à agenda").
  - **Modo simulado:** no `docker-compose.yml`, os dois rodam em modo simulado (`AUTENTICACAO_GOOGLE=simulado` e `AGENDA_GOOGLE=simulado`), para demonstrar sem navegador nem conta Google.
- **Ordem de inicialização com healthchecks:** bancos e Discovery primeiro, depois os serviços, por último o gateway.
- **Regras de negócio** iguais às do app web (`public/academic.js`):
  - Notas: média ≥ 7 aprova; a 3ª VA substitui a menor nota; na Final, (média + Final) / 2 ≥ 5.
  - Frequência: limite de 25% da carga horária.
  - Matriz: a matriz base de Licenciatura em Computação da UFRPE, com 49 disciplinas.

## Como executar com Docker (recomendado)

```bash
docker compose up --build
```

Sobem 12 contêineres: o Discovery, o gateway, os cinco serviços e os cinco bancos. Com tudo no ar:

- `http://localhost:8080/saude`: estado do gateway e serviços registrados.
- `http://localhost:3000/servicos`: o que está registrado direto no Discovery.
- `npm run demo` (precisa do Node): cria uma conta, faz login e usa todos os serviços pelo gateway.

Para conferir que cada serviço tem o seu banco, por exemplo:

```bash
docker compose exec db-semestre psql -U servico_semestre -d semestre -c "select nome, status from disciplinas where status = 'cursando'"
```

Para encerrar, use `docker compose down`. Para apagar também os bancos, use `docker compose down -v`.

## Como executar sem Docker (desenvolvimento)

Requisito: Node.js 22.13 ou mais recente.

```bash
npm install
```
```bash
npm start
```

O `npm install` na raiz instala as dependências de cada componente, na sua própria pasta. Sem `DATABASE_URL`, cada serviço usa um arquivo SQLite próprio, na pasta `dados/` do serviço. Para os modos simulados, defina `AUTENTICACAO_GOOGLE=simulado` e `AGENDA_GOOGLE=simulado`.

Testes automatizados (23 testes, incluindo ponta a ponta pelo gateway com login):

```bash
npm test
```

## API (pelo gateway, `http://localhost:8080`)

Fora de `/api/autenticacao`, envie `Authorization: Bearer <token>`. `{id}` é o id do estudante logado.

### Autenticação (`/api/autenticacao`), pública

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/contas` | Criar conta `{ nome, email, senha }` |
| POST | `/sessoes` | Entrar `{ email, senha }` e receber `{ token, usuario }` |
| POST | `/sessoes/google` | Entrar com conta Google `{ idToken }` |
| GET | `/sessoes/atual` | Validar o token (usado pelo gateway) |
| DELETE | `/sessoes/atual` | Encerrar sessão |

### Semestre e Matriz Curricular (`/api/semestre`)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/matriz-base` | Matriz base de Computação |
| POST | `/estudantes/{id}/matriz/base` | Usar a matriz base |
| POST | `/estudantes/{id}/matriz/importacao` | Importar matriz `{ disciplinas: [{ nome, periodo, cargaHoraria, tipo }] }` |
| GET | `/estudantes/{id}/matriz` | Matriz e progresso da graduação |
| PATCH | `/estudantes/{id}/disciplinas/{disciplinaId}` | Alterar status: pendente, cursando, aprovada, reprovada ou dispensada |
| PUT | `/estudantes/{id}/semestre` | Configurar semestre atual `{ rotulo, disciplinas: [ids] }`, o que também cadastra as disciplinas na Frequência |
| GET | `/estudantes/{id}/semestre` | Semestre atual |

### Notas (`/api/notas`)

| Método | Caminho | O que faz |
|---|---|---|
| PUT | `/estudantes/{id}/disciplinas/{disciplinaId}/notas` | Lançar notas `{ va1, va2, va3, final }` |
| GET | `/estudantes/{id}/disciplinas/{disciplinaId}/notas` | Notas, situação, frequência e `situacaoFinal` |
| GET | `/estudantes/{id}/notas` | Todas as disciplinas com situação |
| DELETE | `/estudantes/{id}/disciplinas/{disciplinaId}/notas` | Remover notas |
| POST | `/situacao` | Simular a situação, sem gravar |

### Frequência (`/api/frequencia`)

| Método | Caminho | O que faz |
|---|---|---|
| PUT | `/estudantes/{id}/disciplinas/{disciplinaId}` | Cadastrar disciplina `{ cargaHoraria, temChamada }` |
| POST | `/estudantes/{id}/disciplinas/{disciplinaId}/faltas` | Registrar faltas `{ data, quantidade }` |
| GET | `/estudantes/{id}/disciplinas/{disciplinaId}/frequencia` | Faltas e resumo |
| GET | `/estudantes/{id}/frequencia` | Resumo de todas as disciplinas |
| DELETE | `/estudantes/{id}/faltas/{faltaId}` | Remover falta |
| DELETE | `/estudantes/{id}/disciplinas/{disciplinaId}` | Remover disciplina |

### Agenda Acadêmica (`/api/agenda`)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/estudantes/{id}/atividades` | Planejar atividade `{ titulo, disciplina, tipo, data, hora }` |
| GET | `/estudantes/{id}/atividades` | Listar (`?pendentes=true` para não concluídas) |
| GET | `/estudantes/{id}/atividades/{atividadeId}` | Ver uma atividade |
| PATCH | `/estudantes/{id}/atividades/{atividadeId}` | Editar ou concluir `{ concluida: true }` |
| DELETE | `/estudantes/{id}/atividades/{atividadeId}` | Remover |
| POST | `/estudantes/{id}/atividades/{atividadeId}/sincronizar` | Sincronizar no Google Agenda `{ acessoGoogle }` |

### Fachada e Discovery

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/api/estudantes/{id}/resumo` | Semestre, notas, frequência e agenda numa resposta |
| GET | `/saude` | Estado do gateway e serviços registrados |
| GET | `http://localhost:3000/servicos` | Serviços registrados no Discovery |
| GET | `http://localhost:3000/servicos/{nome}` | Instâncias ativas de um serviço |

## Estrutura

```
discovery/             Discovery (Express)
gateway/               API Gateway, fachada (Express + http-proxy-middleware)
servico-autenticacao/  Autenticação (Express + PostgreSQL + adaptador Google)
servico-semestre/      Semestre e Matriz Curricular (Express + PostgreSQL)
servico-notas/         Notas (Express + PostgreSQL)
servico-frequencia/    Frequência (Express + PostgreSQL)
servico-agenda/        Agenda Acadêmica (Express + PostgreSQL + adaptador Google Agenda)
testes/                testes de regras e de integração
docker-compose.yml     sobe os 12 contêineres (só gateway e Discovery com portas expostas)
iniciar.js             sobe tudo sem Docker
demonstracao.js        roteiro de chamadas para apresentação
```

Cada pasta de componente tem `package.json`, `Dockerfile` e `src/`.
