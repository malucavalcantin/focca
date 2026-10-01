import { finishRedirectLogin, watchAuth, logout, getProfile, saveProfile, listSubjects, createSubject, updateSubject, removeSubject, replaceSubjects, listTasks, createTask, updateTask, removeTask, listSchedule, saveScheduleItem, removeScheduleItem, listAbsences, addAbsence, removeAbsence, listAssessments, saveAssessment, removeAssessment, listSubjectSettings, saveSubjectSetting } from './firebase-service.js?v=20260825-auth62';
import { createCalendarEvent } from './calendar.js?v=20260825-auth62';
import { COMPUTACAO_BASE_MATRIX } from './base-matrix.js?v=20260825-auth62';
import { DONE_STATUSES, calcProgress, countStatuses, subjectAverage, percentLabel, approvalSituation, findNextClass } from './academic.js?v=20261001';

const $=id=>document.getElementById(id);
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const state={user:null,profile:null,subjects:[],tasks:[],schedule:[],absences:[],assessments:[],settings:[],filter:'current',currentFavoritesOnly:false,selectedSubjectId:null};
const statusMeta={pending:['Pendente','pending'],current:['Cursando','current'],approved:['Aprovada','done'],approved_final:['Aprovada na final','final'],failed:['Reprovada','failed'],withdrawn:['Trancada','withdrawn'],exempt:['Dispensada','done']};
const doneStatuses=DONE_STATUSES;
const viewTitles={today:'Hoje',dashboard:'Visão geral',curriculum:'Minha matriz',subjects:'Disciplinas atuais','subject-detail':'Disciplina 360º',study:'Modo Foco',materials:'Materiais',degree:'Minha Graduação',grades:'Notas',attendance:'Faltas',agenda:'Agenda',schedule:'Horários',university:'Universidade',settings:'Configurações'};

function toast(msg,error=false){const el=$('toast');el.textContent=msg;el.className=`toast show${error?' error':''}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3500)}
function openModal(id){$(id).classList.remove('hidden')}
function closeModal(id){$(id).classList.add('hidden')}
function fmtDate(v){return new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
function jump(view){const nav=document.querySelector(`.nav-item[data-view="${view}"]`);if(nav)nav.click();else activateView(view)}
function currentSubjects(){return state.subjects.filter(s=>s.status==='current')}
function progress(){return calcProgress(state.subjects)}


function activateView(view,title=null){
  updateTopbarContext(view);
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
  const target=$(`view-${view}`);
  if(target)target.classList.add('active-view');
  $('viewTitle').textContent=title||viewTitles[view]||'Focca';
  document.querySelectorAll('[data-mobile-view]').forEach(b=>b.classList.toggle('active',b.dataset.mobileView===view));
  window.scrollTo({top:0,behavior:'smooth'});
}

function setupNav(){
  const sidebar=$('sidebar'),backdrop=$('sidebarBackdrop'),collapse=$('collapseSidebarBtn');
  const isMobile=()=>window.matchMedia('(max-width:760px)').matches;
  const closeMobileMenu=()=>{sidebar.classList.remove('open');backdrop?.classList.add('hidden')};
  const openMobileMenu=()=>{sidebar.classList.add('open');backdrop?.classList.remove('hidden')};

  const savedCollapsed=localStorage.getItem('focca-sidebar-collapsed')==='1';
  if(savedCollapsed&&!isMobile())document.body.classList.add('sidebar-collapsed');

  document.querySelectorAll('.nav-item').forEach(btn=>btn.onclick=()=>{
    activateView(btn.dataset.view);
    if(btn.dataset.view==='today')renderTodayHub();
    if(isMobile())closeMobileMenu();
  });

  $('menuBtn').onclick=()=>sidebar.classList.contains('open')?closeMobileMenu():openMobileMenu();
  backdrop.onclick=closeMobileMenu;

  collapse.onclick=()=>{
    if(isMobile()){closeMobileMenu();return}
    const collapsed=document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('focca-sidebar-collapsed',collapsed?'1':'0');
    collapse.querySelector('span').textContent=collapsed?'›':'‹';
    collapse.setAttribute('aria-label',collapsed?'Expandir menu':'Recolher menu');
    collapse.title=collapsed?'Expandir menu':'Recolher menu';
  };
  collapse.querySelector('span').textContent=document.body.classList.contains('sidebar-collapsed')?'›':'‹';

  document.querySelectorAll('[data-mobile-view]').forEach(btn=>btn.onclick=()=>{
    activateView(btn.dataset.mobileView);
    if(btn.dataset.mobileView==='today')renderTodayHub();
    closeMobileMenu();
  });
  $('mobileMoreBtn').onclick=openMobileMenu;

  window.addEventListener('resize',()=>{
    if(!isMobile()){closeMobileMenu();backdrop.classList.add('hidden')}
  });

  document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>jump(b.dataset.jump));
}
function setupModals(){document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));document.querySelectorAll('.modal').forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.add('hidden')})}

function renderHeader(){
  const p=state.profile||{};
  $('userName').textContent=p.displayName||state.user?.displayName||'Estudante';
  $('userEmail').textContent=state.user?.email||'';
  $('courseEyebrow').textContent='COMPUTAÇÃO · UFRPE';
  $('termLabel').textContent=p.currentTerm||'Seu período';
  $('dashboardTitle').textContent=`Olá, ${esc((p.displayName||state.user?.displayName||'estudante').split(' ')[0])}!`;
  $('dashboardSubtitle').textContent='Seu hub de Computação na UFRPE.';
  $('matrixCourseTitle').textContent='Computação · UFRPE';
  if(state.user?.photoURL){$('userPhoto').src=state.user.photoURL;$('userPhoto').classList.remove('hidden')}
}
function statusCounts(){return countStatuses(state.subjects)}
function currentAverage(subjectId){return subjectAverage(state.assessments,subjectId)}
function renderPeriodChart(){const root=$('periodChart');if(!root)return;const periods=[...new Set(state.subjects.map(s=>s.period).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));root.innerHTML=periods.map(period=>{const list=state.subjects.filter(s=>s.period===period);const total=list.reduce((a,s)=>a+Number(s.hours||0),0);const done=list.filter(s=>doneStatuses.has(s.status)).reduce((a,s)=>a+Number(s.hours||0),0);const pct=total?done/total*100:0;return `<button class="period-bar-item" data-jump="curriculum"><div class="period-bar-meta"><b>${esc(period)}º</b><span>${Math.round(pct)}%</span></div><div class="period-bar-track"><i style="height:${Math.max(5,pct)}%"></i></div></button>`}).join('')}
function renderStatusChart(p){const c=statusCounts(),total=Math.max(1,c.done+c.current+c.failed+c.pending);const d=c.done/total*100,cu=c.current/total*100,f=c.failed/total*100;const donut=$('statusDonut');if(donut)donut.style.background=`conic-gradient(var(--done) 0 ${d}%,var(--current) ${d}% ${d+cu}%,var(--failed) ${d+cu}% ${d+cu+f}%,var(--pending) ${d+cu+f}% 100%)`;if($('donutCenter'))$('donutCenter').textContent=percentLabel(p.pct);if($('statusLegend'))$('statusLegend').innerHTML=[['Concluídas',c.done,'done'],['Cursando',c.current,'current'],['Pendentes',c.pending,'pending'],['Reprovadas',c.failed,'failed']].map(x=>`<div><span><i class="dot ${x[2]}"></i>${x[0]}</span><b>${x[1]}</b></div>`).join('')}
function renderGradeChart(){const root=$('gradeChart');if(!root)return;const curr=currentSubjects();root.innerHTML=curr.length?curr.map(s=>{const avg=currentAverage(s.id);return `<button class="grade-row" data-jump="grades"><div><b>${esc(s.name)}</b><span>${avg==null?'Sem notas lançadas':`${avg.toFixed(1).replace('.',',')} de 10`}</span></div><div class="grade-track"><i style="width:${avg==null?0:Math.max(0,Math.min(100,avg*10))}%"></i></div></button>`}).join(''):'<div class="empty-state">Marque as disciplinas do semestre para acompanhar suas médias.</div>'}
function resolveScheduleSubject(x){const direct=state.subjects.find(v=>v.id===x.subjectId);if(direct)return direct;if(x.subjectName){const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');return state.subjects.find(v=>norm(v.name)===norm(x.subjectName))||{name:x.subjectName,id:x.subjectId}}return null}
function nextClass(){const next=findNextClass(state.schedule);return next?{...next,subject:resolveScheduleSubject(next.item)}:null}
function renderDashboard(){const p=progress(),counts=statusCounts();if(!$('overallPercent'))return;$('overallPercent').textContent=percentLabel(p.pct);$('overallBar').style.width=`${Math.min(100,p.pct)}%`;$('overallHours').textContent=`${p.done} / ${p.total} h`;$('doneCount').textContent=counts.done;$('currentCount').textContent=counts.current;$('pendingTaskCount').textContent=state.tasks.filter(t=>!t.completed).length;$('projectedPercent').textContent=percentLabel(p.projectedPct);$('projectedBar').style.width=`${Math.min(100,p.projectedPct)}%`;$('projectionText').textContent=p.total?`Você chegaria a ${p.projected} de ${p.total} horas concluídas.`:'Configure sua matriz para ver a projeção.';const curr=currentSubjects();$('currentPreview').innerHTML=curr.length?curr.map(subjectCard).join(''):'<div class="empty-state">Nenhuma disciplina marcada como cursando.</div>';renderPeriodChart();renderStatusChart(p);renderGradeChart();const nc=nextClass();$('nextClassPreview').innerHTML=nc?`<div class="next-class-time">${nc.item.start}</div><div class="next-class-copy"><span>${nc.date.toLocaleDateString('pt-BR',{weekday:'long'})}</span><h4>${esc(nc.subject?.name||nc.item.subjectName||'Disciplina')}</h4><p>${esc(nc.item.location||'Local não informado')} · ${nc.item.start}–${nc.item.end}</p></div>`:'<div class="empty-state">Nenhuma aula futura cadastrada.</div>';const tasks=state.tasks.filter(t=>!t.completed).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)).slice(0,4);$('dashboardTaskList').innerHTML=tasks.length?tasks.map(t=>`<button class="mini-task" data-jump="agenda"><span>${new Date(t.dueAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span><div><b>${esc(t.title)}</b><small>${esc(t.subjectName||'Atividade')}</small></div></button>`).join(''):'<div class="empty-state">Nenhuma atividade pendente.</div>';renderTodayOverview();renderTodayHub();renderInterfaceRefresh();renderStudyHub();renderDynamicHome();renderNotifications();applyDashboardPreferences();setupWidgetDrag()}
function subjectCard(s){const [label,cls]=statusMeta[s.status]||statusMeta.pending;const accents=['#6c5bff','#5b9dff','#45c49a','#f0a34d','#d87adf','#e76c7c'];const accent=accents[[...(s.name||'')].reduce((a,c)=>a+c.charCodeAt(0),0)%accents.length];return `<article style="--subject-accent:${accent}" class="subject-card ${cls} clickable-subject" data-subject-details="${s.id}"><div class="subject-card-top"><span class="status-pill ${cls}">${label}</span><div class="subject-card-actions"><button class="favorite-btn ${s.favorite?'active':''}" data-favorite-subject="${s.id}" title="Favoritar">${s.favorite?'⭐':'☆'}</button><button class="mini-btn" data-edit-subject="${s.id}">Status</button></div></div><h3>${esc(s.name)}</h3><p>${s.code?esc(s.code)+' · ':''}${Number(s.hours||0)} h${s.period?` · ${esc(s.period)}º período`:''}</p>${s.professor?`<small class="subject-inline-meta">Prof. ${esc(s.professor)}</small>`:''}</article>`}
function openSubjectDetails(id){
  const s=state.subjects.find(x=>x.id===id);
  if(!s)return;
  $('subjectDetailsId').value=s.id;
  $('subjectDetailTitle').textContent=s.name;
  $('subjectDetailMeta').textContent=`${s.period||'—'}º período · ${Number(s.hours||0)} h`;
  $('subjectDetailsName').value=s.name||'';
  $('subjectProfessor').value=s.professor||'';
  $('subjectProfessorEmail').value=s.professorEmail||'';
  $('subjectProfessorNotes').value=s.professorNotes||'';
  $('subjectRoom').value=s.room||'';
  $('subjectVirtualRoom').value=s.virtualRoom||'';
  $('subjectPlatform').value=s.platform||'';
  $('subjectClassCode').value=s.classCode||'';
  $('subjectGeneralNotes').value=s.generalNotes||'';
  renderSubject360(s);
  openModal('subjectDetailsModal');
}

async function saveSubjectDetails(e){
  e.preventDefault();
  const id=$('subjectDetailsId').value;
  if(!id)return;
  await updateSubject(id,{
    name:$('subjectDetailsName').value.trim(),
    professor:$('subjectProfessor').value.trim(),
    professorEmail:$('subjectProfessorEmail').value.trim(),
    professorNotes:$('subjectProfessorNotes').value.trim(),
    room:$('subjectRoom').value.trim(),
    virtualRoom:$('subjectVirtualRoom').value.trim(),
    platform:$('subjectPlatform').value.trim(),
    classCode:$('subjectClassCode').value.trim(),
    generalNotes:$('subjectGeneralNotes').value.trim()
  });
  closeModal('subjectDetailsModal');
  await refreshCore();
  await refreshSchedule();
  toast('Informações da disciplina salvas.');
}

function renderSubjects(){
  const q=($('subjectSearch')?.value||'').toLowerCase().trim();

  // Disciplinas é uma visão exclusiva do semestre atual.
  // A matriz curricular continua sendo a visão completa da graduação.
  const current=state.subjects.filter(s=>s.status==='current');

  let list=current.filter(s=>{
    const haystack=[
      s.name,
      s.code,
      s.professor,
      s.professorEmail,
      s.room,
      s.classCode
    ].filter(Boolean).join(' ').toLowerCase();
    return !q || haystack.includes(q);
  });

  if(state.currentFavoritesOnly){
    list=list.filter(s=>s.favorite);
  }

  if($('currentSubjectCount'))$('currentSubjectCount').textContent=current.length;
  if($('currentHoursCount'))$('currentHoursCount').textContent=`${current.reduce((n,s)=>n+Number(s.hours||0),0)} h`;
  if($('currentFavoriteCount'))$('currentFavoriteCount').textContent=current.filter(s=>s.favorite).length;

  if(!current.length){
    $('subjectGrid').innerHTML=`<div class="current-empty-state">
      <div class="empty-mascot">📚</div>
      <h3>Você ainda não configurou o semestre atual</h3>
      <p>Marque na sua matriz quais disciplinas você está cursando agora.</p>
      <button class="btn btn-primary" data-current-semester-config>Configurar semestre atual</button>
    </div>`;
    return;
  }

  $('subjectGrid').innerHTML=list.length
    ? list.map(subjectCard).join('')
    : `<div class="current-empty-state compact">
        <div class="empty-mascot">🔎</div>
        <h3>Nenhuma disciplina atual encontrada</h3>
        <p>${state.currentFavoritesOnly?'Você ainda não favoritou nenhuma disciplina atual.':'Tente outro termo de busca.'}</p>
      </div>`;
}

function sameLocalDay(dateValue,base=new Date()){
  const d=new Date(dateValue);return !Number.isNaN(d.getTime())&&d.getFullYear()===base.getFullYear()&&d.getMonth()===base.getMonth()&&d.getDate()===base.getDate()
}
function todayClasses(){const names=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],day=names[new Date().getDay()];return state.schedule.filter(x=>x.day===day).sort((a,b)=>String(a.start).localeCompare(String(b.start)))}
function todayTasks(){return state.tasks.filter(t=>!t.completed&&sameLocalDay(t.dueAt)).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt))}
function renderTodayOverview(){
  const root=$('todayOverview');if(!root)return;const classes=todayClasses(),tasks=todayTasks();$('todayDateLabel').textContent=new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});
  const chunks=[];
  if(classes.length)chunks.push(`<div class="today-group"><span>🗓️ Aulas</span>${classes.map(x=>{const s=resolveScheduleSubject(x);return `<button data-jump="schedule"><b>${x.start}</b><div><strong>${esc(s?.name||x.subjectName||'Disciplina')}</strong><small>${esc(x.location||s?.room||'Local não informado')}</small></div></button>`}).join('')}</div>`);
  if(tasks.length)chunks.push(`<div class="today-group"><span>⏰ Entregas</span>${tasks.map(t=>`<button data-jump="agenda"><b>${new Date(t.dueAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b><div><strong>${esc(t.title)}</strong><small>${esc(t.subjectName||'Atividade')}</small></div></button>`).join('')}</div>`);
  root.innerHTML=chunks.length?chunks.join(''):'<div class="empty-state mascoted">🦭 <span>Nada urgente hoje. Aproveite para adiantar alguma matéria.</span></div>'
}
function computedNotifications(){
  const now=Date.now(),items=[];
  state.tasks.filter(t=>!t.completed).forEach(t=>{const due=new Date(t.dueAt).getTime();if(!Number.isFinite(due))return;const diff=due-now;if(diff<0)items.push({icon:'🚨',title:'Atividade atrasada',text:`${t.title} · ${t.subjectName||''}`,view:'agenda',level:'danger'});else if(diff<=48*3600000)items.push({icon:'⏰',title:'Prazo próximo',text:`${t.title} · ${new Date(t.dueAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}`,view:'agenda',level:'warning'})});
  currentSubjects().forEach(s=>{const calls=settingFor(s.id),n=state.absences.filter(a=>a.subjectId===s.id).reduce((x,a)=>x+Number(a.absences||0),0);if(calls&&n>=4)items.push({icon:'🙋',title:'Faltas registradas',text:`${s.name}: ${n} falta(s) lançada(s)`,view:'attendance',level:'info'})});
  return items.slice(0,12)
}
function renderNotifications(){const list=computedNotifications();$('notificationBadge').textContent=list.length;$('notificationBadge').classList.toggle('hidden',!list.length);$('notificationsList').innerHTML=list.length?list.map(n=>`<button class="notification-item ${n.level}" data-notification-view="${n.view}"><span>${n.icon}</span><div><b>${esc(n.title)}</b><small>${esc(n.text)}</small></div><i>→</i></button>`).join(''):'<div class="empty-state mascoted">✨ <span>Você está em dia por aqui.</span></div>'}
function searchEverything(q){const term=String(q||'').toLowerCase().trim();if(!term)return[];const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const t=norm(term),out=[];
 state.subjects.forEach(s=>{const hay=norm([s.name,s.code,s.professor,s.professorEmail,s.room,s.platform,s.generalNotes].join(' '));if(hay.includes(t))out.push({icon:s.favorite?'⭐':'📚',title:s.name,meta:[s.professor,s.room].filter(Boolean).join(' · ')||'Disciplina',view:'subjects',subjectId:s.id})});
 state.tasks.forEach(x=>{if(norm([x.title,x.subjectName,x.notes].join(' ')).includes(t))out.push({icon:'📝',title:x.title,meta:x.subjectName||'Atividade',view:'agenda'})});
 state.schedule.forEach(x=>{const s=resolveScheduleSubject(x);if(norm([s?.name,x.subjectName,x.location,x.day].join(' ')).includes(t))out.push({icon:'🗓️',title:s?.name||x.subjectName||'Horário',meta:`${x.day} · ${x.start}${x.location?' · '+x.location:''}`,view:'schedule'})});
 return out.slice(0,20)}
function renderGlobalSearch(){const q=$('globalSearchInput').value,res=searchEverything(q);$('globalSearchResults').innerHTML=q?(res.length?res.map(r=>`<button class="global-result" data-search-view="${r.view}" ${r.subjectId?`data-search-subject="${r.subjectId}"`:''}><span>${r.icon}</span><div><b>${esc(r.title)}</b><small>${esc(r.meta)}</small></div><i>→</i></button>`).join(''):'<div class="empty-state">Nenhum resultado.</div>'):'<div class="search-hint">Busque por matéria, professor, tarefa, sala ou horário.</div>'}
function renderSubject360(s){const root=$('subject360Summary');if(!root)return;const avg=currentAverage(s.id),abs=state.absences.filter(a=>a.subjectId===s.id).reduce((x,a)=>x+Number(a.absences||0),0),tasks=state.tasks.filter(t=>t.subjectId===s.id&&!t.completed).length,schedules=state.schedule.filter(x=>x.subjectId===s.id);root.innerHTML=`<div class="subject360-grid"><div><span>📊 Média</span><strong>${avg==null?'—':avg.toFixed(1).replace('.',',')}</strong></div><div><span>🙋 Faltas</span><strong>${settingFor(s.id)?abs:'—'}</strong></div><div><span>📝 Pendências</span><strong>${tasks}</strong></div><div><span>🗓️ Horários</span><strong>${schedules.length}</strong></div></div>${schedules.length?`<div class="subject360-schedule">${schedules.map(x=>`<span>${x.day.slice(0,3)} ${x.start}–${x.end}${x.location?' · '+esc(x.location):''}</span>`).join('')}</div>`:''}`}
function renderAbsenceChart(){const root=$('absenceChart');if(!root)return;const curr=currentSubjects(),vals=curr.map(s=>({s,n:settingFor(s.id)?state.absences.filter(a=>a.subjectId===s.id).reduce((x,a)=>x+Number(a.absences||0),0):0,calls:settingFor(s.id)})),max=Math.max(1,...vals.map(x=>x.n));root.innerHTML=vals.length?vals.map(({s,n,calls})=>`<div class="absence-bar-row"><div><b>${esc(s.name)}</b><span>${calls?`${n} falta(s)`:'Sem chamada'}</span></div><div class="absence-track"><i style="width:${calls?n/max*100:0}%"></i></div></div>`).join(''):'<div class="empty-state">Nenhuma disciplina cursando.</div>'}
function renderGradeEvolution(){const root=$('gradeEvolution');if(!root)return;const curr=currentSubjects();root.innerHTML=curr.length?curr.map(s=>{const vals=state.assessments.filter(a=>a.subjectId===s.id).map(a=>Number(a.grade)).filter(Number.isFinite);return `<div class="grade-evolution-row"><div><b>${esc(s.name)}</b><span>${vals.length?`${vals.length} avaliação(ões)`:'Sem notas'}</span></div><div class="grade-sequence">${vals.length?vals.map((v,i)=>`<span title="Avaliação ${i+1}: ${v}" style="height:${Math.max(6,v*10)}%"><i>${v.toFixed(1).replace('.',',')}</i></span>`).join(''):'<em>—</em>'}</div></div>`}).join(''):'<div class="empty-state">Nenhuma disciplina cursando.</div>'}
const dashboardWidgets={
 'quick-actions':'Ações rápidas','metrics':'Indicadores','today':'Hoje','period-chart':'Conclusão por período','analytics':'Gráficos','current-subjects':'Disciplinas atuais','next-class':'Próxima aula','tasks':'Próximas atividades','projection':'Projeção','university':'Universidade'
};
function widgetPrefs(){try{return JSON.parse(localStorage.getItem('focca-dashboard-widgets')||'{}')}catch{return{}}}
function applyDashboardPreferences(){const p=widgetPrefs();document.querySelectorAll('[data-widget]').forEach(el=>el.classList.toggle('widget-hidden',p[el.dataset.widget]===false));restoreWidgetOrder('dashboardMainWidgets');restoreWidgetOrder('dashboardSideWidgets')}
function renderWidgetOptions(){const p=widgetPrefs();$('dashboardWidgetOptions').innerHTML=Object.entries(dashboardWidgets).map(([id,name])=>`<label><input type="checkbox" data-widget-toggle="${id}" ${p[id]===false?'':'checked'}><span>${name}</span></label>`).join('')}
function setWidgetPreference(id,value){const p=widgetPrefs();p[id]=value;localStorage.setItem('focca-dashboard-widgets',JSON.stringify(p));applyDashboardPreferences()}
function saveWidgetOrder(container){localStorage.setItem(`focca-order-${container.id}`,[...container.children].filter(x=>x.dataset.widget).map(x=>x.dataset.widget).join(','))}
function restoreWidgetOrder(id){const c=$(id);if(!c)return;const order=(localStorage.getItem(`focca-order-${id}`)||'').split(',').filter(Boolean);order.forEach(w=>{const el=c.querySelector(`[data-widget="${w}"]`);if(el)c.appendChild(el)})}
function setupWidgetDrag(){['dashboardMainWidgets','dashboardSideWidgets'].forEach(id=>{const c=$(id);if(!c)return;let drag=null;c.querySelectorAll('[data-widget][draggable="true"]').forEach(el=>{el.ondragstart=()=>{drag=el;el.classList.add('dragging')};el.ondragend=()=>{el.classList.remove('dragging');saveWidgetOrder(c);drag=null};el.ondragover=e=>{e.preventDefault();if(!drag||drag===el)return;const rect=el.getBoundingClientRect();c.insertBefore(drag,e.clientY<rect.top+rect.height/2?el:el.nextSibling)}})})}


function renderTodayHub(){
  const now=new Date();
  if($('todayClockTime'))$('todayClockTime').textContent=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  if($('todayClockDate'))$('todayClockDate').textContent=now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  if($('todayHubTitle'))$('todayHubTitle').textContent=`${now.getHours()<12?'Bom dia':now.getHours()<18?'Boa tarde':'Boa noite'}, ${(state.profile?.displayName||state.user?.displayName||'estudante').split(' ')[0]}!`;

  const classes=todayClasses(),tasks=todayTasks(),alerts=computedNotifications();
  const next=nextClass();
  if($('todayNextClassName'))$('todayNextClassName').textContent=next?(next.subject?.name||next.item.subjectName||'Disciplina'):'Nenhuma aula futura';
  if($('todayNextClassMeta'))$('todayNextClassMeta').textContent=next?`${next.date.toLocaleDateString('pt-BR',{weekday:'short'})} · ${next.item.start}–${next.item.end} · ${next.item.location||next.subject?.room||'local não informado'}`:'Sua agenda está livre.';
  if($('todayTaskTotal'))$('todayTaskTotal').textContent=tasks.length;
  if($('todayAlertTotal'))$('todayAlertTotal').textContent=alerts.length;

  const timeline=[
    ...classes.map(x=>({time:x.start,icon:'🧑‍🏫',title:resolveScheduleSubject(x)?.name||x.subjectName||'Aula',meta:x.location||resolveScheduleSubject(x)?.room||'Local não informado',view:'schedule'})),
    ...tasks.map(t=>({time:new Date(t.dueAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),icon:'📝',title:t.title,meta:t.subjectName||'Atividade',view:'agenda'}))
  ].sort((a,b)=>a.time.localeCompare(b.time));

  if($('todayTimeline'))$('todayTimeline').innerHTML=timeline.length?timeline.map(x=>`<button data-jump="${x.view}"><time>${x.time}</time><span>${x.icon}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.meta)}</small></div><i>→</i></button>`).join(''):'<div class="empty-state mascoted">🦭 <span>Nada marcado para hoje.</span></div>';

  const end=new Date(now);end.setDate(now.getDate()+7);
  const upcoming=state.tasks.filter(t=>!t.completed).filter(t=>{const d=new Date(t.dueAt);return d>now&&d<=end}).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)).slice(0,8);
  if($('todayUpcoming'))$('todayUpcoming').innerHTML=upcoming.length?upcoming.map(t=>`<button data-jump="agenda"><span>${new Date(t.dueAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span><div><strong>${esc(t.title)}</strong><small>${esc(t.subjectName||'Atividade')} · ${new Date(t.dueAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div><i>→</i></button>`).join(''):'<div class="empty-state">Nenhuma entrega nos próximos 7 dias.</div>';

  if($('todayAttentionList'))$('todayAttentionList').innerHTML=alerts.length?alerts.slice(0,6).map(a=>`<button class="${a.level}" data-jump="${a.view}"><span>${a.icon}</span><div><strong>${esc(a.title)}</strong><small>${esc(a.text)}</small></div></button>`).join(''):'<div class="empty-state mascoted">✨ <span>Nenhum alerta importante.</span></div>';

  const curr=currentSubjects();
  if($('todayCurrentSubjects'))$('todayCurrentSubjects').innerHTML=curr.length?curr.map(s=>`<button data-open-subject-page="${s.id}"><span>${s.favorite?'⭐':'📘'}</span><div><strong>${esc(s.name)}</strong><small>${esc(s.professor||'Professor não informado')}</small></div><i>→</i></button>`).join(''):'<div class="empty-state">Nenhuma disciplina cursando.</div>';
}

function subjectStats(s){
  const avg=currentAverage(s.id);
  const abs=state.absences.filter(a=>a.subjectId===s.id).reduce((x,a)=>x+Number(a.absences||0),0);
  const tasks=state.tasks.filter(t=>t.subjectId===s.id&&!t.completed);
  const schedules=state.schedule.filter(x=>x.subjectId===s.id);
  const assessments=state.assessments.filter(a=>a.subjectId===s.id);
  return{avg,abs,tasks,schedules,assessments}
}
function openSubjectPage(id){
  const s=state.subjects.find(x=>x.id===id);if(!s)return;
  state.selectedSubjectId=id;
  renderSubjectPage();
  activateView('subject-detail',s.name);
}
function renderSubjectPage(){
  const s=state.subjects.find(x=>x.id===state.selectedSubjectId);
  if(!s)return;
  const {avg,abs,tasks,schedules,assessments}=subjectStats(s);
  const [statusLabel,statusClass]=statusMeta[s.status]||statusMeta.current;

  $('subjectPageHero').innerHTML=`<div><span class="status-pill ${statusClass}">${statusLabel}</span><h1>${esc(s.name)}</h1><p>${Number(s.hours||0)} h${s.period?` · ${esc(s.period)}º período`:''}${s.classCode?` · ${esc(s.classCode)}`:''}</p></div><div class="subject-hero-meta"><span>Professor</span><strong>${esc(s.professor||'Não informado')}</strong><small>${esc(s.room||'Sala não informada')}</small></div>`;
  $('subjectPageAverage').textContent=avg==null?'—':avg.toFixed(1).replace('.',',');
  $('subjectPageGradeCount').textContent=`${assessments.length} avaliação(ões)`;
  $('subjectPageAbsences').textContent=settingFor(s.id)?abs:'—';
  $('subjectPageAttendanceMode').textContent=settingFor(s.id)?'controle ativo':'professor não faz chamada';
  $('subjectPageTasks').textContent=tasks.length;
  $('subjectPageSchedules').textContent=schedules.length;
  $('subjectPageFavoriteBtn').textContent=s.favorite?'⭐ Favorita':'☆ Favoritar';

  $('subjectPageSchedule').innerHTML=schedules.length?schedules.sort((a,b)=>(a.day+a.start).localeCompare(b.day+b.start)).map(x=>`<div class="subject-page-row"><span>🗓️</span><div><strong>${x.day} · ${x.start}–${x.end}</strong><small>${esc(x.location||s.room||'Local não informado')}</small></div></div>`).join(''):'<div class="empty-state">Nenhum horário cadastrado para esta disciplina.</div>';

  $('subjectPageGrades').innerHTML=assessments.length?assessments.map(a=>`<div class="subject-page-row"><span>📊</span><div><strong>${esc(a.title||'Avaliação')}</strong><small>Nota registrada</small></div><b>${Number(a.grade).toFixed(1).replace('.',',')}</b></div>`).join(''):'<div class="empty-state">Nenhuma nota lançada.</div>';

  $('subjectPageTaskList').innerHTML=tasks.length?tasks.sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)).map(t=>`<div class="subject-page-row"><span>📝</span><div><strong>${esc(t.title)}</strong><small>${fmtDate(t.dueAt)}</small></div></div>`).join(''):'<div class="empty-state">Nenhuma atividade pendente.</div>';

  $('subjectPageProfessor').innerHTML=`<div class="professor-avatar">👩‍🏫</div><strong>${esc(s.professor||'Professor não informado')}</strong>${s.professorEmail?`<a href="mailto:${esc(s.professorEmail)}">${esc(s.professorEmail)}</a>`:'<span>E-mail não informado</span>'}${s.professorNotes?`<p>${esc(s.professorNotes)}</p>`:'<p class="muted">Sem observações sobre o professor.</p>'}`;

  const links=[];
  if(s.virtualRoom)links.push(['💻','Sala virtual',s.virtualRoom]);
  if(s.professorEmail)links.push(['✉️','E-mail do professor',`mailto:${s.professorEmail}`]);
  $('subjectPageLinks').innerHTML=links.length?links.map(([icon,label,url])=>`<a href="${esc(url)}" target="${url.startsWith('mailto:')?'_self':'_blank'}" rel="noopener"><span>${icon}</span><b>${label}</b><i>↗</i></a>`).join(''):'<div class="empty-state">Nenhum link cadastrado.</div>';

  $('subjectPageNotes').innerHTML=s.generalNotes?`<p>${esc(s.generalNotes)}</p>`:'<p class="muted">Nenhuma observação cadastrada.</p>';
}

function openCommandCenter(){openModal('commandCenterModal')}
function runCommand(cmd){
  closeModal('commandCenterModal');
  if(cmd==='task'){jump('agenda');setTimeout(()=>$('taskTitle')?.focus(),150)}
  if(cmd==='grade'){jump('grades');setTimeout(()=>$('assessmentTitle')?.focus(),150)}
  if(cmd==='absence'){jump('attendance');setTimeout(()=>$('absenceDate')?.focus(),150)}
  if(cmd==='schedule'){jump('schedule');setTimeout(()=>$('scheduleFormCard')?.scrollIntoView({behavior:'smooth'}),150)}
  if(cmd==='semester')openSemesterSetup();
  if(cmd==='search'){setTimeout(()=>{$('globalSearchPanel').classList.remove('hidden');$('globalSearchInput').focus();renderGlobalSearch()},80)}
  if(cmd==='focus'){jump('study');renderStudyHub()}
  if(cmd==='material'){jump('materials');renderStudyHub();setTimeout(()=>$('addMaterialBtn')?.click(),100)}
}


function renderInterfaceRefresh(){
  const total=state.subjects.length;
  const done=state.subjects.filter(s=>doneStatuses.has(s.status)).length;
  const current=state.subjects.filter(s=>s.status==='current').length;
  const pending=Math.max(0,total-done-current);
  const pct=total?Math.round(done/total*100):0;

  if($('semesterRing'))$('semesterRing').style.setProperty('--semester-progress',pct);
  if($('semesterRingValue'))$('semesterRingValue').textContent=`${pct}%`;
  if($('semesterCurrentCount'))$('semesterCurrentCount').textContent=current;
  if($('semesterDoneCount'))$('semesterDoneCount').textContent=done;
  if($('semesterPendingCount'))$('semesterPendingCount').textContent=pending;
  if($('profileProgress'))$('profileProgress').textContent=`${pct}%`;
  if($('profileCurrent'))$('profileCurrent').textContent=current;
  if($('profileRemaining'))$('profileRemaining').textContent=pending;

  const week=$('foccaWeekStrip');
  if(week){
    const now=new Date();
    const monday=new Date(now);
    const offset=(now.getDay()+6)%7;
    monday.setDate(now.getDate()-offset);
    monday.setHours(0,0,0,0);
    const dayNames=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
    week.innerHTML=dayNames.map((name,i)=>{
      const d=new Date(monday); d.setDate(monday.getDate()+i);
      const isToday=d.toDateString()===now.toDateString();
      const daySchedule=state.schedule.filter(x=>{
        const normalized=String(x.day||'').toLowerCase();
        const map=['segunda','terça','quarta','quinta','sexta','sábado','domingo'];
        return normalized.includes(map[i]) || normalized.includes(map[i].normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      });
      const dayTasks=state.tasks.filter(t=>{
        if(!t.dueAt)return false;
        const td=new Date(t.dueAt);
        return td.toDateString()===d.toDateString()&&!t.completed;
      });
      const items=[
        ...daySchedule.slice(0,2).map(x=>`<span>🧑‍🏫 ${esc(resolveScheduleSubject(x)?.name||x.subjectName||'Aula')}</span>`),
        ...dayTasks.slice(0,2).map(t=>`<span>📝 ${esc(t.title)}</span>`)
      ];
      return `<div class="focca-week-day ${isToday?'today':''}">
        <div class="focca-week-date"><b>${name}</b><strong>${String(d.getDate()).padStart(2,'0')}</strong></div>
        <div class="focca-week-items">${items.length?items.join(''):'<small>Livre</small>'}</div>
      </div>`;
    }).join('');
  }
}

function renderCurriculum(){const periods=[...new Set(state.subjects.map(s=>s.period||'Sem período'))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true}));$('curriculumGrid').innerHTML=periods.length?periods.map(period=>`<section class="period-column"><div class="period-head"><strong>${period==='Sem período'?period:`${esc(period)}º período`}</strong><span>${state.subjects.filter(s=>(s.period||'Sem período')===period).reduce((a,s)=>a+Number(s.hours||0),0)} h</span></div><div class="period-list">${state.subjects.filter(s=>(s.period||'Sem período')===period).map(subjectCard).join('')}</div></section>`).join(''):'<div class="empty-state big-empty">Sua matriz ainda está vazia. Clique em “Importar matriz”.</div>'}
function populateSubjectSelects(){const options=currentSubjects().map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');['assessmentSubject','absenceSubject','taskSubject','scheduleSubject'].forEach(id=>$(id).innerHTML=options||'<option value="">Nenhuma disciplina cursando</option>')}

async function refreshCore(){state.profile=await getProfile();state.subjects=await listSubjects();renderHeader();renderCurriculum();renderSubjects();populateSubjectSelects();fillProfileForm();renderUniversity();renderDashboard()}
function fillProfileForm(){const p=state.profile||{};$('termInput').value=p.currentTerm||'';$('displayNameInput').value=p.displayName||state.user?.displayName||'';$('calendarUrlInput').value=p.calendarUrl||'https://preg.ufrpe.br/sites/ww4.depaacademicos.ufrpe.br/files/CALEND%C3%81RIO_GRADUA%C3%87%C3%83O_2026-%20Atualizado%20CEPE%20n%C2%BA%201004%20DE%2021%20DE%20MAIO%20DE%202026%2020%20jul.pdf'}

function editSubject(id){const s=state.subjects.find(x=>x.id===id);$('subjectModalTitle').textContent=s?'Editar disciplina':'Nova disciplina';$('subjectId').value=s?.id||'';$('subjectName').value=s?.name||'';$('subjectCode').value=s?.code||'';$('subjectHours').value=s?.hours??60;$('subjectPeriod').value=s?.period||'';$('subjectType').value=s?.type||'mandatory';$('subjectStatus').value=s?.status||'pending';openModal('subjectModal')}
async function saveSubjectForm(e){e.preventDefault();const item={name:$('subjectName').value.trim(),code:$('subjectCode').value.trim(),hours:Number($('subjectHours').value||0),period:$('subjectPeriod').value.trim(),type:$('subjectType').value,status:$('subjectStatus').value};try{const id=$('subjectId').value;if(id)await updateSubject(id,item);else await createSubject(item);closeModal('subjectModal');await refreshCore();toast('Disciplina salva.')}catch(err){toast(err.message,true)}}
async function handleSubjectGrid(e){const fav=e.target.closest('[data-favorite-subject]');if(fav){e.stopPropagation();const s=state.subjects.find(x=>x.id===fav.dataset.favoriteSubject);await updateSubject(s.id,{favorite:!s.favorite});await refreshCore();return}const b=e.target.closest('[data-edit-subject]');if(b)editSubject(b.dataset.editSubject)}

async function installBaseMatrix(force=false){
  if(state.subjects.length && !force) return;
  const items=COMPUTACAO_BASE_MATRIX.map(x=>({...x,status:'pending'}));
  await replaceSubjects(items);
  await saveProfile({courseName:'Computação',matrixConfigured:true,coursePeriods:9});
  await refreshCore();
}
function renderTrajectory(){
  const groups=[...new Set(state.subjects.map(s=>s.period||'Sem período'))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true}));
  $('trajectoryList').innerHTML=groups.map(period=>`<section class="trajectory-period"><div class="trajectory-period-head"><strong>${period==='Sem período'?period:`${esc(period)}º período`}</strong><span>${state.subjects.filter(s=>(s.period||'Sem período')===period).length} disciplinas</span></div><div class="trajectory-grid">${state.subjects.filter(s=>(s.period||'Sem período')===period).map(s=>`<label class="trajectory-item"><div><strong>${esc(s.name)}</strong><small>${Number(s.hours||0)} h${s.type==='elective'?' · Optativa':s.type==='internship'?' · Estágio':s.type==='tcc'?' · TCC':''}</small></div><select data-trajectory-status="${s.id}"><option value="pending" ${s.status==='pending'?'selected':''}>Pendente</option><option value="current" ${s.status==='current'?'selected':''}>Cursando</option><option value="approved" ${s.status==='approved'?'selected':''}>Aprovada</option><option value="approved_final" ${s.status==='approved_final'?'selected':''}>Aprovada por nota/final</option><option value="failed" ${s.status==='failed'?'selected':''}>Reprovada</option><option value="withdrawn" ${s.status==='withdrawn'?'selected':''}>Trancada</option><option value="exempt" ${s.status==='exempt'?'selected':''}>Dispensada/Aproveitada</option></select></label>`).join('')}</div></section>`).join('');
}
function openTrajectorySetup(){renderTrajectory();openModal('trajectoryModal')}
async function saveTrajectorySetup(){
  try{
    const changes=[...document.querySelectorAll('[data-trajectory-status]')].map(el=>({id:el.dataset.trajectoryStatus,status:el.value}));
    await Promise.all(changes.map(x=>updateSubject(x.id,{status:x.status})));
    closeModal('trajectoryModal');
    await refreshCore();
    toast('Trajetória atualizada.');
  }catch(err){toast(err.message,true)}
}
function renderSemesterSubjects(){const list=$('semesterSubjectList');if(!state.subjects.length){list.innerHTML='<div class="empty-state">A matriz-base ainda não foi carregada.</div>';return}list.innerHTML=state.subjects.map(s=>`<label class="semester-subject ${s.status==='current'?'selected':''}"><input type="checkbox" data-semester-subject="${s.id}" ${s.status==='current'?'checked':''}><span><strong>${esc(s.name)}</strong><small>${Number(s.hours||0)} h${s.period?` · ${esc(s.period)}º período`:''}</small></span></label>`).join('')}
function openSemesterSetup(){$('semesterTermInput').value=state.profile?.currentTerm||'';renderSemesterSubjects();openModal('semesterModal')}
async function saveSemesterSetup(){const selected=new Set([...document.querySelectorAll('[data-semester-subject]:checked')].map(x=>x.dataset.semesterSubject));try{await Promise.all(state.subjects.map(s=>{if(selected.has(s.id)&&s.status!=='current')return updateSubject(s.id,{status:'current'});if(!selected.has(s.id)&&s.status==='current')return updateSubject(s.id,{status:'pending'});return Promise.resolve()}));const term=$('semesterTermInput').value.trim();if(term)await saveProfile({currentTerm:term});closeModal('semesterModal');await refreshCore();toast('Semestre atual configurado.')}catch(err){toast(err.message,true)}}
async function saveOnboarding(e){e.preventDefault();try{await saveProfile({institution:$('onboardingInstitution').value.trim(),courseName:'Computação',currentTerm:$('onboardingTerm').value.trim(),displayName:$('onboardingDisplayName').value.trim(),coursePeriods:9,onboardingComplete:true,matrixConfigured:true});closeModal('onboardingModal');await installBaseMatrix(true);openTrajectorySetup()}catch(err){toast(err.message,true)}}


function safeUrl(v){try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}}
function renderUniversity(){
  const root=$('universityLinks'); if(!root)return;
  const p=state.profile||{};
  const calendarUrl=p.calendarUrl||'https://preg.ufrpe.br/sites/ww4.depaacademicos.ufrpe.br/files/CALEND%C3%81RIO_GRADUA%C3%87%C3%83O_2026-%20Atualizado%20CEPE%20n%C2%BA%201004%20DE%2021%20DE%20MAIO%20DE%202026%2020%20jul.pdf';
  const links=[
    ['SIGAA','Matrícula, histórico, notas e serviços acadêmicos.','https://sigs.ufrpe.br/sigaa/verTelaLogin.do','🎓'],
    ['Ambiente Virtual','Acesse o AVA oficial da UFRPE.','https://ava.ufrpe.br/login/index.php','💻'],
    ['Cardápio do RU','Veja o cardápio publicado pela PROGESTI/RU.','https://www.instagram.com/progestiru/','🍽️'],
    ['Calendário acadêmico','Calendário oficial de graduação da UFRPE.',calendarUrl,'📅']
  ];
  root.innerHTML=links.map(([title,desc,url,icon])=>`<a class="university-link-card" href="${esc(url)}" target="_blank" rel="noopener"><div class="hub-icon">${icon}</div><div><h3>${title}</h3><p>${desc}</p></div><span>↗</span></a>`).join('');
}

async function refreshTasks(){state.tasks=await listTasks();$('taskCount').textContent=state.tasks.length;$('taskList').innerHTML=state.tasks.length?state.tasks.map(t=>`<article class="task-card ${t.completed?'done':''}"><div><strong>${esc(t.title)}</strong><span>${esc(t.subjectName||'')} · ${fmtDate(t.dueAt)}</span></div><div class="task-actions"><button class="btn btn-ghost" data-task-toggle="${t.id}">${t.completed?'Reabrir':'Concluir'}</button><button class="btn btn-danger" data-task-delete="${t.id}">Excluir</button></div></article>`).join(''):'<div class="empty-state">Nenhuma atividade.</div>'}
async function submitTask(e){e.preventDefault();const s=state.subjects.find(x=>x.id===$('taskSubject').value);if(!s)return;const task={subjectId:s.id,subjectName:s.name,subject:s.name,title:$('taskTitle').value.trim(),dueAt:new Date(`${$('taskDate').value}T${$('taskTime').value}:00`).toISOString(),reminderValue:Number($('reminderValue').value||0),reminderUnit:$('reminderUnit').value,notes:$('taskNotes').value.trim()};try{const id=await createTask(task);if($('addToCalendar').checked){const ev=await createCalendarEvent({...task,id});await updateTask(id,{calendarEventId:ev.id,calendarHtmlLink:ev.htmlLink||null})}e.target.reset();$('taskTime').value='09:00';$('reminderValue').value=1;$('addToCalendar').checked=true;await refreshTasks();toast('Atividade salva.')}catch(err){toast(err.message,true)}}

function min(t){const [h,m]=t.split(':').map(Number);return h*60+m}
async function refreshSchedule(){state.schedule=await listSchedule();renderSchedule()}

function renderSchedule(){
  const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const active=days.filter(d=>state.schedule.some(x=>x.day===d));
  const cols=active.length?active:days.slice(0,5);
  const valid=state.schedule.filter(x=>x.start&&x.end);
  const starts=valid.map(x=>min(x.start)),ends=valid.map(x=>min(x.end));
  const start=starts.length?Math.max(7*60,Math.floor((Math.min(...starts)-30)/30)*30):8*60;
  const end=ends.length?Math.min(23*60,Math.ceil((Math.max(...ends)+30)/30)*30):22*60;
  const span=Math.max(120,end-start);

  let board=`<div class="schedule-head" style="--days:${cols.length}"><span>Horário</span>${cols.map(d=>`<span>${d.slice(0,3)}</span>`).join('')}</div><div class="schedule-canvas" style="--days:${cols.length}"><div class="time-axis">`;
  for(let m=start;m<=end;m+=60)board+=`<span style="top:${((m-start)/span)*100}%">${String(Math.floor(m/60)).padStart(2,'0')}:00</span>`;
  board+='</div>';

  cols.forEach((day,di)=>{
    board+=`<div class="day-column" style="grid-column:${di+2}">`;
    state.schedule.filter(x=>x.day===day&&x.start&&x.end).forEach((x,idx)=>{
      const s=resolveScheduleSubject(x);
      const name=s?.name||x.subjectName||'Disciplina';
      const location=x.location||s?.room||'Local não informado';
      const top=((min(x.start)-start)/span)*100;
      const height=((min(x.end)-min(x.start))/span)*100;
      board+=`<div class="class-block tone-${(di+idx)%5}" style="top:${top}%;height:${Math.max(height,9)}%" title="${esc(name)}"><strong>${esc(name)}</strong><span>${x.start}–${x.end}</span><small>${esc(location)}</small></div>`;
    });
    board+='</div>';
  });
  board+='</div>';
  $('scheduleBoard').innerHTML=board;

  $('scheduleMobile').innerHTML=cols.map(day=>{
    const items=state.schedule.filter(x=>x.day===day).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
    return items.length?`<section class="mobile-day"><h4>${day}</h4>${items.map(x=>{
      const s=resolveScheduleSubject(x);
      const location=x.location||s?.room||'';
      return `<div class="mobile-class"><b>${esc(s?.name||x.subjectName||'Disciplina')}</b><span>${x.start}–${x.end}${location?` · ${esc(location)}`:''}</span></div>`;
    }).join('')}</section>`:'';
  }).join('');

  $('scheduleList').innerHTML=state.schedule.map(x=>{
    const s=resolveScheduleSubject(x);
    const name=s?.name||x.subjectName||'Disciplina';
    const location=x.location||s?.room||'';
    return `<div class="stack-item"><div><strong>${esc(name)}</strong><span>${x.day} · ${x.start}–${x.end}${location?` · ${esc(location)}`:''}</span></div><div class="row-actions"><button class="btn btn-secondary btn-small" data-schedule-edit="${x.id}">Editar</button><button class="btn btn-danger btn-small" data-schedule-delete="${x.id}">Excluir</button></div></div>`;
  }).join('')||'<div class="empty-state">Nenhum horário cadastrado.</div>';

  const totalMinutes=state.schedule.reduce((acc,x)=>acc+(x.start&&x.end?Math.max(0,min(x.end)-min(x.start)):0),0);
  $('weeklyHoursBadge').textContent=`${Math.floor(totalMinutes/60)}h${String(totalMinutes%60).padStart(2,'0')}`;

  const grouped=new Map();
  state.schedule.forEach(x=>{
    const s=resolveScheduleSubject(x);
    const name=s?.name||x.subjectName||'Disciplina';
    if(!grouped.has(name))grouped.set(name,[]);
    grouped.get(name).push(x);
  });
  $('scheduleOverview').innerHTML=[...grouped.entries()].map(([name,items],i)=>`<div class="schedule-overview-item"><i class="tone-dot tone-${i%5}"></i><div><b>${esc(name)}</b><span>${items.map(x=>`${x.day.slice(0,3)} ${x.start}`).join(' · ')}</span></div></div>`).join('')||'<div class="empty-state">Adicione suas aulas para montar a semana.</div>';
  renderDashboard();
}

function resetScheduleForm(){
  $('scheduleForm').reset();
  $('scheduleEditId').value='';
  $('scheduleStart').value='18:30';
  $('scheduleEnd').value='20:10';
  $('scheduleSubmitBtn').textContent='Adicionar à grade';
  $('scheduleCancelEditBtn').classList.add('hidden');
}

function editScheduleItem(id){
  const x=state.schedule.find(v=>v.id===id);
  if(!x)return;
  $('scheduleEditId').value=x.id;
  $('scheduleSubject').value=x.subjectId||'';
  $('scheduleDay').value=x.day||'Segunda';
  $('scheduleStart').value=x.start||'18:30';
  $('scheduleEnd').value=x.end||'20:10';
  $('scheduleLocation').value=x.location||resolveScheduleSubject(x)?.room||'';
  $('scheduleSubmitBtn').textContent='Salvar alterações';
  $('scheduleCancelEditBtn').classList.remove('hidden');
  $('scheduleFormCard').scrollIntoView({behavior:'smooth',block:'start'});
}

async function submitSchedule(e){
  e.preventDefault();
  const s=state.subjects.find(x=>x.id===$('scheduleSubject').value);
  if(!s||min($('scheduleEnd').value)<=min($('scheduleStart').value)){
    toast('Revise a disciplina e os horários.',true);
    return;
  }
  const editId=$('scheduleEditId').value;
  await saveScheduleItem({
    id:editId||undefined,
    subjectId:s.id,
    subjectName:s.name,
    day:$('scheduleDay').value,
    start:$('scheduleStart').value,
    end:$('scheduleEnd').value,
    location:$('scheduleLocation').value.trim()||s.room||''
  });
  resetScheduleForm();
  await refreshSchedule();
  toast(editId?'Horário atualizado.':'Horário adicionado.');
}

function settingFor(id){return state.settings.find(x=>x.subjectId===id)?.professorCalls ?? true}
async function refreshAbsences(){state.absences=await listAbsences();state.settings=await listSubjectSettings();renderAbsences();renderAbsenceChart();renderNotifications();renderDashboard()}
function renderAbsences(){$('absenceSummary').innerHTML=currentSubjects().map(s=>{const calls=settingFor(s.id);const n=state.absences.filter(a=>a.subjectId===s.id).reduce((x,a)=>x+Number(a.absences||0),0);return `<div class="stack-item"><div><strong>${esc(s.name)}</strong><span>${calls?'Professor faz chamada':'Sem chamada · não contabiliza faltas'}</span></div><b>${calls?n:'—'}</b></div>`}).join('')||'<div class="empty-state">Nenhuma disciplina cursando.</div>';$('absenceHistory').innerHTML=state.absences.map(a=>{const s=state.subjects.find(x=>x.id===a.subjectId);return `<div class="stack-item"><div><strong>${esc(s?.name||a.subjectName||'')}</strong><span>${a.date} · ${a.absences} falta(s)</span></div><button class="btn btn-danger" data-absence-delete="${a.id}">Excluir</button></div>`}).join('')||'<div class="empty-state">Nenhuma falta registrada.</div>'}
async function submitAbsence(e){e.preventDefault();const s=state.subjects.find(x=>x.id===$('absenceSubject').value);if(!s)return;const calls=$('professorCalls').value==='yes';await saveSubjectSetting({subjectId:s.id,professorCalls:calls});if(calls)await addAbsence({subjectId:s.id,subjectName:s.name,date:$('absenceDate').value,absences:Number($('absenceCount').value)});await refreshAbsences();toast(calls?'Falta registrada.':'Configuração salva: esta matéria não contabiliza faltas.')}

async function refreshGrades(){state.assessments=await listAssessments();renderGrades();renderGradeEvolution();renderDashboard()}
function renderGrades(){$('gradeSummary').innerHTML=currentSubjects().map(s=>{const vals=state.assessments.filter(a=>a.subjectId===s.id).map(a=>Number(a.grade)).filter(Number.isFinite);const avg=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;return `<div class="stack-item"><div><strong>${esc(s.name)}</strong><span>${vals.length} avaliação(ões)</span></div><b>${avg==null?'—':avg.toFixed(1).replace('.',',')}</b></div>`}).join('')||'<div class="empty-state">Nenhuma disciplina cursando.</div>';$('assessmentList').innerHTML=state.assessments.map(a=>{const s=state.subjects.find(x=>x.id===a.subjectId);return `<article class="subject-card"><h3>${esc(a.title)}</h3><p>${esc(s?.name||a.subjectName||'')} · nota ${Number(a.grade).toFixed(1).replace('.',',')}</p><button class="btn btn-danger" data-assessment-delete="${a.id}">Excluir</button></article>`}).join('')}
async function submitAssessment(e){e.preventDefault();const s=state.subjects.find(x=>x.id===$('assessmentSubject').value);if(!s)return;await saveAssessment({subjectId:s.id,subjectName:s.name,title:$('assessmentTitle').value.trim(),grade:Number($('assessmentGrade').value)});e.target.reset();await refreshGrades();toast('Nota salva.')}

async function loadPrivate(){await refreshCore();await Promise.all([refreshTasks(),refreshSchedule(),refreshAbsences(),refreshGrades()]);if(!state.profile?.onboardingComplete){setTimeout(()=>{$('onboardingInstitution').value=state.profile?.institution||'';$('onboardingTerm').value=state.profile?.currentTerm||'';$('onboardingDisplayName').value=state.profile?.displayName||state.user?.displayName||'';openModal('onboardingModal')},250)}else if(!state.subjects.length){await installBaseMatrix(true)}}

function bind(){setupNav();setupModals();bindStudyHub();$('themeBtn').onclick=()=>{const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('focca-theme',n)};$('logoutBtn').onclick=logout;
$('trajectorySetupBtn').onclick=$('settingsTrajectoryBtn').onclick=openTrajectorySetup;$('semesterSetupBtn').onclick=$('semesterSetupBtnTop').onclick=$('settingsSemesterBtn').onclick=openSemesterSetup;$('resetBaseMatrixBtn').onclick=async()=>{if(confirm('Restaurar a matriz-base vai substituir as disciplinas atuais. Deseja continuar?')){await installBaseMatrix(true);toast('Matriz-base restaurada.');openTrajectorySetup()}};
$('onboardingForm').onsubmit=saveOnboarding;$('saveTrajectoryBtn').onclick=saveTrajectorySetup;$('saveSemesterBtn').onclick=saveSemesterSetup;$('semesterAddSubjectBtn').onclick=()=>{closeModal('semesterModal');editSubject()};$('semesterSubjectList').onchange=e=>{const row=e.target.closest('.semester-subject');if(row)row.classList.toggle('selected',e.target.checked)};
$('subjectForm').onsubmit=saveSubjectForm;
$('subjectGrid').onclick=e=>{
  const semesterConfig=e.target.closest('[data-current-semester-config]');
  if(semesterConfig){openSemesterSetup();return}
  handleSubjectGrid(e);
};
$('curriculumGrid').onclick=handleSubjectGrid;
$('currentPreview').onclick=handleSubjectGrid;
$('subjectSearch').oninput=renderSubjects;
$('currentFavoritesToggle').onclick=()=>{
  state.currentFavoritesOnly=!state.currentFavoritesOnly;
  $('currentFavoritesToggle').classList.toggle('active',state.currentFavoritesOnly);
  $('currentFavoritesToggle').textContent=state.currentFavoritesOnly?'⭐ Mostrando favoritas':'⭐ Mostrar favoritas';
  renderSubjects();
};$('profileForm').onsubmit=async e=>{e.preventDefault();await saveProfile({
  institution:'UFRPE',
  courseName:'Computação',
  currentTerm:$('termInput').value.trim(),
  displayName:$('displayNameInput').value.trim(),
  portalUrl:'https://sigs.ufrpe.br/sigaa/verTelaLogin.do',
  avaUrl:'https://ava.ufrpe.br/login/index.php',
  ruMenuUrl:'https://www.instagram.com/progestiru/',
  calendarUrl:$('calendarUrlInput').value.trim()||'https://preg.ufrpe.br/sites/ww4.depaacademicos.ufrpe.br/files/CALEND%C3%81RIO_GRADUA%C3%87%C3%83O_2026-%20Atualizado%20CEPE%20n%C2%BA%201004%20DE%2021%20DE%20MAIO%20DE%202026%2020%20jul.pdf'
});await refreshCore();toast('Configurações salvas.');};$('taskForm').onsubmit=submitTask;$('taskList').onclick=async e=>{const del=e.target.closest('[data-task-delete]'),tog=e.target.closest('[data-task-toggle]');if(del)await removeTask(del.dataset.taskDelete);if(tog){const t=state.tasks.find(x=>x.id===tog.dataset.taskToggle);await updateTask(t.id,{completed:!t.completed})}await refreshTasks()};$('scheduleForm').onsubmit=submitSchedule;$('scheduleCancelEditBtn').onclick=resetScheduleForm;$('scheduleSubject').onchange=()=>{const s=state.subjects.find(x=>x.id===$('scheduleSubject').value);if(s?.room&&!$('scheduleEditId').value)$('scheduleLocation').value=s.room};$('scheduleFocusFormBtn').onclick=()=>{$('scheduleFormCard').scrollIntoView({behavior:'smooth',block:'start'})};$('scheduleList').onclick=async e=>{const edit=e.target.closest('[data-schedule-edit]');if(edit){editScheduleItem(edit.dataset.scheduleEdit);return}const del=e.target.closest('[data-schedule-delete]');if(del){await removeScheduleItem(del.dataset.scheduleDelete);await refreshSchedule()}};$('subjectDetailsForm').onsubmit=saveSubjectDetails;$('absenceForm').onsubmit=submitAbsence;$('absenceSubject').onchange=()=>{$('professorCalls').value=settingFor($('absenceSubject').value)?'yes':'no'};$('absenceHistory').onclick=async e=>{const b=e.target.closest('[data-absence-delete]');if(b){await removeAbsence(b.dataset.absenceDelete);await refreshAbsences()}};$('assessmentForm').onsubmit=submitAssessment;$('assessmentList').onclick=async e=>{const b=e.target.closest('[data-assessment-delete]');if(b){await removeAssessment(b.dataset.assessmentDelete);await refreshGrades()}};





if($('subjectPageBackBtn'))$('subjectPageBackBtn').onclick=()=>jump('subjects');
if($('subjectPageEditBtn'))$('subjectPageEditBtn').onclick=()=>openSubjectDetails(state.selectedSubjectId);
if($('subjectPageFavoriteBtn'))$('subjectPageFavoriteBtn').onclick=async()=>{
  const s=state.subjects.find(x=>x.id===state.selectedSubjectId);if(!s)return;
  await updateSubject(s.id,{favorite:!s.favorite});await refreshCore();renderSubjectPage()
};
if($('commandCenterBtn'))$('commandCenterBtn').onclick=openCommandCenter;
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>runCommand(b.dataset.command));
if($('todayOpenNotifications'))$('todayOpenNotifications').onclick=()=>{renderNotifications();$('notificationsPanel').classList.remove('hidden')};

$('globalSearchBtn').onclick=()=>{$('globalSearchPanel').classList.remove('hidden');$('globalSearchInput').focus();renderGlobalSearch()};
$('closeSearchBtn').onclick=()=>$('globalSearchPanel').classList.add('hidden');$('globalSearchInput').oninput=renderGlobalSearch;
$('globalSearchResults').onclick=e=>{const b=e.target.closest('[data-search-view]');if(!b)return;$('globalSearchPanel').classList.add('hidden');jump(b.dataset.searchView);if(b.dataset.searchSubject)setTimeout(()=>openSubjectDetails(b.dataset.searchSubject),100)};
$('notificationsBtn').onclick=()=>{renderNotifications();$('notificationsPanel').classList.toggle('hidden')};$('closeNotificationsBtn').onclick=()=>$('notificationsPanel').classList.add('hidden');
$('notificationsList').onclick=e=>{const b=e.target.closest('[data-notification-view]');if(b){$('notificationsPanel').classList.add('hidden');jump(b.dataset.notificationView)}};
$('customizeDashboardBtn').onclick=()=>{renderWidgetOptions();openModal('dashboardCustomizeModal')};
$('dashboardWidgetOptions').onchange=e=>{const t=e.target.closest('[data-widget-toggle]');if(t)setWidgetPreference(t.dataset.widgetToggle,t.checked)};
$('resetDashboardBtn').onclick=()=>{localStorage.removeItem('focca-dashboard-widgets');localStorage.removeItem('focca-order-dashboardMainWidgets');localStorage.removeItem('focca-order-dashboardSideWidgets');renderWidgetOptions();applyDashboardPreferences();toast('Dashboard restaurado.')};
document.addEventListener('click',e=>{
  const subject=e.target.closest('[data-subject-details]');
  if(subject&&!e.target.closest('[data-edit-subject]')&&!e.target.closest('[data-favorite-subject]')){openSubjectPage(subject.dataset.subjectDetails);return}
  const subjectPage=e.target.closest('[data-open-subject-page]');
  if(subjectPage){openSubjectPage(subjectPage.dataset.openSubjectPage);return}
  const j=e.target.closest('[data-jump]');
  if(j&&!j.classList.contains('nav-item'))jump(j.dataset.jump)
})}

// Tema: segue o claro/escuro do aparelho até a pessoa escolher um tema no botão.
const systemThemeQuery=window.matchMedia?.('(prefers-color-scheme: dark)');
function systemTheme(){return systemThemeQuery?.matches?'dark':'light'}
function storedTheme(){try{return localStorage.getItem('focca-theme')}catch{return null}}
function watchSystemTheme(){systemThemeQuery?.addEventListener?.('change',()=>{if(!storedTheme())document.documentElement.dataset.theme=systemTheme()})}
async function start(){document.documentElement.dataset.theme=storedTheme()||systemTheme();watchSystemTheme();bind();watchAuth(async(user)=>{state.user=user;$('loginScreen').classList.toggle('hidden',!!user);$('appShell').classList.toggle('hidden',!user);if(user)try{await loadPrivate()}catch(e){toast(`Erro ao carregar: ${e.message}`,true)}})}
start();


const studyHub={
 sessions:JSON.parse(localStorage.getItem('focca_focus_sessions')||'[]'),
 materials:JSON.parse(localStorage.getItem('focca_materials')||'[]'),
 timer:null,remaining:1500,elapsed:0,running:false,minutes:25
};
function studyHubSave(){localStorage.setItem('focca_focus_sessions',JSON.stringify(studyHub.sessions));localStorage.setItem('focca_materials',JSON.stringify(studyHub.materials))}
function focusFmt(sec){sec=Math.max(0,sec);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
function renderStudyHub(){
 const current=state.subjects.filter(s=>s.status==='current');
 const opts=current.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
 if($('focusSubjectSelect'))$('focusSubjectSelect').innerHTML='<option value="">Selecione uma disciplina</option>'+opts;
 if($('materialSubject'))$('materialSubject').innerHTML='<option value="">Selecione uma disciplina</option>'+opts;
 if($('materialSubjectFilter'))$('materialSubjectFilter').innerHTML='<option value="">Todas as disciplinas</option>'+opts;
 const week=studyHub.sessions.filter(x=>x.at>Date.now()-604800000).reduce((a,x)=>a+Number(x.seconds||0),0);
 const weekLabel=week>=3600?`${(week/3600).toFixed(1).replace('.',',')} h`:`${Math.round(week/60)} min`;
 if($('focusWeekTotal'))$('focusWeekTotal').textContent=weekLabel;
 if($('degreeFocus'))$('degreeFocus').textContent=weekLabel;
 if($('focusRecentList'))$('focusRecentList').innerHTML=studyHub.sessions.slice(-6).reverse().map(x=>{const s=state.subjects.find(v=>v.id===x.subjectId);return `<div class="subject-page-row"><span>🎯</span><div><strong>${esc(s?.name||'Estudo livre')}</strong><small>${esc(x.topic||'Sessão de foco')}</small></div><b>${Math.max(1,Math.round(x.seconds/60))} min</b></div>`}).join('')||'<div class="empty-state">Nenhuma sessão registrada ainda.</div>';
 renderMaterials();applyMaterialView();renderDegree();
}
function renderMaterials(){
 if(!$('materialsGrid'))return;
 const q=($('materialSearch')?.value||'').toLowerCase().trim(),filter=$('materialSubjectFilter')?.value||'';
 const list=studyHub.materials.filter(m=>(!filter||m.subjectId===filter)&&(!q||String(m.title||'').toLowerCase().includes(q)));
 $('materialsGrid').innerHTML=list.length?list.map(m=>{const s=state.subjects.find(v=>v.id===m.subjectId);return `<article class="card material-card"><div class="material-icon">${m.type==='Link'?'🔗':'📄'}</div><div><small>${esc(m.type)}</small><h3>${esc(m.title)}</h3><p>${esc(s?.name||'Sem disciplina')}</p></div>${m.url?`<a class="btn btn-secondary" href="${esc(m.url)}" target="_blank" rel="noopener">Abrir ↗</a>`:''}</article>`}).join(''):'<div class="empty-state">📎 Nenhum material encontrado.</div>';
}
function renderDegree(){
 if(!$('degreePct'))return;
 const total=state.subjects.length,done=state.subjects.filter(s=>doneStatuses.has(s.status)).length,current=state.subjects.filter(s=>s.status==='current').length,remaining=Math.max(0,total-done-current),pct=total?Math.round(done/total*100):0;
 $('degreePct').textContent=`${pct}%`;$('degreeRing').style.setProperty('--degree-progress',pct);$('degreeDone').textContent=done;$('degreeCurrent').textContent=current;$('degreeRemaining').textContent=remaining;
 const periods={};state.subjects.forEach(s=>(periods[s.period||'Outras']??=[]).push(s));
 $('degreePeriods').innerHTML=Object.entries(periods).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'pt-BR',{numeric:true})).map(([period,arr])=>{const d=arr.filter(s=>doneStatuses.has(s.status)).length,p=arr.length?Math.round(d/arr.length*100):0;return `<div class="degree-period-row"><div><strong>${esc(String(period))}${/^\d+$/.test(String(period))?'º período':''}</strong><small>${d}/${arr.length} concluídas</small></div><div class="degree-progress"><i style="width:${p}%"></i></div><b>${p}%</b></div>`}).join('');
}
function bindStudyHub(){
 document.querySelectorAll('[data-focus-min]').forEach(b=>b.onclick=()=>{studyHub.minutes=Number(b.dataset.focusMin);studyHub.remaining=studyHub.minutes?studyHub.minutes*60:0;studyHub.elapsed=0;if($('focusTimer'))$('focusTimer').textContent=studyHub.minutes?focusFmt(studyHub.remaining):'00:00'});
 if($('focusStartBtn'))$('focusStartBtn').onclick=()=>{if(studyHub.running){clearInterval(studyHub.timer);studyHub.running=false;$('focusStartBtn').textContent='▶ Continuar';return}studyHub.running=true;$('focusStartBtn').textContent='⏸ Pausar';studyHub.timer=setInterval(()=>{studyHub.elapsed++;studyHub.remaining=studyHub.minutes?studyHub.remaining-1:studyHub.remaining+1;if(studyHub.minutes&&studyHub.remaining<=0){clearInterval(studyHub.timer);studyHub.running=false;$('focusStartBtn').textContent='▶ Iniciar foco'}if($('focusTimer'))$('focusTimer').textContent=focusFmt(studyHub.remaining)},1000)};
 if($('focusFinishBtn'))$('focusFinishBtn').onclick=()=>{clearInterval(studyHub.timer);studyHub.running=false;if(studyHub.elapsed>0){studyHub.sessions.push({subjectId:$('focusSubjectSelect')?.value||'',topic:$('focusTopicInput')?.value.trim()||'',seconds:studyHub.elapsed,at:Date.now()});studyHubSave()}studyHub.elapsed=0;studyHub.remaining=studyHub.minutes?studyHub.minutes*60:0;if($('focusTimer'))$('focusTimer').textContent=studyHub.minutes?focusFmt(studyHub.remaining):'00:00';if($('focusStartBtn'))$('focusStartBtn').textContent='▶ Iniciar foco';renderStudyHub()};
 if($('addMaterialBtn'))$('addMaterialBtn').onclick=()=>{$('materialModal').classList.remove('hidden')};
 document.querySelectorAll('[data-close-material]').forEach(b=>b.onclick=()=>$('materialModal').classList.add('hidden'));
 if($('materialSaveBtn'))$('materialSaveBtn').onclick=()=>{const title=$('materialTitle').value.trim();if(!title){toast('Informe um título para o material.',true);return}studyHub.materials.push({id:String(Date.now()),title,subjectId:$('materialSubject').value,type:$('materialType').value,url:$('materialUrl').value.trim()});studyHubSave();$('materialModal').classList.add('hidden');$('materialTitle').value='';$('materialUrl').value='';renderStudyHub();toast('Material adicionado.')};
 if($('materialSearch'))$('materialSearch').oninput=renderMaterials;
 if($('materialSubjectFilter'))$('materialSubjectFilter').onchange=renderMaterials;if($('materialTypeFilter'))$('materialTypeFilter').onchange=renderMaterials;
}



function gradeNumber(id){
  const raw=$(id)?.value;
  if(raw===''||raw==null)return null;
  const n=Number(raw);
  return Number.isFinite(n)?n:null;
}
function calcApprovalSituation(){
  if(!$('gradeSituationResult'))return;
  const va1=gradeNumber('gradeVA1'),va2=gradeNumber('gradeVA2'),va3=gradeNumber('gradeVA3'),finalGrade=gradeNumber('gradeFinal');

  const r=approvalSituation({va1,va2,va3,final:finalGrade});
  const fmt=n=>n.toFixed(1).replace('.',',');

  if(r.stage==='missing'){
    $('gradeSituationResult').innerHTML=`<div class="grade-status neutral"><span>📘</span><div><strong>Informe a 1ª VA e a 2ª VA</strong><small>O Focca calcula automaticamente sua situação.</small></div></div>`;
    return;
  }

  let status='',cls='neutral',icon='📘',message='',extra='';

  if(r.stage==='approved'){
    status='Aprovado por média';
    cls='success';icon='✅';
    message=`Média das duas primeiras avaliações: ${fmt(r.initial)}.`;
    extra='Você não precisa fazer 3ª VA nem Final.';
  } else if(r.stage==='needs-va3'){
    status='3ª VA necessária';
    cls='warning';icon='🟡';
    message=`Média atual: ${fmt(r.initial)}.`;
    extra=r.needed<=10
      ? `Para atingir média 7 substituindo a menor nota, você precisa tirar pelo menos ${fmt(r.needed)} na 3ª VA.`
      : 'Mesmo com nota 10 na 3ª VA, você ainda irá para a Final.';
  } else if(r.stage==='approved-va3'){
    status='Aprovado após 3ª VA';
    cls='success';icon='✅';
    message=`A 3ª VA ${r.replaced?'substituiu':'não substituiu'} a menor nota. Nova média: ${fmt(r.afterVA3)}.`;
    extra='Você foi aprovado sem precisar da Final.';
  } else if(r.stage==='needs-final'){
    status='Final necessária';
    cls='danger';icon='🔴';
    message=`Média após a 3ª VA: ${fmt(r.afterVA3)}.`;
    extra=r.needed<=10
      ? `Na Final, você precisa tirar pelo menos ${fmt(r.needed)} para que (média anterior + Final) ÷ 2 seja 5.`
      : 'Com essa média, não é possível atingir média final 5 mesmo com nota 10.';
  } else if(r.stage==='approved-final'){
    status='Aprovado na Final';
    cls='success';icon='✅';
    message=`Média antes da Final: ${fmt(r.afterVA3)} · Nota da Final: ${fmt(finalGrade)}.`;
    extra=`Média final: ${fmt(r.finalAverage)}.`;
  } else {
    status='Reprovado por nota';
    cls='danger';icon='❌';
    message=`Média final: ${fmt(r.finalAverage)}.`;
    extra='A média final ficou abaixo de 5.';
  }

  $('gradeSituationResult').innerHTML=`
    <div class="grade-status ${cls}">
      <span>${icon}</span>
      <div>
        <strong>${status}</strong>
        <small>${message}</small>
        <p>${extra}</p>
      </div>
    </div>
    <div class="grade-calculation-strip">
      <span><b>${va1.toFixed(1).replace('.',',')}</b> 1ª VA</span>
      <span><b>${va2.toFixed(1).replace('.',',')}</b> 2ª VA</span>
      <span><b>${va3==null?'—':va3.toFixed(1).replace('.',',')}</b> 3ª VA</span>
      <span><b>${fmt(r.afterVA3)}</b> média base</span>
      <span><b>${finalGrade==null?'—':finalGrade.toFixed(1).replace('.',',')}</b> Final</span>
    </div>`;
}
function bindGradeRules(){
  if(!$('gradeRuleSubject'))return;
  $('gradeRuleSubject').innerHTML='<option value="">Selecione uma disciplina</option>'+state.subjects.filter(s=>s.status==='current').map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  ['gradeVA1','gradeVA2','gradeVA3','gradeFinal'].forEach(id=>{if($(id))$(id).oninput=calcApprovalSituation});
  $('gradeRuleSubject').onchange=calcApprovalSituation;
  calcApprovalSituation();
}

window.addEventListener('load',()=>{try{bindGradeRules()}catch(e){console.warn('Grade rules:',e)}});


const uxState={matrixMode:'visual',subjectTab:'overview'};

function subjectAccent(s){
  const accents=['#6C5BFF','#5B9DFF','#F0A34D','#45C49A','#D87ADF','#E76C7C'];
  const seed=[...(s?.name||'')].reduce((a,c)=>a+c.charCodeAt(0),0);
  return accents[seed%accents.length];
}

function renderDynamicHome(){
  const now=new Date();
  const h=now.getHours();
  let emoji='☀️',title='Bom dia',text='Veja suas aulas, entregas e prioridades.';
  if(h>=12&&h<18){emoji='🌤️';title='Boa tarde';text='Continue seu dia acadêmico com clareza.'}
  if(h>=18){emoji='🌙';title='Boa noite';text='Revise o que ficou pendente e prepare amanhã.'}
  const next=nextClass();
  if(next){
    const diff=(next.date-now)/60000;
    if(diff>=0&&diff<=90){
      emoji='📍';title='Sua próxima aula está perto';text=`${next.subject?.name||next.item.subjectName||'Disciplina'} começa às ${next.item.start}.`;
    }
  }
  if($('dynamicHomeEmoji'))$('dynamicHomeEmoji').textContent=emoji;
  if($('dynamicHomeTitle'))$('dynamicHomeTitle').textContent=title;
  if($('dynamicHomeText'))$('dynamicHomeText').textContent=text;
}

function renderMatrixListMode(){
  const root=$('matrixListMode'); if(!root)return;
  const periods=[...new Set(state.subjects.map(s=>Number(s.period||0)).filter(Boolean))].sort((a,b)=>a-b);
  root.innerHTML=periods.map(p=>{
    const arr=state.subjects.filter(s=>Number(s.period)===p);
    const done=arr.filter(s=>doneStatuses.has(s.status)).length;
    const pct=arr.length?Math.round(done/arr.length*100):0;
    return `<section class="matrix-list-period">
      <header><div><strong>${p}º período</strong><small>${done}/${arr.length} concluídas</small></div><b>${pct}%</b></header>
      <div class="matrix-list-progress"><i style="width:${pct}%"></i></div>
      <div class="matrix-list-items">${arr.map(s=>{
        const meta=statusMeta[s.status]||statusMeta.pending;
        const icon=doneStatuses.has(s.status)?'🟢':s.status==='current'?'🟣':s.status==='failed'?'🔴':'⚪';
        return `<button data-subject-details="${s.id}" style="--subject-accent:${subjectAccent(s)}"><span>${icon}</span><div><strong>${esc(s.name)}</strong><small>${meta[0]} · ${Number(s.hours||0)}h</small></div><i>→</i></button>`
      }).join('')}</div>
    </section>`;
  }).join('');
}

function applyMatrixMode(mode){
  uxState.matrixMode=mode;
  document.querySelectorAll('[data-matrix-mode]').forEach(b=>b.classList.toggle('active',b.dataset.matrixMode===mode));
  const visual=$('curriculumGrid');
  const list=$('matrixListMode');
  if(visual)visual.classList.toggle('hidden',mode!=='visual');
  if(list)list.classList.toggle('hidden',mode!=='list');
  if(mode==='list')renderMatrixListMode();
}

function applySubjectTab(tab){
  uxState.subjectTab=tab;
  document.querySelectorAll('[data-subject-tab]').forEach(b=>b.classList.toggle('active',b.dataset.subjectTab===tab));
  const all=[
    ['overview',['subjectPageSchedule','subjectPageProfessor','subjectPageLinks','subjectPageNotes']],
    ['grades',['subjectPageGrades']],
    ['attendance',[]],
    ['materials',[]]
  ];
  document.querySelectorAll('#view-subject-detail .card').forEach(c=>c.classList.remove('subject-tab-force-hide'));
  if(tab==='grades'){
    document.querySelectorAll('#view-subject-detail .card').forEach(c=>{
      if(!c.querySelector('#subjectPageGrades'))c.classList.add('subject-tab-force-hide')
    });
  }else if(tab==='materials'){
    document.querySelectorAll('#view-subject-detail .card').forEach(c=>c.classList.add('subject-tab-force-hide'));
    const container=document.querySelector('#view-subject-detail .subject-page-main');
    let panel=$('subjectMaterialsTabPanel');
    if(!panel){
      panel=document.createElement('article');panel.id='subjectMaterialsTabPanel';panel.className='card';
      container?.prepend(panel);
    }
    const s=state.subjects.find(x=>x.id===state.selectedSubjectId);
    const mats=(window.studyHub?.materials||[]).filter(m=>m.subjectId===s?.id);
    panel.innerHTML=`<div class="card-header"><div><p class="eyebrow">MATERIAIS</p><h3>Materiais da disciplina</h3></div><button class="text-link" data-jump="materials">Abrir central →</button></div><div class="subject-page-list">${mats.length?mats.map(m=>`<div class="subject-page-row"><span>${m.type==='Link'?'🔗':'📄'}</span><div><strong>${esc(m.title)}</strong><small>${esc(m.type)}</small></div>${m.url?`<a href="${esc(m.url)}" target="_blank">↗</a>`:''}</div>`).join(''):'<div class="empty-state">Nenhum material vinculado ainda.</div>'}</div>`;
    panel.classList.remove('subject-tab-force-hide');
  }else if(tab==='attendance'){
    document.querySelectorAll('#view-subject-detail .card').forEach(c=>c.classList.add('subject-tab-force-hide'));
    const container=document.querySelector('#view-subject-detail .subject-page-main');
    let panel=$('subjectAttendanceTabPanel');
    if(!panel){panel=document.createElement('article');panel.id='subjectAttendanceTabPanel';panel.className='card';container?.prepend(panel)}
    const s=state.subjects.find(x=>x.id===state.selectedSubjectId);
    const abs=state.absences.filter(a=>a.subjectId===s?.id).reduce((n,a)=>n+Number(a.absences||0),0);
    panel.innerHTML=`<div class="card-header"><div><p class="eyebrow">FREQUÊNCIA</p><h3>Controle de faltas</h3></div><button class="text-link" data-jump="attendance">Abrir faltas →</button></div><div class="subject-attendance-summary"><span>🙋</span><div><strong>${settingFor(s?.id)?abs:'—'} faltas</strong><small>${settingFor(s?.id)?'Controle ativo':'Professor marcado como sem chamada'}</small></div></div>`;
    panel.classList.remove('subject-tab-force-hide');
  }else{
    document.querySelectorAll('#view-subject-detail .card').forEach(c=>c.classList.remove('subject-tab-force-hide'));
    ['subjectMaterialsTabPanel','subjectAttendanceTabPanel'].forEach(id=>$(id)?.classList.add('subject-tab-force-hide'));
  }
}

function openFocusFullscreen(){
  const s=state.subjects.find(x=>x.id===$('focusSubjectSelect')?.value);
  $('focusFullscreenSubject').textContent=s?.name||'Estudo livre';
  $('focusFullscreenTopic').textContent=$('focusTopicInput')?.value||'Sessão de estudo';
  $('focusFullscreenTimer').textContent=$('focusTimer')?.textContent||'25:00';
  $('focusFullscreen').classList.remove('hidden');
  document.body.classList.add('focus-mode-active');
}
function closeFocusFullscreen(){
  $('focusFullscreen')?.classList.add('hidden');
  document.body.classList.remove('focus-mode-active');
}


window.addEventListener('load',()=>{
  try{
    document.querySelectorAll('[data-matrix-mode]').forEach(b=>b.onclick=()=>applyMatrixMode(b.dataset.matrixMode));
    document.querySelectorAll('[data-subject-tab]').forEach(b=>b.onclick=()=>applySubjectTab(b.dataset.subjectTab));
    if($('focusStartBtn')){
      const original=$('focusStartBtn').onclick;
      $('focusStartBtn').onclick=(e)=>{original?.(e);setTimeout(openFocusFullscreen,80)};
    }
    if($('focusFullscreenClose'))$('focusFullscreenClose').onclick=closeFocusFullscreen;
    if($('focusFullscreenPause'))$('focusFullscreenPause').onclick=()=>{$('focusStartBtn')?.click();$('focusFullscreenTimer').textContent=$('focusTimer')?.textContent||'00:00'};
    if($('focusFullscreenFinish'))$('focusFullscreenFinish').onclick=()=>{$('focusFinishBtn')?.click();closeFocusFullscreen()};
    setInterval(()=>{if(!$('focusFullscreen')?.classList.contains('hidden'))$('focusFullscreenTimer').textContent=$('focusTimer')?.textContent||'00:00'},500);
    renderDynamicHome();
    renderMatrixListMode();
  }catch(e){console.warn('UX v9:',e)}
});


const uiRefine={
  materialView:localStorage.getItem('focca-material-view')||'cards'
};

const viewGroups={
  today:['FOCCA · MEU DIA','Hoje'],
  dashboard:['FOCCA · MEU DIA','Resumo'],
  agenda:['FOCCA · MEU DIA','Organização'],
  schedule:['FOCCA · MEU DIA','Semana'],
  subjects:['FOCCA · ACADÊMICO','Semestre atual'],
  curriculum:['FOCCA · ACADÊMICO','Formação'],
  degree:['FOCCA · ACADÊMICO','Trajetória'],
  grades:['FOCCA · ACADÊMICO','Desempenho'],
  attendance:['FOCCA · ACADÊMICO','Frequência'],
  study:['FOCCA · ESTUDOS','Foco'],
  materials:['FOCCA · ESTUDOS','Biblioteca'],
  university:['FOCCA · UNIVERSIDADE','Acessos'],
  settings:['FOCCA','Preferências'],
  'subject-detail':['FOCCA · DISCIPLINA','Visão 360º']
};

function updateTopbarContext(view){
  const meta=viewGroups[view]||['FOCCA',''];
  if($('courseEyebrow'))$('courseEyebrow').textContent=meta[0];
  if($('topbarContext'))$('topbarContext').textContent=meta[1];
}

function applyMaterialView(){
  const grid=$('materialsGrid'); if(!grid)return;
  grid.classList.toggle('materials-list-view',uiRefine.materialView==='list');
  document.querySelectorAll('[data-material-view]').forEach(b=>b.classList.toggle('active',b.dataset.materialView===uiRefine.materialView));
}

function bindUIRefinement(){
  document.querySelectorAll('[data-material-view]').forEach(b=>b.onclick=()=>{
    uiRefine.materialView=b.dataset.materialView;
    localStorage.setItem('focca-material-view',uiRefine.materialView);
    applyMaterialView();
  });
  if($('settingsThemeShortcut'))$('settingsThemeShortcut').onclick=()=>$('themeBtn')?.click();
  if($('settingsDashboardShortcut'))$('settingsDashboardShortcut').onclick=()=>openModal('customizeModal');
  if($('settingsSearchShortcut'))$('settingsSearchShortcut').onclick=()=>openCommandCenter();
  applyMaterialView();
}

window.addEventListener('load',()=>{try{bindUIRefinement();updateTopbarContext('dashboard')}catch(e){console.warn('UI refinement:',e)}});
