export const COMPUTACAO_BASE_MATRIX = [
  {name:'Fundamentos da Educação',hours:60,period:'1',type:'mandatory'},
  {name:'Psicologia I',hours:60,period:'1',type:'mandatory'},
  {name:'Produção de Textos Acadêmicos I',hours:60,period:'1',type:'mandatory'},
  {name:'Matemática Discreta I',hours:60,period:'1',type:'mandatory'},
  {name:'Pensamento Computacional',hours:60,period:'1',type:'mandatory'},
  {name:'Introdução a Ambientes Virtuais de Aprendizagem',hours:30,period:'1',type:'mandatory'},

  {name:'Educação Brasileira: Legislação, Organização e Políticas',hours:60,period:'2',type:'mandatory'},
  {name:'Psicologia II',hours:60,period:'2',type:'mandatory'},
  {name:'Cálculo NI',hours:60,period:'2',type:'mandatory'},
  {name:'Matemática Discreta II',hours:60,period:'2',type:'mandatory'},
  {name:'Programação I',hours:60,period:'2',type:'mandatory'},
  {name:'Laboratório de Programação I',hours:30,period:'2',type:'mandatory'},

  {name:'Didática',hours:60,period:'3',type:'mandatory'},
  {name:'Algoritmos e Estruturas de Dados',hours:60,period:'3',type:'mandatory'},
  {name:'Cálculo NII',hours:60,period:'3',type:'mandatory'},
  {name:'Circuitos Digitais',hours:60,period:'3',type:'mandatory'},
  {name:'Programação II',hours:60,period:'3',type:'mandatory'},
  {name:'Laboratório de Programação II',hours:30,period:'3',type:'mandatory'},

  {name:'Metodologia do Ensino da Computação',hours:60,period:'4',type:'mandatory'},
  {name:'Banco de Dados I',hours:60,period:'4',type:'mandatory'},
  {name:'Estatística Exploratória I',hours:60,period:'4',type:'mandatory'},
  {name:'Arquitetura e Organização de Computadores',hours:60,period:'4',type:'mandatory'},
  {name:'Teoria da Computação',hours:60,period:'4',type:'mandatory'},
  {name:'Aspectos Humanos e Sociais na Computação',hours:60,period:'4',type:'mandatory'},

  {name:'Prática de Ensino de Computação I',hours:60,period:'5',type:'mandatory'},
  {name:'Redes de Computadores',hours:60,period:'5',type:'mandatory'},
  {name:'Álgebra Linear NI',hours:60,period:'5',type:'mandatory'},
  {name:'Sistemas Operacionais',hours:60,period:'5',type:'mandatory'},
  {name:'Engenharia de Software',hours:60,period:'5',type:'mandatory'},
  {name:'Metodologia Científica Aplicada à Computação',hours:60,period:'5',type:'mandatory'},

  {name:'Prática de Ensino de Computação II',hours:60,period:'6',type:'mandatory'},
  {name:'Estágio Supervisionado Obrigatório I',hours:90,period:'6',type:'internship'},
  {name:'Tecnologias na Educação',hours:60,period:'6',type:'mandatory'},
  {name:'Interação Homem-Máquina',hours:60,period:'6',type:'mandatory'},
  {name:'Inteligência Artificial',hours:60,period:'6',type:'mandatory'},
  {name:'Optativa 1',hours:60,period:'6',type:'elective'},

  {name:'Educação a Distância',hours:60,period:'7',type:'mandatory'},
  {name:'Estágio Supervisionado Obrigatório II',hours:90,period:'7',type:'internship'},
  {name:'Educação para as Relações Étnico-Raciais',hours:60,period:'7',type:'mandatory'},
  {name:'Optativa 2',hours:60,period:'7',type:'elective'},
  {name:'Optativa 3',hours:60,period:'7',type:'elective'},

  {name:'Estágio Supervisionado Obrigatório III',hours:90,period:'8',type:'internship'},
  {name:'Libras',hours:60,period:'8',type:'mandatory'},
  {name:'Projeto de Desenvolvimento de Software Educacional',hours:60,period:'8',type:'mandatory'},
  {name:'Optativa 4',hours:60,period:'8',type:'elective'},
  {name:'Optativa 5',hours:60,period:'8',type:'elective'},

  {name:'Estágio Supervisionado Obrigatório IV',hours:135,period:'9',type:'internship'},
  {name:'Trabalho de Conclusão de Curso',hours:60,period:'9',type:'tcc'},
  {name:'Optativa 6',hours:60,period:'9',type:'elective'}
].map((s, index) => ({...s, code:'', status:'pending', baseOrder:index+1}));

export const COMPUTACAO_REQUIREMENTS = {
  complementaryHours: 210,
  internshipHours: 405,
  electiveHours: 360,
  enade: true
};
