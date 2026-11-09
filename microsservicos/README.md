# Focca: Entrega Parcial 2 (microsserviços)

Implementação de dois microsserviços do Focca, o **Serviço de Notas** e o **Serviço de Frequência**. Eles seguem o diagrama de componentes dos serviços (arquivo `Focca_Servicos_Casos_de_Uso_e_Componentes.asta`). Junto com eles vão o **API Gateway Focca** e o **Discovery**, que fazem os serviços funcionarem como no modelo.

Tecnologia: **JavaScript (Node.js)** e **PostgreSQL**. Cada microsserviço tem o seu próprio servidor de banco de dados. A única dependência externa é o driver `pg`.

## Arquitetura

```
 Cliente ──► API Gateway Focca (8080) ──► Serviço de Notas (3001) ──────► PostgreSQL db-notas
                    │                 └─► Serviço de Frequência (3002) ─► PostgreSQL db-frequencia
                    ▼                          │
               Discovery (3000) ◄──────────────┘  (cada serviço se registra ao iniciar)
```

| Componente do modelo | Pasta | Interface |
|---|---|---|
| API Gateway Focca «API gateway» | `gateway/` | IApiGateway |
| Discovery «discovery» | `discovery/` | IRegistroServicos |
| Serviço de Notas «serviço» + BD Notas | `servico-notas/` + contêiner `db-notas` | IServicoNotas |
| Serviço de Frequência «serviço» + BD Frequência | `servico-frequencia/` + contêiner `db-frequencia` | IServicoFrequencia |
| Validação «global» | `compartilhado/validacao.js` | usada por todos |

Decisões principais:

- **Banco de dados independente por microsserviço** (*database per service*):
  - O Serviço de Notas usa o PostgreSQL `db-notas`, banco `notas`, usuário `servico_notas`.
  - O Serviço de Frequência usa o PostgreSQL `db-frequencia`, banco `frequencia`, usuário `servico_frequencia`.
  - São dois servidores diferentes, cada um com seu volume, usuário e senha. Um serviço não conhece o endereço nem as credenciais do banco do outro. Se o Serviço de Notas tentar entrar no banco de Frequência, a conexão é recusada.
- **O cliente só fala com o gateway.** Uma chamada a `/api/<serviço>/...` faz o gateway perguntar ao Discovery onde está uma instância ativa do serviço. Se houver mais de uma, ele escolhe em rodízio (*round-robin*) e encaminha a chamada. A resposta traz o cabeçalho `X-Servico-Atendente` dizendo qual instância atendeu.
- **Registro com expiração.** Cada serviço se registra no Discovery ao iniciar e renova o registro a cada 10 s. Um serviço que cai sai da lista depois de 30 s. Se não há instância ativa, o gateway responde 503.
- **Ordem de inicialização com healthchecks.** No `docker-compose.yml`, os bancos e o Discovery precisam estar saudáveis antes de os serviços subirem. O gateway só sobe depois que Notas e Frequência estão saudáveis.
- **Regras de negócio.** Seguem a mesma regra do app web (`public/academic.js`) e ficam dentro de cada serviço:
  - `servico-notas/src/regras.js` contém a EstrategiaCalculoNotas, com a regra da UFRPE para VA1, VA2, 3ª VA e Final.
  - `servico-frequencia/src/regras.js` contém o resumo de frequência, com limite de 25% da carga horária.

## Como executar com Docker (recomendado)

Requisito: Docker Desktop.

```bash
docker compose up --build
```

Esse comando sobe seis contêineres: `discovery`, `db-notas`, `notas`, `db-frequencia`, `frequencia` e `gateway`.

- Só o gateway fica exposto, em `http://localhost:8080`. Os outros componentes se comunicam pela rede interna do Compose.
- Os dados de cada serviço ficam no volume do seu banco: `dados-db-notas` e `dados-db-frequencia`.
- Com os contêineres no ar, rode em outro terminal o roteiro de demonstração. Ele faz chamadas reais pelo gateway e mostra as respostas (precisa do Node instalado):

```bash
npm run demo
```

Para conferir que cada serviço tem o seu banco:

```bash
docker compose exec db-notas psql -U servico_notas -d notas -c "select * from avaliacoes"
```
```bash
docker compose exec db-frequencia psql -U servico_frequencia -d frequencia -c "select * from faltas"
```

Para encerrar, use `docker compose down`. Para apagar também os bancos, use `docker compose down -v`.

## Como executar sem Docker (desenvolvimento)

Requisito: **Node.js 22.13 ou mais recente** (testado no Node 24).

```bash
npm install
```
```bash
npm start
```

Sem a variável `DATABASE_URL`, cada serviço usa um arquivo SQLite próprio, só para desenvolvimento: `servico-notas/dados/notas.db` e `servico-frequencia/dados/frequencia.db`. Com `DATABASE_URL`, o serviço usa o PostgreSQL indicado. O código do serviço é o mesmo nos dois casos, só o repositório muda.

Também dá para subir cada componente separadamente, em terminais diferentes: `npm run discovery`, `npm run notas`, `npm run frequencia` e `npm run gateway`.

Testes automatizados (16 testes, incluindo ponta a ponta pelo gateway):

```bash
npm test
```

Variáveis de ambiente: `PORTA`, `DATABASE_URL` (PostgreSQL do serviço), `BD` (arquivo SQLite, sem `DATABASE_URL`), `DISCOVERY_URL` e `HOST`.

## API (pelo gateway, `http://localhost:8080`)

### Serviço de Notas (`/api/notas`)

Caso de uso UC05 Registrar e acompanhar notas, que inclui Calcular situação acadêmica.

| Método | Caminho | O que faz |
|---|---|---|
| PUT | `/api/notas/estudantes/{estudanteId}/disciplinas/{disciplinaId}/notas` | Lança ou substitui as notas `{ va1, va2, va3, final }` e devolve a situação |
| GET | `/api/notas/estudantes/{estudanteId}/disciplinas/{disciplinaId}/notas` | Notas e situação de uma disciplina |
| GET | `/api/notas/estudantes/{estudanteId}/notas` | Todas as disciplinas do estudante, com situação |
| DELETE | `/api/notas/estudantes/{estudanteId}/disciplinas/{disciplinaId}/notas` | Remove as notas da disciplina |
| POST | `/api/notas/situacao` | Calcula a situação para as notas enviadas, sem gravar |

Etapas possíveis da situação: `notas-incompletas`, `aprovado`, `precisa-va3`, `aprovado-va3`, `precisa-final`, `aprovado-final` e `reprovado`. Quando falta uma prova, a resposta traz a `notaNecessaria`.

Regras de validação:
- Notas entre 0 e 10.
- `va3` só depois de `va1` e `va2`.
- `final` só depois da `va3`.

### Serviço de Frequência (`/api/frequencia`)

Caso de uso UC06 Registrar e acompanhar faltas, que inclui Calcular resumo de frequência.

| Método | Caminho | O que faz |
|---|---|---|
| PUT | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}` | Cadastra a disciplina `{ cargaHoraria, temChamada }` |
| POST | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}/faltas` | Registra faltas `{ data: "AAAA-MM-DD", quantidade }` e devolve o resumo |
| GET | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}/frequencia` | Faltas e resumo da disciplina |
| GET | `/api/frequencia/estudantes/{estudanteId}/frequencia` | Resumo de todas as disciplinas |
| DELETE | `/api/frequencia/estudantes/{estudanteId}/faltas/{faltaId}` | Remove um registro de falta |
| DELETE | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}` | Remove a disciplina e suas faltas |

Níveis do resumo:
- `ok`
- `atencao`: 50% ou mais do limite usado
- `risco`: 75% ou mais
- `reprovado-por-falta`: passou do limite
- `sem-chamada`

### Outros

- `GET /saude` no gateway mostra o estado do Discovery e os serviços registrados.
- `GET /api/notas/saude` e `GET /api/frequencia/saude` mostram o estado de cada serviço e o tipo de banco que ele está usando.

Exemplo com curl:

```bash
curl -X PUT http://localhost:8080/api/notas/estudantes/maria/disciplinas/apsoo/notas -H "Content-Type: application/json" -d "{\"va1\": 5, \"va2\": 6, \"va3\": 8}"
```

## Estrutura

```
compartilhado/       utilitários HTTP, validação (componente global) e cliente de registro no Discovery
discovery/           Discovery (registro e localização dos serviços)
gateway/             API Gateway Focca
servico-notas/       src/app.js (rotas), src/regras.js (cálculo), src/repositorio.js (PostgreSQL ou SQLite), src/index.js
servico-frequencia/  mesma organização
testes/              testes de regras e de integração
iniciar.js           sobe todos os componentes sem Docker
demonstracao.js      roteiro de chamadas para apresentação
docker-compose.yml   sobe os componentes e os dois bancos PostgreSQL (cada pasta tem seu Dockerfile)
```
