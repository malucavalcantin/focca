# Focca: Entrega Parcial 2 (microsserviços)

Implementação de dois microsserviços do Focca, o **Serviço de Notas** e o **Serviço de Frequência**. Eles seguem o diagrama de componentes dos serviços (arquivo `Focca_Servicos_Casos_de_Uso_e_Componentes.asta`). Junto com eles vão o **API Gateway Focca** e o **Serviço de Descoberta**, que fazem os serviços funcionarem como no modelo.

Tecnologia: **JavaScript (Node.js)**, sem nenhuma biblioteca externa. Usa só os módulos nativos `node:http` e `node:sqlite`, e `node:test` nos testes. Não é preciso rodar `npm install`.

## Arquitetura

```
 Cliente ──► API Gateway Focca (8080) ──► Serviço de Notas (3001) ──► notas.db
                    │                 └─► Serviço de Frequência (3002) ──► frequencia.db
                    ▼                          │
          Serviço de Descoberta (3000) ◄───────┘  (cada serviço se registra ao iniciar)
```

| Componente do modelo | Pasta | Interface |
|---|---|---|
| API Gateway Focca «API gateway» | `gateway/` | IApiGateway |
| Serviço de Descoberta «discovery» | `descoberta/` | IRegistroServicos |
| Serviço de Notas «serviço» + BD Notas | `servico-notas/` | IServicoNotas |
| Serviço de Frequência «serviço» + BD Frequência | `servico-frequencia/` | IServicoFrequencia |
| Validação «global» | `compartilhado/validacao.js` | usada por todos |

Decisões principais:

- **Cada serviço tem seu próprio processo, sua porta e seu banco** (*database per service*). Notas grava em `servico-notas/dados/notas.db` e Frequência em `servico-frequencia/dados/frequencia.db`. Um serviço nunca acessa o banco do outro.
- **O cliente só fala com o gateway.** Uma chamada a `/api/<serviço>/...` faz o gateway perguntar à descoberta onde está uma instância ativa do serviço. Se houver mais de uma, ele escolhe em rodízio (*round-robin*) e encaminha a chamada. A resposta traz o cabeçalho `X-Servico-Atendente` dizendo qual instância atendeu.
- **Registro com expiração.** Cada serviço se registra na descoberta ao iniciar e renova o registro a cada 10 s. Um serviço que cai sai da lista depois de 30 s. Se não há instância ativa, o gateway responde 503.
- **Regras de negócio.** Seguem a mesma regra do app web (`public/academic.js`) e ficam dentro de cada serviço:
  - `servico-notas/src/regras.js` contém a EstrategiaCalculoNotas, com a regra da UFRPE para VA1, VA2, 3ª VA e Final.
  - `servico-frequencia/src/regras.js` contém o resumo de frequência, com limite de 25% da carga horária.

## Como executar

Requisito: **Node.js 22.13 ou mais recente** (testado no Node 24).

```bash
npm start
```

Esse comando sobe os quatro componentes, cada um em seu processo. Para encerrar, use Ctrl+C. Também dá para subir cada um separadamente, em terminais diferentes: `npm run descoberta`, `npm run notas`, `npm run frequencia` e `npm run gateway`.

Com tudo no ar, rode em outro terminal o roteiro de demonstração. Ele faz chamadas reais pelo gateway e mostra as respostas:

```bash
npm run demo
```

Testes automatizados (16 testes, incluindo ponta a ponta pelo gateway):

```bash
npm test
```

Variáveis de ambiente opcionais: `PORTA`, `BD` (caminho do banco, ou `:memory:`), `DESCOBERTA_URL` e `HOST`.

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

- `GET /saude` no gateway mostra o estado da descoberta e os serviços registrados.
- `GET http://localhost:3000/servicos` lista as instâncias registradas diretamente na descoberta.

Exemplo com curl:

```bash
curl -X PUT http://localhost:8080/api/notas/estudantes/maria/disciplinas/apsoo/notas -H "Content-Type: application/json" -d "{\"va1\": 5, \"va2\": 6, \"va3\": 8}"
```

## Estrutura

```
compartilhado/       utilitários HTTP, validação (componente global) e cliente de registro
descoberta/src/      Serviço de Descoberta
gateway/src/         API Gateway Focca
servico-notas/src/   app.js (rotas), regras.js (cálculo), repositorio.js (SQLite), index.js
servico-frequencia/src/  mesma organização
testes/              testes de regras e de integração
iniciar.js           sobe todos os componentes
demonstracao.js      roteiro de chamadas para apresentação
```
