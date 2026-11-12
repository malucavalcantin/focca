# Focca: Entrega Parcial 2 (microsserviços)

Implementação de dois microsserviços do Focca, o **Serviço de Notas** e o **Serviço de Frequência**. Eles seguem o diagrama de componentes dos serviços (arquivo `Focca_Servicos_Casos_de_Uso_e_Componentes.asta`). Junto com eles vão o **API Gateway Focca**, que é a fachada do sistema, e o **Discovery**, onde os serviços se registram e são encontrados.

## Tecnologias

| Item | Tecnologia |
|---|---|
| Linguagem | JavaScript (Node.js 24) |
| Rotas HTTP | [Express 5](https://expressjs.com/) no Discovery, no gateway e nos dois serviços |
| Encaminhamento no gateway | [http-proxy-middleware](https://github.com/chimurai/http-proxy-middleware) |
| Banco de dados | PostgreSQL 17, um servidor para cada serviço (driver `pg`) |
| Contêineres | Docker e Docker Compose |
| Testes | `node:test` |

## Arquitetura

```
                 Cliente
                    │  (só conhece o gateway)
                    ▼
        API Gateway Focca :8080  ──── pergunta onde está cada serviço ───►  Discovery :3000
         (fachada)  │                                                         ▲      ▲
       ┌────────────┴────────────┐                                registra-se│      │registra-se
       ▼                         ▼                                            │      │
 Serviço de Notas ── consulta via Discovery ──► Serviço de Frequência ───────┘      │
       │  └─────────────────────────────────────────────────────────────────────────┘
       ▼                         ▼
 PostgreSQL db-notas      PostgreSQL db-frequencia
```

| Componente do modelo | Pasta | Interface | Porta visível fora do Docker? |
|---|---|---|---|
| API Gateway Focca «API gateway» | `gateway/` | IApiGateway | Sim, 8080 |
| Discovery «discovery» | `discovery/` | IRegistroServicos | Sim, 3000 |
| Serviço de Notas «serviço» | `servico-notas/` | IServicoNotas | Não (3001, só rede interna) |
| Serviço de Frequência «serviço» | `servico-frequencia/` | IServicoFrequencia | Não (3002, só rede interna) |
| BD Notas | contêiner `db-notas` | — | Não |
| BD Frequência | contêiner `db-frequencia` | — | Não |
| Validação «global» | `src/validacao.js` de cada serviço | usada por todos | — |

## Decisões principais

- **Serviços independentes.** Cada pasta é um projeto separado, com seu `package.json`, suas dependências, seu `Dockerfile` e seu código. Não existe pasta de código compartilhado: cada serviço pode ser construído, publicado e atualizado sozinho.
- **Toda comunicação passa pelo Discovery.** Nenhum endereço de serviço fica fixo no código.
  - Cada serviço se registra no Discovery ao iniciar (`POST /servicos`) e renova o registro a cada 10 s.
  - Quem precisa de um serviço pergunta ao Discovery (`GET /servicos/:nome`) e usa o endereço devolvido. Sem renovação por 30 s, o serviço sai da lista. Ao desligar, ele cancela o próprio registro.
- **Gateway como fachada.** O cliente só fala com o gateway:
  - `/api/notas/...` é encaminhado ao Serviço de Notas;
  - `/api/frequencia/...` é encaminhado ao Serviço de Frequência;
  - `/api/estudantes/{id}/resumo` é uma operação da fachada: uma chamada do cliente vira duas chamadas internas, e o gateway junta as respostas.
  
  Se houver várias instâncias de um serviço, o gateway alterna entre elas (round-robin). Se o serviço não estiver registrado, responde 503.
- **Comunicação entre serviços.** Ao consultar as notas de uma disciplina, o Serviço de Notas localiza o Serviço de Frequência pelo Discovery e consulta o resumo de faltas. Assim, a `situacaoFinal` vira `reprovado-por-falta` quando o limite de faltas foi ultrapassado. Se a Frequência estiver fora do ar, as notas continuam respondendo, com `frequencia.disponivel: false`.
- **Banco de dados independente por serviço** (*database per service*): `db-notas` e `db-frequencia` são servidores PostgreSQL diferentes, cada um com volume, usuário e senha próprios.
- **Só gateway e Discovery ficam expostos.** No `docker-compose.yml`, apenas `gateway` (8080) e `discovery` (3000) publicam portas. Os serviços de domínio e os bancos só existem na rede interna do Docker.
- **Ordem de inicialização com healthchecks.** Os bancos e o Discovery sobem saudáveis antes dos serviços, e o gateway sobe depois que Notas e Frequência estão saudáveis.
- **Regras de negócio** iguais às do app web (`public/academic.js`):
  - Notas: média ≥ 7 aprova; a 3ª VA substitui a menor nota; na Final, (média + Final) / 2 ≥ 5.
  - Frequência: limite de faltas de 25% da carga horária.

## Como executar com Docker (recomendado)

```bash
docker compose up --build
```

Sobem seis contêineres: `discovery`, `db-notas`, `notas`, `db-frequencia`, `frequencia` e `gateway`. Com tudo no ar:

- `http://localhost:8080/saude`: estado do gateway e serviços registrados.
- `http://localhost:3000/servicos`: o que está registrado direto no Discovery.
- `npm run demo` (precisa do Node): roteiro de chamadas reais pelo gateway.

Para conferir que cada serviço tem o seu banco:

```bash
docker compose exec db-notas psql -U servico_notas -d notas -c "select * from avaliacoes"
```
```bash
docker compose exec db-frequencia psql -U servico_frequencia -d frequencia -c "select * from faltas"
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

O `npm install` na raiz instala as dependências de cada componente, na sua própria pasta. Sem `DATABASE_URL`, cada serviço usa um arquivo SQLite próprio (`servico-notas/dados/notas.db` e `servico-frequencia/dados/frequencia.db`).

Testes automatizados (19 testes, incluindo ponta a ponta pelo gateway):

```bash
npm test
```

## API (pelo gateway, `http://localhost:8080`)

### Serviço de Notas (`/api/notas`)

| Método | Caminho | O que faz |
|---|---|---|
| PUT | `/api/notas/estudantes/{estudanteId}/disciplinas/{disciplinaId}/notas` | Lança ou substitui as notas `{ va1, va2, va3, final }` e devolve a situação |
| GET | `/api/notas/estudantes/{estudanteId}/disciplinas/{disciplinaId}/notas` | Notas, situação, frequência (consultada no Serviço de Frequência) e `situacaoFinal` |
| GET | `/api/notas/estudantes/{estudanteId}/notas` | Todas as disciplinas do estudante, com situação |
| DELETE | `/api/notas/estudantes/{estudanteId}/disciplinas/{disciplinaId}/notas` | Remove as notas da disciplina |
| POST | `/api/notas/situacao` | Calcula a situação para as notas enviadas, sem gravar |

### Serviço de Frequência (`/api/frequencia`)

| Método | Caminho | O que faz |
|---|---|---|
| PUT | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}` | Cadastra a disciplina `{ cargaHoraria, temChamada }` |
| POST | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}/faltas` | Registra faltas `{ data: "AAAA-MM-DD", quantidade }` e devolve o resumo |
| GET | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}/frequencia` | Faltas e resumo da disciplina |
| GET | `/api/frequencia/estudantes/{estudanteId}/frequencia` | Resumo de todas as disciplinas |
| DELETE | `/api/frequencia/estudantes/{estudanteId}/faltas/{faltaId}` | Remove um registro de falta |
| DELETE | `/api/frequencia/estudantes/{estudanteId}/disciplinas/{disciplinaId}` | Remove a disciplina e suas faltas |

### Fachada (gateway)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/api/estudantes/{estudanteId}/resumo` | Junta, numa resposta, as notas e a frequência do estudante |
| GET | `/saude` | Estado do gateway e serviços registrados no Discovery |

### Discovery (`http://localhost:3000`)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/servicos` | Registra ou renova uma instância `{ nome, url }` |
| GET | `/servicos` | Lista os serviços com instâncias ativas |
| GET | `/servicos/{nome}` | Retorna as instâncias ativas de um serviço (404 se não houver) |
| DELETE | `/servicos/{nome}?url=...` | Cancela o registro de uma instância |

## Estrutura

```
discovery/           Discovery (Express)                      package.json, Dockerfile, src/
gateway/             API Gateway, fachada (Express + proxy)   package.json, Dockerfile, src/
servico-notas/       Serviço de Notas (Express + PostgreSQL)  package.json, Dockerfile, src/
servico-frequencia/  Serviço de Frequência (idem)             package.json, Dockerfile, src/
testes/              testes de regras e de integração
docker-compose.yml   sobe os 6 contêineres (só gateway e Discovery com portas expostas)
iniciar.js           sobe tudo sem Docker
demonstracao.js      roteiro de chamadas para apresentação
```
