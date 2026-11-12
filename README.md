# Focca

Hub universitário para estudantes de Computação da UFRPE. Em um só lugar, o Focca reúne a matriz curricular, as disciplinas do semestre, as notas, as faltas, as atividades, os horários e os links da universidade. Ele também calcula a situação acadêmica e a frequência de cada disciplina.

## Funcionalidades

- **Conta e acesso:** login com Google ou com e-mail e senha. Os dados de cada estudante ficam isolados no Firestore.
- **Hoje:** visão do dia com a próxima aula, as entregas, os alertas e os próximos 7 dias.
- **Matriz curricular:**
  - Importação a partir de PDF ou imagem, ou uso da matriz base de Computação.
  - Visualização por período, em modo visual ou em lista.
- **Disciplinas atuais:** as disciplinas do semestre, cada uma com uma página própria de visão geral, notas, faltas e materiais.
- **Notas:**
  - Lançamento de VA1, VA2, 3ª VA e Final, com a regra de aprovação da UFRPE.
  - Aprovação direta com média maior ou igual a 7.
  - A 3ª VA substitui a menor nota, se for maior.
  - Na Final, a média (anterior + Final) / 2 precisa ser maior ou igual a 5.
  - O app mostra a nota mínima necessária em cada etapa.
- **Faltas:** registro por data e limite de 25% da carga horária. Cada disciplina mostra quantas faltas ainda cabem, com níveis Tranquilo, Atenção e Risco.
- **Agenda e horários:**
  - Atividades com prazo e horários semanais editáveis.
  - Sincronização com o Google Agenda: atividades viram eventos e aulas viram eventos semanais.
- **Minha Graduação:** progresso da carga horária e CRA ponderado pela carga horária, com projeção e meta.
- **Estudos:** Modo Foco e organização de materiais por disciplina.
- **Universidade:** atalhos para o SIGAA, o AVA, o cardápio do RU e o calendário acadêmico.
- **Interface:**
  - Busca global e central de ações rápidas (+).
  - Tema claro e escuro, que segue o aparelho.
  - Layout pensado para celular e para desktop.

## Tecnologias

- HTML, CSS e JavaScript (módulos ES), sem framework.
- Firebase Authentication e Cloud Firestore.
- Firebase Hosting.
- Google Calendar API, com OAuth no navegador.
- Testes com `node:test`.

## Estrutura

```
public/
  index.html            telas do app
  styles.css            estilos (tema claro e escuro)
  app.js                interface e fluxo das telas
  academic.js           cálculos acadêmicos (progresso, aprovação, faltas, CRA)
  auth-ui.js            login e cadastro
  firebase-config.js    configuração do Firebase e do Google Agenda
  firebase-service.js   leitura e gravação no Firestore
  calendar.js           integração com o Google Agenda
  calendar-events.js    montagem dos eventos da agenda
  matrix-parser.js      leitura da matriz curricular a partir de PDF ou imagem
  base-matrix.js        matriz base de Computação
tests/                  testes dos cálculos acadêmicos e da agenda
microsservicos/         Serviço de Notas e Serviço de Frequência (ver abaixo)
firestore.rules         regras de acesso do Firestore
```

## Como publicar

```bash
firebase login
firebase use focca-edu
firebase deploy --only hosting,firestore:rules
```

O Client ID OAuth do Google Agenda fica em `public/firebase-config.js` (`GOOGLE_CLIENT_ID`).

## Testes

Requisito: Node 22 ou mais recente.

```bash
npm test
```

## Microsserviços
A pasta `microsservicos/` tem todos os serviços do Focca como microsserviços em Node.js (Express): Autenticação, Semestre e Matriz Curricular, Notas, Frequência e Agenda Acadêmica, com API Gateway e Discovery. Cada serviço tem o seu próprio banco PostgreSQL. Veja `microsservicos/README.md` para executar. Essa pasta não entra no Firebase Hosting, que publica só `public/`.
