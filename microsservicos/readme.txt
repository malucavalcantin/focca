FOCCA EM MICROSSERVIÇOS - INSTRUÇÕES DE EXECUÇÃO
================================================

Componentes:
  - Discovery (Service Discovery) ............ pasta discovery/            porta 3000
  - API Gateway Focca (fachada) .............. pasta gateway/              porta 8080
  - Serviço de Autenticação .................. pasta servico-autenticacao/ (interna 3003)
  - Serviço de Notas ......................... pasta servico-notas/        (interna 3001)
  - Serviço de Frequência .................... pasta servico-frequencia/   (interna 3002)
  - Serviço de Agenda Acadêmica .............. pasta servico-agenda/       (interna 3004)
  - Serviço de Semestre e Matriz Curricular .. pasta servico-semestre/     (interna 3005)
  - Um banco PostgreSQL 17 para cada serviço (db-autenticacao, db-notas,
    db-frequencia, db-agenda, db-semestre)

Só o gateway (8080) e o Discovery (3000) ficam acessíveis fora do Docker.


1. EXECUTAR COM DOCKER (RECOMENDADO)
------------------------------------

Requisito: Docker com Docker Compose (Docker Desktop no Windows/macOS).

  1) Abra um terminal na pasta microsservicos/ (onde está o docker-compose.yml).

  2) Suba tudo (12 contêineres):

       docker compose up --build

     A ordem de subida é controlada por healthchecks: bancos e Discovery,
     depois os cinco serviços, por último o gateway. Aguarde o gateway subir.

  3) Confira em outro terminal ou no navegador:

       http://localhost:8080/saude      -> estado do gateway e serviços registrados
       http://localhost:3000/servicos   -> serviços registrados no Discovery

     Para ver os contêineres:

       docker compose ps

  4) (Opcional, precisa do Node.js 22.13+) Demonstração que cria uma conta,
     faz login e usa todos os serviços pelo gateway:

       npm run demo

  5) (Opcional) Ver os dados no banco de um serviço, por exemplo:

       docker compose exec db-notas psql -U servico_notas -d notas -c "SELECT * FROM avaliacoes;"

  6) Encerrar:

       docker compose down          (mantém os dados dos bancos)
       docker compose down -v       (apaga também os bancos)

Observação: no docker-compose.yml o login com Google e o Google Agenda estão
em modo simulado (AUTENTICACAO_GOOGLE=simulado e AGENDA_GOOGLE=simulado),
para demonstrar sem conta Google.


2. EXECUTAR SEM DOCKER (DESENVOLVIMENTO)
----------------------------------------

Requisito: Node.js 22.13 ou mais recente.

  1) Na pasta microsservicos/, instale as dependências (instala cada
     componente na sua própria pasta):

       npm install

  2) Suba todos os componentes, cada um em seu processo:

       npm start

     Sem Docker, cada serviço usa um arquivo SQLite próprio em
     servico-*/dados/. Para os modos simulados do Google, defina antes as
     variáveis AUTENTICACAO_GOOGLE=simulado e AGENDA_GOOGLE=simulado.

  3) Encerrar: Ctrl+C.


3. TESTES AUTOMATIZADOS
-----------------------

Na pasta microsservicos/ (depois do npm install):

       npm test

São 23 testes: regras de negócio e testes de integração ponta a ponta
pelo gateway, com login.


4. COMO USAR A API
------------------

Todas as chamadas passam pelo gateway: http://localhost:8080

  - Criar conta:  POST /api/autenticacao/contas   { "nome", "email", "senha" }
  - Entrar:       POST /api/autenticacao/sessoes  { "email", "senha" }
                  -> devolve { "token", "usuario": { "id", ... } }

Nas demais rotas envie o cabeçalho:  Authorization: Bearer <token>
Cada estudante só acessa os próprios dados (/estudantes/<seu id>/...).

  /api/semestre/...    Semestre e Matriz Curricular
  /api/notas/...       Notas
  /api/frequencia/...  Frequência
  /api/agenda/...      Agenda Acadêmica
  /api/estudantes/<id>/resumo   fachada: junta semestre, notas, frequência e agenda

A lista completa de rotas está no README.md, seção "API".
