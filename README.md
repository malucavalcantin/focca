# Focca — migração oficial para focca-edu

Esta versão usa o projeto Firebase **focca-edu** como infraestrutura oficial.

Incluído:
- identidade visual oficial Focca;
- login com Google;
- login/cadastro por e-mail e senha;
- Firestore isolado por usuário;
- matriz-base de Computação;
- dashboard/hub universitário;
- notas, faltas, atividades e horários;
- gráficos e cards;
- Cardápio do RU/Portal/AVA/Calendário configuráveis;
- integração com Google Agenda mantida no código.

## Deploy
```bash
firebase login
firebase use focca-edu
firebase deploy --only hosting,firestore:rules
```

## Google Agenda
O Firebase já está migrado, mas o OAuth do Google Agenda precisa de um novo Client ID para o domínio oficial do Focca.
Depois de criar/configurar esse OAuth Client no Google Cloud, cole o valor em:
`public/firebase-config.js` → `GOOGLE_CLIENT_ID`.

Até isso ser feito, o restante do aplicativo funciona normalmente.


## v6.1 — UFRPE / Computação
- Perfil acadêmico fixo: UFRPE + Computação.
- Removidos campos editáveis de instituição e curso.
- SIGAA fixo: https://sigs.ufrpe.br/sigaa/verTelaLogin.do
- Ambiente Virtual fixo: https://ava.ufrpe.br/login/index.php
- Cardápio do RU fixo: https://www.instagram.com/progestiru/
- Calendário acadêmico 2026 vem preenchido e pode ser alterado nas Configurações.


## v6.2 — correção da autenticação
- Restaurado o fluxo de autenticação baseado na versão focca-estavel.
- Login Google usa `signInWithPopup`, como no projeto original funcional.
- Login e cadastro com e-mail/senha foram isolados em `public/auth-ui.js`.
- Os botões "Criar conta" e "Entrar" não dependem mais do bootstrap do dashboard para funcionar.
- Mensagens específicas para domínio não autorizado, provedor não habilitado e pop-up bloqueado.
- Mantidos Firebase `focca-edu`, UFRPE e Computação.


## v6.4
- Correção: autenticação preservada exatamente a partir da v6.2 estável.
- Removido o selo de versão do cabeçalho.
- Horários editáveis.
- Ficha completa de disciplina com professor, e-mail, perfil do professor, sala, sala virtual, plataforma, turma e observações.


## Modernização segura
- Mantida a base estável e sua autenticação.
- Menu lateral recolhível no desktop, com preferência salva no navegador.
- Menu lateral deslizante com backdrop no mobile.
- Navegação e atalhos com emojis modernos.
- Atalhos rápidos para SIGAA, AVA e RU abrem diretamente os serviços oficiais.
- Dashboard ganhou ações rápidas clicáveis.
- Revisão geral de espaçamento, hover, foco, cards e formulários.
- Layout mobile reforçado para dashboard, matriz, cards, modais e navegação.


## v6.6 — Dark Mode
- Dark mode redesenhado com fundo mais escuro e cards claramente separados.
- Contraste reforçado de textos secundários, bordas, formulários e placeholders.
- Estados de disciplinas ajustados para manter distinção visual no escuro.
- Horários, gráficos, modais, sidebar, login e atalhos da Universidade revisados.
- Mantida a base estável da v6.5 e a autenticação sem alterações.


## v6.7 — Hub Plus
- Emojis modernizados em toda a área Universidade.
- Busca global por disciplina, professor, tarefa, sala e horário.
- Central de notificações com prazos próximos/atrasados e resumo de faltas registradas.
- Card "Hoje" com aulas e entregas do dia.
- Favoritos em disciplinas.
- Gráfico de evolução das notas.
- Gráfico de faltas registradas por disciplina.
- Visão 360 da disciplina dentro da ficha existente.
- Dashboard personalizável: ocultar widgets e arrastar cards principais para reordenar.
- Mantida a autenticação da base estável.


## v6.8 — Disciplinas atuais
- A tela `Disciplinas` agora mostra exclusivamente componentes com status `Cursando`.
- Matriz curricular continua sendo o local para ver concluídas, pendentes, reprovadas e toda a trajetória.
- Navegação renomeada para `Disciplinas atuais`.
- Resumo do semestre com quantidade de disciplinas, carga horária e favoritas.
- Busca limitada às matérias atuais, incluindo busca pelo nome do professor.
- Filtro rápido de favoritas atuais.
- Estado vazio com ação direta para configurar o semestre.
- Atalho para abrir a Matriz ao fim da tela.
- Layout responsivo revisado para celular.


## v6.9 — Disciplinas = semestre atual
- A aba Disciplinas agora é exclusivamente a visão das disciplinas com status Cursando.
- Removidos filtros Todas / Pendentes / Concluídas dessa tela.
- Removido o botão Nova disciplina dessa tela.
- A matriz curricular continua sendo o local para visualizar toda a graduação.
- Configurar semestre atual define quais componentes aparecem em Disciplinas.


## v7.0 — UX upgrade seguro
- Dark mode revisado novamente com hierarquia mais clara entre fundo, cards e disciplinas.
- Botão de recolher a sidebar movido para uma aba discreta na borda do menu.
- Nova central `Hoje` com cronologia, próxima aula, entregas, alertas e próximos 7 dias.
- Nova página 360º para disciplinas atuais.
- Cards de disciplinas agora abrem a página 360º; edição continua disponível por dentro dela.
- Command Center global (+) para atividade, nota, falta, horários, semestre e busca.
- Navegação inferior no mobile: Hoje, Disciplinas, Agenda, Matriz e Mais.
- Melhorias adicionais de contraste e responsividade.
- Base Firebase, autenticação e estrutura de dados preservadas.


## v7.0.1 — correção de login
- Corrigido erro de inicialização que impedia `watchAuth()` de ser registrado.
- A página Disciplina 360º agora está presente no HTML.
- Handlers dos recursos novos foram protegidos para que um componente ausente nunca bloqueie a autenticação.
- Fluxo de login Google / e-mail continua sendo exatamente o da base estável.


## v7.0.2 — Dark mode contrast
- Contraste tipográfico reforçado em toda a interface.
- Textos principais passam a usar branco real.
- Textos secundários usam cinza-azulado mais claro.
- Badges, botões, formulários, placeholders, tabelas, horários e cards revisados.
- Página 360º, Universidade, Hoje e Disciplinas atuais receberam ajustes específicos.
- Nenhuma alteração na autenticação ou lógica funcional.


## v7.1 — Interface Refresh
- Novo Semester Ring para visualizar progresso da graduação.
- Nova Semana Focca dentro da central Hoje.
- Perfil acadêmico visual em Configurações.
- Cards de disciplinas atuais com hierarquia mais moderna.
- Microinterações e hover mais suaves.
- Command Center refinado.
- Dark mode e mobile adaptados aos novos componentes.
- Firebase, autenticação e integração Google Agenda preservados.


## v7.2 — Mobile First
- Atualização focada exclusivamente em responsividade e experiência mobile.
- Corrigidos cortes e overflow horizontal.
- Cards principais passam para uma coluna em telas pequenas.
- Central Hoje reorganizada para celular.
- Semana Focca agora usa swipe horizontal controlado.
- Semester Ring redesenhado para não ficar espremido.
- Disciplina 360º reorganizada para telas estreitas.
- Matriz e horários protegidos contra corte lateral.
- Modais viram bottom sheets no mobile.
- Command Center otimizado para toque.
- Sidebar mobile corrigida e independente do estado recolhido do desktop.
- Barra inferior e botão + respeitam safe-area.
- Melhorias específicas para celulares abaixo de 430px.
- Nenhuma alteração em Firebase, autenticação ou Google Agenda.


## v8.1 — Study Hub corrigido
- Modo Foco, Materiais e Minha Graduação agora aparecem no menu lateral.
- Ações também adicionadas ao Command Center.
- Corrigido o card Próxima aula para evitar sobreposição de horário e nome da disciplina.
- Implementação refeita sobre a v7.2 estável.
- Auth e Google Agenda não foram alterados.
- Sessões e materiais ainda usam localStorage nesta etapa.


## v8.2 — Study Hub visível
- Corrigido bug em que Modo Foco, Materiais e Minha Graduação apareciam no menu, mas as sections correspondentes não existiam no HTML.
- O JavaScript e o CSS desses módulos já existiam; agora as telas reais foram inseridas.
- Mantidas autenticação, Firebase e integração Google Agenda.


## v8.3 — Materiais e regras de aprovação
- Tela Materiais corrigida: busca, filtro de disciplina e tipo separados.
- Estado vazio redesenhado.
- Calculadora de aprovação adicionada em Notas.
- Média inicial = (1ª VA + 2ª VA) / 2; aprovação direta com média >= 7.
- 3ª VA substitui a menor entre 1ª e 2ª VA somente se for maior.
- Se a nova média continuar abaixo de 7, o aluno vai para Final.
- Na Final: média final = (média anterior + nota da Final) / 2; aprovação com média final >= 5.
- App informa automaticamente nota mínima necessária na 3ª VA e na Final.


## v9 — Experience Update
- Home dinâmica conforme horário e proximidade da próxima aula.
- Matriz com modos Visual e Lista.
- Disciplina 360º com abas: Visão geral, Notas, Faltas e Materiais.
- Modo Foco fullscreen, sem distrações.
- Melhor hierarquia de superfícies e dark mode refinado.
- Melhorias mobile específicas para os novos componentes.
- Sem alterações em Firebase Auth ou Google Agenda.


## v9.1 — Theme e logout no topo
- Botão de modo escuro removido da sidebar.
- Botão Sair removido da sidebar.
- Ambos foram movidos para a topbar, ao lado das ações da conta.
- Sidebar fica livre para navegação mesmo quando a lista de módulos cresce.
- Responsividade mobile preservada.


## v9.5 — UI Refinement
- Sidebar reorganizada em grupos: Meu dia, Acadêmico, Estudos e Focca.
- Topbar contextual com seção atual.
- Cards de disciplinas ganharam accent color discreto.
- Materiais agora alterna entre Cards e Lista.
- Nova área de preferências de interface em Configurações.
- Menos sombras/bordas pesadas para reduzir aparência de painel administrativo.
- Utilitário visual de skeleton loading preparado.
- Melhorias específicas de dark mode e mobile.
- Autenticação, Firebase e Google Agenda preservados.


## v9.6 — Sidebar Fix
- Sidebar agora rola internamente e não corta os últimos itens.
- Estado recolhido reduzido para 72px e com ícones/spacing mais compactos.
- Botão de recolher virou controle pequeno e embutido, sem a aba branca protuberante.
- Layout se adapta automaticamente a monitores com pouca altura.
- Mobile mantém drawer completo e não usa botão de recolher.


## v9.7 — Visual Test
Pacote visual pequeno criado diretamente sobre a v9.6 enviada pelo usuário.

Alterações:
1. Home/Hoje com hero mais moderno e identidade Focca.
2. Cards com menos aparência de dashboard administrativo.
3. Disciplinas atuais com hierarquia e destaque visual melhores.
4. Topbar/sidebar refinadas, incluindo recolhimento mais discreto.
5. Ajustes específicos de leitura e espaçamento no mobile e dark mode.

Segurança:
- Alteração CSS-only.
- app.js não alterado.
- auth-ui.js não alterado.
- firebase-service.js não alterado.
- firebase-config.js não alterado.
- calendar.js não alterado.


## Testes
Os cálculos acadêmicos (progresso, médias, aprovação e próxima aula) ficam em
`public/academic.js` e têm testes em `tests/`. Para rodar (Node 22 ou mais novo):
```bash
npm test
```
