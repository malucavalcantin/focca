const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFWORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

async function parsePdf(file){
  const pdfjs=await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc=PDFWORKER;
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjs.getDocument({data}).promise;
  const lines=[];
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const content=await page.getTextContent();
    const groups=new Map();
    content.items.forEach(item=>{
      const y=Math.round(item.transform[5]/3)*3;
      const x=item.transform[4];
      if(!groups.has(y)) groups.set(y,[]);
      groups.get(y).push({x,text:item.str});
    });
    [...groups.entries()].sort((a,b)=>b[0]-a[0]).forEach(([,items])=>{
      const line=items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();
      if(line) lines.push(line);
    });
  }
  return lines.join('\n');
}

async function ensureTesseract(){
  if(window.Tesseract) return window.Tesseract;
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload=resolve;
    s.onerror=()=>reject(new Error('Não foi possível carregar o leitor de imagens.'));
    document.head.appendChild(s);
  });
  return window.Tesseract;
}

function cleanName(name=''){
  return String(name)
    .replace(/^\s*[-•|]+/,'')
    .replace(/[|]+$/,'')
    .replace(/\b(?:DED|DC|DL|DM|EAD|DLCH|PCC)\b/gi,' ')
    .replace(/\b(?:q|u|o|z|ha|mm|pe)\b/gi,' ')
    .replace(/[©®™]/g,' ')
    .replace(/\s{2,}/g,' ')
    .replace(/^[-–—:;,.\s]+|[-–—:;,.\s]+$/g,'')
    .trim();
}

function inferType(name){
  if(/\boptativa|eletiva\b/i.test(name)) return 'elective';
  if(/est[aá]gio/i.test(name)) return 'internship';
  if(/trabalho\s+de\s+conclus[aã]o|\bTCC\b/i.test(name)) return 'tcc';
  if(/atividade(?:s)?\s+complementar/i.test(name)) return 'complementary';
  return 'mandatory';
}

function looksLikeSubject(name){
  if(!name || name.length<4 || name.length>120) return false;
  if(!/[A-Za-zÀ-ÿ]{3}/.test(name)) return false;
  if(/^(?:resumo|legenda|carga hor[aá]ria|per[ií]odo|semestre|enade|atividades complementares|fundamentos da computa[cç][aã]o|matem[aá]tica|tecnologia da computa[cç][aã]o|forma[cç][aã]o do docente|contexto social e profissional)$/i.test(name)) return false;
  return true;
}

function extractSubjects(text){
  const raw=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const ignore=/^(hor[aá]rio|carga hor[aá]ria|ch\b|c[oó]d\.?|componente|curr[ií]culo|per[ií]odo|semestre|legenda|total|nome|curso|matr[ií]cula|situa[cç][aã]o|docente|turma|status|atividades complementares|enade)/i;
  const candidates=[];
  const hourRegex=/(\d{2,3})\s*h\b|\bCH\s*[:=-]?\s*(\d{2,3})\b/i;
  raw.forEach((line,index)=>{
    if(ignore.test(line)) return;
    const hourMatch=line.match(hourRegex);
    if(hourMatch){
      const hours=Number(hourMatch[1]||hourMatch[2]);
      let name=cleanName(line.replace(hourMatch[0],'').replace(/^\d{3,6}\s+/,'').replace(/\b(obrigat[oó]ria|optativa|eletiva)\b/ig,''));
      if(looksLikeSubject(name) && hours>=15 && hours<=600) candidates.push({name,hours,period:null,type:inferType(name)});
      return;
    }
    const compact=line.match(/^\s*(\d{3,6})\s+(.+?)\s+(\d{2,3})\s*$/);
    if(compact){
      const hours=Number(compact[3]); const name=cleanName(compact[2]);
      if(looksLikeSubject(name) && hours>=15 && hours<=600) candidates.push({code:compact[1],name,hours,period:null,type:inferType(name)});
      return;
    }
    if(/^[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s\-–—:,.()\/]{6,}$/.test(line) && !ignore.test(line)){
      const next=raw[index+1]||''; const hm=next.match(hourRegex);
      if(hm){ const hours=Number(hm[1]||hm[2]); if(hours>=15&&hours<=600)candidates.push({name:cleanName(line),hours,period:null,type:inferType(line)}); }
    }
  });
  return dedupe(candidates);
}

function dedupe(candidates){
  const map=new Map();
  candidates.forEach(c=>{
    const name=cleanName(c.name);
    const key=name.toLocaleLowerCase('pt-BR').replace(/[^a-zà-ÿ0-9]/g,'');
    if(key.length>3&&!map.has(key)) map.set(key,{...c,name});
  });
  return [...map.values()].map((x,i)=>({tempId:`det-${i+1}`,code:x.code||'',name:x.name,hours:Number(x.hours||60),period:x.period||'',type:x.type||'mandatory',status:'pending'}));
}

async function loadImage(file){
  if('createImageBitmap' in window) return createImageBitmap(file);
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(img.src);resolve(img)};
    img.onerror=reject;
    img.src=URL.createObjectURL(file);
  });
}

function cropCanvas(img,x,y,w,h,scale=3.2){
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*scale));
  c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,x,y,w,h,0,0,c.width,c.height);
  return c;
}

function visualTextQuality(name, rawText, confidence=0){
  const n=String(name||'').trim();
  if(!looksLikeSubject(n)) return 0;
  let score=Math.max(0,Math.min(100,Number(confidence)||0));
  const letters=(n.match(/[A-Za-zÀ-ÿ]/g)||[]).length;
  const bad=(n.match(/[^A-Za-zÀ-ÿ0-9\s.,()\-–—/&]/g)||[]).length;
  const words=n.split(/\s+/).filter(Boolean);
  const vowels=(n.match(/[AEIOUÁÉÍÓÚÂÊÔÃÕÀaeiouáéíóúâêôãõà]/g)||[]).length;
  if(letters<4) score-=40;
  if(bad>1) score-=bad*12;
  if(letters && vowels/letters<0.18) score-=30;
  if(/(.)\1{3,}/i.test(n)) score-=35;
  if(words.some(w=>w.length>18)) score-=22;
  if(words.filter(w=>/[A-Za-zÀ-ÿ]{3}/.test(w)).length===0) score-=35;
  if(words.some(w=>w.length>=6 && !/[AEIOUÁÉÍÓÚÂÊÔÃÕÀaeiouáéíóúâêôãõà]/.test(w))) score-=25;
  if(/[<>_=\[\]{}]/.test(rawText||'')) score-=20;
  return Math.max(0,Math.min(100,score));
}

function parseVisualCell(text,period,row,confidence=0){
  let t=String(text||'').replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
  if(!t) return null;
  const hourMatch=t.match(/\b(30|45|60|75|90|120|135|150|180)\b/);
  const hours=hourMatch?Number(hourMatch[1]):60;
  if(hourMatch){
    // Remove CH total and, when present, the second numeric box (PCC) before the title.
    const idx=t.indexOf(hourMatch[0]);
    t=t.slice(idx+hourMatch[0].length).trim();
    t=t.replace(/^\s*(?:0|15|30|45|60|90|120|135)\b\s*/,'');
  }
  // Remove common OCR artifacts generated by vertical area labels and card borders.
  t=t.replace(/^[^A-Za-zÀ-ÿ]*(?=[A-Za-zÀ-ÿ])/,'')
     .replace(/\b(?:DED|DC|DL|DM|EAD|DLCH|PCC)\b/gi,' ')
     .replace(/[|_=]+/g,' ')
     .replace(/\s{2,}/g,' ')
     .trim();
  let name=cleanName(t);
  // OCR sometimes keeps a lone single-character vertical label at the end.
  name=name.replace(/\s+[A-Za-z]$/,'').trim();
  if(!looksLikeSubject(name)) return null;
  const quality=visualTextQuality(name,text,confidence);
  // Em imagens, é melhor omitir uma disciplina duvidosa do que preencher a matriz com OCR incorreto.
  if(quality<68) return null;
  return {name,hours,period:String(period),type:inferType(name),row,confidence:quality};
}

function pixelIsCardLike(r,g,b){
  const max=Math.max(r,g,b), min=Math.min(r,g,b), mean=(r+g+b)/3;
  const chroma=max-min;
  // Os perfis curriculares deste padrão usam cartões preenchidos em azul, verde,
  // amarelo/laranja ou cinza sobre um fundo cinza muito claro.
  // Ignoramos texto/setas escuros e o fundo quase branco.
  return ((chroma>18 && mean>118 && mean<250) || (chroma<=18 && mean>148 && mean<226));
}

function mergeBands(bands,maxGap=10){
  const out=[];
  for(const band of bands){
    if(out.length && band.y1-out[out.length-1].y2<=maxGap){
      out[out.length-1].y2=band.y2;
    }else out.push({...band});
  }
  return out;
}

function detectCardBands(img,periodCount){
  const w=img.width||img.naturalWidth, h=img.height||img.naturalHeight;
  const canvas=document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0,w,h);
  const left=Math.round(w*0.012), right=Math.round(w*0.992);
  const gridTop=Math.round(h*0.075), gridBottom=Math.round(h*0.72);
  const colW=(right-left)/periodCount;
  const result=[];

  for(let p=0;p<periodCount;p++){
    const x0=Math.max(0,Math.round(left+p*colW+colW*0.03));
    const x1=Math.min(w,Math.round(left+(p+1)*colW-colW*0.03));
    const rw=Math.max(1,x1-x0);
    const rh=Math.max(1,gridBottom-gridTop);
    const data=ctx.getImageData(x0,gridTop,rw,rh).data;
    const rowCoverage=new Float32Array(rh);

    // Amostramos a cada 2 px: suficiente para reconhecer o retângulo preenchido
    // e muito mais barato que analisar cada pixel da matriz.
    for(let yy=0;yy<rh;yy++){
      let cardPixels=0, samples=0;
      for(let xx=0;xx<rw;xx+=2){
        const i=(yy*rw+xx)*4;
        if(pixelIsCardLike(data[i],data[i+1],data[i+2])) cardPixels++;
        samples++;
      }
      rowCoverage[yy]=samples?cardPixels/samples:0;
    }

    const raw=[];
    let start=null;
    for(let yy=0;yy<rh;yy++){
      const on=rowCoverage[yy]>0.25;
      if(on && start===null) start=yy;
      if(start!==null && (!on || yy===rh-1)){
        const end=on?yy:yy-1;
        if(end-start>=8) raw.push({y1:gridTop+start,y2:gridTop+end});
        start=null;
      }
    }

    const bands=mergeBands(raw,Math.max(6,Math.round(h*0.01)))
      .filter(b=>b.y2-b.y1>=Math.round(h*0.045))
      .slice(0,10);
    result.push({period:p+1,x0,x1,bands});
  }
  return result;
}

function preprocessTextCanvas(source,mode='title'){
  const scale=mode==='title'?4.6:4.0;
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(source.width*scale));
  c.height=Math.max(1,Math.round(source.height*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(source,0,0,c.width,c.height);
  const image=ctx.getImageData(0,0,c.width,c.height);
  const d=image.data;
  // O texto dos cartões é escuro e o fundo é claro/colorido. Converter para P&B
  // elimina a cor do cartão, linhas finas e boa parte dos artefatos das setas.
  for(let i=0;i<d.length;i+=4){
    const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    const v=lum<(mode==='title'?158:175)?0:255;
    d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
  }
  ctx.putImageData(image,0,0);
  return c;
}

function cropCardPart(img,x,y,w,h,part){
  const src=document.createElement('canvas');
  let rx,ry,rw,rh;
  if(part==='title'){
    // Exclui a faixa superior (CH/PCC) e a etiqueta vertical da área à direita.
    rx=x+w*0.045; ry=y+h*0.235; rw=w*0.79; rh=h*0.73;
  }else{
    // A CH está no primeiro quadrinho no topo esquerdo.
    rx=x+w*0.02; ry=y+h*0.015; rw=w*0.46; rh=h*0.245;
  }
  src.width=Math.max(1,Math.round(rw)); src.height=Math.max(1,Math.round(rh));
  src.getContext('2d').drawImage(img,rx,ry,rw,rh,0,0,src.width,src.height);
  return preprocessTextCanvas(src,part);
}

function normalizeOcrTitle(text=''){
  return cleanName(String(text)
    .replace(/[|_=<>\[\]{}]/g,' ')
    .replace(/[“”„]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/\s+/g,' ')
    .replace(/^\d{1,3}\s+/,'')
    .trim());
}

function parseHoursFromText(text=''){
  const nums=String(text).match(/\b(?:30|45|60|75|90|120|135|150|180)\b/g)||[];
  return nums.length?Number(nums[0]):60;
}

async function parseVisualMatrixImage(file,onProgress,options={}){
  const Tesseract=await ensureTesseract();
  const img=await loadImage(file);
  const width=img.width||img.naturalWidth, height=img.height||img.naturalHeight;
  const periodCount=Math.max(1,Math.min(20,Number(options.periodCount)||9));
  const columns=detectCardBands(img,periodCount);
  const cards=[];
  columns.forEach(col=>col.bands.forEach((b,row)=>cards.push({period:col.period,row:row+1,x:col.x0,y:b.y1,w:col.x1-col.x0,h:b.y2-b.y1+1})));
  if(!cards.length){ if(img?.close) img.close(); return []; }

  let worker;
  const found=[];
  try{
    worker=await Tesseract.createWorker('por',1,{logger:m=>{
      // O progresso fino a 98% é atualizado por cartão; o callback interno do OCR
      // só suaviza a sensação de espera.
      if(m.status==='recognizing text' && onProgress){
        const base=found.length/cards.length;
        onProgress(Math.min(98,Math.round((base+(m.progress||0)/cards.length)*100)));
      }
    }});

    for(let i=0;i<cards.length;i++){
      const card=cards[i];
      const titleCanvas=cropCardPart(img,card.x,card.y,card.w,card.h,'title');
      const titleRes=await worker.recognize(titleCanvas,{tessedit_pageseg_mode:6,preserve_interword_spaces:'1'});
      const name=normalizeOcrTitle(titleRes?.data?.text||'');

      let hours=60;
      try{
        const hourCanvas=cropCardPart(img,card.x,card.y,card.w,card.h,'hours');
        const hourRes=await worker.recognize(hourCanvas,{tessedit_pageseg_mode:7,tessedit_char_whitelist:'0123456789'});
        hours=parseHoursFromText(hourRes?.data?.text||'');
      }catch{}

      const confidence=Number(titleRes?.data?.confidence||0);
      const quality=visualTextQuality(name,titleRes?.data?.text||'',confidence);
      // Como o cartão já foi isolado geometricamente, podemos aceitar uma confiança
      // menor do que no OCR da página inteira sem voltar a aceitar lixo aleatório.
      if(looksLikeSubject(name) && quality>=48){
        found.push({name,hours,period:String(card.period),type:inferType(name),row:card.row,confidence:quality});
      }
      if(onProgress) onProgress(Math.min(98,Math.round(((i+1)/cards.length)*100)));
    }
  } finally {
    if(worker) await worker.terminate();
    if(img?.close) img.close();
  }
  return dedupe(found);
}

async function parseImage(file,onProgress,options={}){
  // Matrizes em imagem são diagramas, não documentos de texto.
  // O Focca só retorna cartões com boa confiança; itens duvidosos ficam para revisão manual.
  let structured=[];
  try{ structured=await parseVisualMatrixImage(file,onProgress,options); }catch(e){ console.warn('Leitura estruturada falhou.',e); }
  return structured;
}

export async function parseMatrixFile(file,onProgress,options={}){
  if(!file) throw new Error('Escolha um arquivo.');
  if(file.type==='application/pdf' || file.name.toLowerCase().endsWith('.pdf')){
    const text=await parsePdf(file);
    return {text,subjects:extractSubjects(text),mode:'pdf'};
  }
  if(file.type.startsWith('image/')){
    const subjects=await parseImage(file,onProgress,options);
    return {text:'',subjects,mode:'visual'};
  }
  throw new Error('Envie uma matriz em PDF ou imagem.');
}
