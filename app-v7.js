const $=id=>document.getElementById(id);
const S={pay:[],att:[],docs:[],issues:[],report:""};

const pdfjs=window.pdfjsLib;
if(!pdfjs)throw new Error("PDFJS_NOT_LOADED");
pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

const OT=[
  {k:"ot125",code:"1125",label:"125%",f:1.25},
  {k:"ot150",code:"1150",label:"150%",f:1.50},
  {k:"ot175",code:"1138",label:"175%",f:1.75},
  {k:"ot200",code:"1119",label:"200%",f:2.00}
];

const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const num=s=>{const v=Number(String(s??"").replace(/,/g,"").replace(/[^0-9.\-]/g,""));return Number.isFinite(v)?v:null};
const fmt=v=>v==null?"—":Number(v).toLocaleString("he-IL",{maximumFractionDigits:2});
const hh=v=>{if(v==null)return"—";const sign=v<0?"-":"";const m=Math.round(Math.abs(v)*60);return sign+Math.floor(m/60)+":"+String(m%60).padStart(2,"0")};
const median=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2};

function month(text){
  const t=String(text||"");
  const names={ינואר:1,פברואר:2,מרץ:3,אפריל:4,מאי:5,יוני:6,יולי:7,אוגוסט:8,ספטמבר:9,אוקטובר:10,נובמבר:11,דצמבר:12};
  for(const [n,m] of Object.entries(names)){
    const x=t.match(new RegExp(n+"\\s*(20\\d{2})"))||t.match(new RegExp("(20\\d{2})\\s*"+n));
    if(x){const y=x[1];return String(m).padStart(2,"0")+"/"+y}
  }
  let x=t.match(/\b(0?[1-9]|1[0-2])[/.-](20\d{2})\b/);
  if(x)return String(+x[1]).padStart(2,"0")+"/"+x[2];
  x=t.match(/\b(0?[1-9]|1[0-2])[/.-](2\d)\b/);
  return x?String(+x[1]).padStart(2,"0")+"/20"+x[2]:"לא זוהה";
}
function shift(mm,d){
  if(!mm||mm==="לא זוהה")return null;
  const [m,y]=mm.split("/").map(Number),dt=new Date(y,m-1+d,1);
  return String(dt.getMonth()+1).padStart(2,"0")+"/"+dt.getFullYear();
}
function lineNums(line){return (String(line).match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g)||[]).map(num).filter(Number.isFinite)}

function pdfRows(items){
  const rows=[];
  for(const it of items){
    const s=(it.str||"").trim(); if(!s)continue;
    const y=it.transform?.[5]??0;
    let r=rows.find(z=>Math.abs(z.y-y)<2.2);
    if(!r){r={y,a:[]};rows.push(r)}
    r.a.push({x:it.transform?.[4]??0,s});
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>{
    const a=r.a.slice().sort((x,y)=>x.x-y.x).map(x=>x.s).join(" ");
    const b=r.a.slice().sort((x,y)=>y.x-x.x).map(x=>x.s).join(" ");
    return a+" || "+b;
  });
}
async function ocrBlob(blob,label,base,span){
  const r=await Tesseract.recognize(blob,"heb+eng",{logger:m=>{
    if(m.status==="recognizing text")prog("OCR: "+label,base+span*(m.progress||0));
  }});
  return r.data.text||"";
}
async function ocrPdfPage(pg,fileName,pageNo,base,span){
  const viewport=pg.getViewport({scale:1.7});
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  canvas.width=Math.ceil(viewport.width);
  canvas.height=Math.ceil(viewport.height);
  await pg.render({canvasContext:ctx,viewport}).promise;
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("canvas-to-blob-failed")),"image/jpeg",0.92));
  return ocrBlob(blob,fileName+" — עמוד "+pageNo,base,span);
}
async function pdfText(file,base,span){
  let p;
  try{
    p=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  }catch(err){
    const e=new Error("PDF_OPEN_FAILED");
    e.cause=err;
    throw e;
  }
  const out=[];
  for(let i=1;i<=p.numPages;i++){
    const pageBase=base+span*((i-1)/p.numPages);
    const pageSpan=span/p.numPages;
    prog("קורא PDF: "+file.name+" — "+i+"/"+p.numPages,pageBase);
    const pg=await p.getPage(i);
    let txt="";
    try{
      const tc=await pg.getTextContent();
      txt=pdfRows(tc.items).join("\n");
    }catch{}
    // Image-only/scanned PDFs often return almost no usable text.
    // OCR only those pages instead of failing the whole document.
    const compact=txt.replace(/\s+/g,"").length;
    if(compact<40){
      txt=await ocrPdfPage(pg,file.name,i,pageBase,pageSpan);
    }
    out.push(txt);
  }
  return out.join("\n");
}
async function imageText(file,base,span){
  return ocrBlob(file,file.name,base,span);
}
function prog(t,p){
  $("progressWrap").classList.remove("hidden");$("progressText").textContent=t;
  $("progressPct").textContent=Math.round(p*100)+"%";$("progressBar").style.width=Math.round(p*100)+"%";
}

function hourly(lines){
  const vals=[];
  for(const l of lines)if(/ע\.\s*שעה|ערך\s*שעה\s*\/\s*יום/.test(l))
    vals.push(...lineNums(l).filter(v=>v>=20&&v<=200));
  return median(vals);
}
function metricFromRow(lines,code,rate,factor){
  const row=lines.find(l=>new RegExp("\\b"+code+"\\b").test(l));
  if(!row)return null;
  const xs=lineNums(row).filter(v=>v!==Number(code)&&v>0&&v<100000);
  if(!xs.length)return null;
  const target=rate?rate*factor:null;
  if(target){
    const tariff=xs.filter(v=>v>=5&&v<=500).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
    if(tariff&&Math.abs(tariff-target)/target<.12){
      for(const amount of xs){
        if(amount<=tariff*1.2)continue;
        const q=amount/tariff,shown=xs.find(v=>Math.abs(v-q)<=Math.max(.08,q*.02));
        if(q>0&&q<350&&shown!=null)return {q:shown,tariff,amount};
      }
    }
  }
  return null;
}
function fallbackNear(t,re){
  const m=t.match(re); if(!m)return null;
  const s=String(m[1]).replace(",",".");
  let x=s.match(/^(\d{1,3}):(\d{2})$/);
  if(x)return +x[1]+(+x[2]/60);
  x=s.match(/^(\d{1,3})\.(\d{2})$/);
  if(x&&+x[2]<=59)return +x[1]+(+x[2]/60);
  return Number.isFinite(Number(s))?Number(s):null;
}
function parse(kind,text,file){
  const clean=String(text||"").replace(/[\u200e\u200f]/g," ");
  const lines=clean.split(/\n+/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const d={kind,fileName:file.name,month:month(clean),hourly:null,ot125:null,ot150:null,ot175:null,ot200:null,oncall:null,tariffs:{},confidence:40};
  if(kind==="payslip"){
    d.hourly=hourly(lines);
    for(const o of OT){
      const m=metricFromRow(lines,o.code,d.hourly,o.f);
      if(m){d[o.k]=m.q;d.tariffs[o.k]=m.tariff}
    }
    const on=metricFromRow(lines,"4392",d.hourly,1);
    if(on){d.oncall=on.q;d.tariffs.oncall=on.tariff}
  }else{
    d.ot125=fallbackNear(clean,/(?:125\s*%|שעות\s*נוספות\s*125)[^0-9\n]{0,45}(\d{1,3}(?::\d{2}|[.,]\d+)?)/i);
    d.ot150=fallbackNear(clean,/(?:150\s*%|שעות\s*נוספות\s*150)[^0-9\n]{0,45}(\d{1,3}(?::\d{2}|[.,]\d+)?)/i);
    d.ot175=fallbackNear(clean,/(?:175\s*%|שעות\s*נוספות\s*175)[^0-9\n]{0,45}(\d{1,3}(?::\d{2}|[.,]\d+)?)/i);
    d.ot200=fallbackNear(clean,/(?:200\s*%|שעות\s*נוספות\s*200)[^0-9\n]{0,45}(\d{1,3}(?::\d{2}|[.,]\d+)?)/i);
    d.oncall=fallbackNear(clean,/(?:כוננות\s*חול|כוננות|כוננויות)[^0-9\n]{0,45}(\d{1,3}(?::\d{2}|[.,]\d+)?)/i);
  }
  const vs=OT.map(o=>d[o.k]).filter(Number.isFinite);
  d.otTotal=vs.length?vs.reduce((a,b)=>a+b,0):null;
  if(d.month!=="לא זוהה")d.confidence+=15;
  d.confidence+=Math.min(35,vs.length*9);
  if(kind==="payslip"&&d.hourly)d.confidence+=10;
  return d;
}
function pairs(){
  const a=S.docs.filter(d=>d.kind==="attendance"),p=S.docs.filter(d=>d.kind==="payslip");

  // Payroll pattern validated on the supplied municipal samples:
  // work/attendance month M is normally paid in payslip M+1.
  // Do NOT apply an assumed 24/25 cutoff; compare the full attendance month.
  if(a.length===1&&p.length===1){
    const lag=a[0].month!=="לא זוהה"&&p[0].month===shift(a[0].month,1);
    const same=a[0].month!=="לא זוהה"&&p[0].month===a[0].month;
    const fallback=a[0].month==="לא זוהה"||p[0].month==="לא זוהה"||(!lag&&!same);
    return [{a:a[0],p:p[0],fallback,lag,same}];
  }

  const out=[],used=new Set();
  a.forEach((ad,ai)=>{
    let best=null,score=-1;
    p.forEach((pd,pi)=>{
      if(used.has(pi))return;
      let scoreHere=0;
      if(ad.month!=="לא זוהה"&&pd.month===shift(ad.month,1))scoreHere=140;
      else if(ad.month!=="לא זוהה"&&pd.month===ad.month)scoreHere=80;
      if(scoreHere>score){score=scoreHere;best={pd,pi}}
    });
    if(best&&score>0){
      used.add(best.pi);
      out.push({
        a:ad,p:best.pd,
        fallback:false,
        lag:best.pd.month===shift(ad.month,1),
        same:best.pd.month===ad.month
      });
    }else out.push({a:ad,p:null,fallback:false,lag:false,same:false});
  });

  p.forEach((pd,pi)=>{if(!used.has(pi))out.push({a:null,p:pd,fallback:false,lag:false,same:false})});

  // If OCR missed month labels but counts match, pair by upload order and mark it clearly.
  if(out.some(x=>!x.a||!x.p)&&a.length===p.length){
    const anyUnknown=a.some(x=>x.month==="לא זוהה")||p.some(x=>x.month==="לא זוהה");
    if(anyUnknown)return a.map((ad,i)=>({
      a:ad,p:p[i],fallback:true,
      lag:ad.month!=="לא זוהה"&&p[i].month===shift(ad.month,1),
      same:ad.month!=="לא זוהה"&&p[i].month===ad.month
    }));
  }
  return out;
}
function rows(d){
  if(!d)return '<span class="small">לא נמצא</span>';
  const last=d.kind==="payslip"?"כוננות חול – שעות/כמות":"כוננות";
  return [["125%",d.ot125],["150%",d.ot150],["175%",d.ot175],["200%",d.ot200],[last,d.oncall]]
    .map(([k,v])=>'<div class="data-row"><span>'+esc(k)+'</span><b>'+fmt(v)+'</b></div>').join("");
}
function details(a,p){
  const out=[];
  for(const o of OT){
    const av=a?.[o.k],pv=p?.[o.k];
    if(Number.isFinite(av)&&Number.isFinite(pv)){
      const g=av-pv;
      if(Math.abs(g)>.25)out.push({k:o.k,label:o.label,g,type:g>0?"under":"over"});
    }else if(Number.isFinite(av)&&av>.25&&!Number.isFinite(pv)){
      // Attendance shows payable overtime but the matching payslip category is absent.
      out.push({k:o.k,label:o.label,g:av,type:"missing"});
    }
  }
  return out;
}
function estimate(a,p){
  let sum=0,ok=false;
  for(const o of OT)if(Number.isFinite(a?.[o.k])&&Number.isFinite(p?.[o.k])){
    const g=a[o.k]-p[o.k],t=p.tariffs?.[o.k]??(p.hourly?p.hourly*o.f:null);
    if(g>.02&&t){sum+=g*t;ok=true}
  }
  return ok?sum:null;
}
function render(){
  S.issues=[];const ps=pairs();let bad=0,warn=0,good=0;
  const pays=S.docs.filter(d=>d.kind==="payslip"),rate=median(pays.map(d=>d.hourly));
  $("autoProfile").innerHTML=[
    ["ערך שעה שזוהה",rate?"₪"+fmt(rate):"לא זוהה"],
    ["חודשי תלוש שנקראו",String(pays.filter(d=>d.month!=="לא זוהה").length)],
    ["מקור הנתונים","התלוש שהועלה"],
    ["שמירת מסמכים","לא נשמרים במאגר"]
  ].map(([k,v])=>'<div class="metric"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join("");
  $("autoProfileSection").classList.remove("hidden");

  $("monthResults").innerHTML=ps.map(({a,p,fallback,lag,same})=>{
    const m=a?.month!=="לא זוהה"?a?.month:p?.month||"לא זוהה",flags=[];
    let cls="warn",title="דורש בדיקה",gap=null;
    if(!a){warn++;title="חסר דוח נוכחות";flags.push(["warn","לא נמצא דוח נוכחות מתאים לתלוש."])}
    else if(!p){warn++;title="חסר תלוש";flags.push(["warn","לא נמצא תלוש מתאים לדוח הנוכחות."])}
    else{
      if(fallback)flags.push(["info","המסמכים הותאמו לפי סדר ההעלאה כי החודש לא זוהה בוודאות באחד מהם."]);
      if(lag)flags.push(["info","שיוך חודש: דוח הנוכחות של חודש העבודה הותאם לתלוש של החודש הבא (M→M+1), בהתאם לדפוס שאומת בתלושים שנבדקו. ההשוואה כוללת את כל חודש הנוכחות — ללא חיתוך אוטומטי ב־24/25."]);
      if(same)flags.push(["warn","נמצא תלוש מאותו חודש, אך בדוגמאות שאומתו דוח חודש העבודה משולם בדרך כלל בתלוש של החודש הבא. מומלץ לצרף גם את תלוש M+1."]);
      const ds=details(a,p);gap=Number.isFinite(a.otTotal)&&Number.isFinite(p.otTotal)?a.otTotal-p.otTotal:null;
      if(!ds.length&&gap!=null){good++;cls="ok";title="התאמה טובה";flags.push(["ok","רכיבי השעות שנקראו תואמים בקירוב."])}
      else if(ds.length){
        const big=ds.some(x=>Math.abs(x.g)>1);cls=big?"bad":"warn";title=big?"פער משמעותי לבדיקה":"פער קטן לבדיקה";big?bad++:warn++;
        ds.forEach(x=>{
          const level=(x.type==="missing"||Math.abs(x.g)>1)?"bad":"warn";
          const msg=x.type==="missing"
            ?x.label+": קיימות בדוח "+hh(x.g)+" שעות, אך לא זוהה רכיב מקביל בתלוש."
            :x.label+": פער של "+hh(x.g)+" שעות "+(x.g>0?"לטובת דוח הנוכחות":"לטובת התלוש")+".";
          flags.push([level,msg]);
          if(x.type==="missing"||x.g>0){
            S.issues.push({month:m,text:x.type==="missing"
              ?x.label+": בדוח הנוכחות קיימות "+hh(x.g)+" שעות, אך לא זוהה תשלום מקביל בתלוש."
              :x.label+": בדוח נקראו "+fmt(a[x.k])+" שעות ובתלוש "+fmt(p[x.k])+" שעות; חסרות לכאורה "+hh(x.g)+" שעות לבדיקה."});
          }
        });
      }else{warn++;flags.push(["warn","לא נקראו מספיק רכיבי שעות משני המסמכים."])}
      if(Number.isFinite(p.oncall))flags.push(["info","כוננות חול בתלוש: "+fmt(p.oncall)+" שעות/כמות לחישוב שכר. זה אינו מספר הכוננויות."]);
      const est=estimate(a,p);if(est)flags.push(["info","אומדן כספי גולמי לפי התעריפים שנקראו: כ־₪"+fmt(est)+"."]);
    }
    return '<article class="month"><div class="month-head"><div><div class="month-name">חודש '+esc(m)+'</div><div class="small">תלוש משויך: '+esc(p?.month||"—")+'</div></div><span class="badge '+cls+'">'+title+'</span></div>'+
      '<div class="metrics"><div class="metric"><div class="k">נוכחות — נוספות</div><div class="v">'+(a?.otTotal==null?"—":hh(a.otTotal))+'</div></div><div class="metric"><div class="k">תלוש — נוספות</div><div class="v">'+(p?.otTotal==null?"—":hh(p.otTotal))+'</div></div><div class="metric"><div class="k">פער כולל</div><div class="v">'+(gap==null?"—":hh(gap))+'</div></div><div class="metric"><div class="k">ביטחון קריאה</div><div class="v">'+(a&&p?Math.min(a.confidence,p.confidence)+"%":"—")+'</div></div></div>'+
      '<div class="compare"><div class="side"><h3>🕒 נוכחות</h3>'+rows(a)+'</div><div class="side"><h3>📄 תלוש</h3>'+rows(p)+'</div></div>'+
      '<div class="flags">'+flags.map(([c,t])=>'<div class="flag '+c+'">'+esc(t)+'</div>').join("")+'</div></article>';
  }).join("");

  S.report=ps.map(x=>(x.a?.month||x.p?.month||"לא זוהה")).join("\n");
  const o=$("overall");if(bad){o.className="overall bad";o.textContent="נמצאו פערים משמעותיים לבדיקה."}else if(warn){o.className="overall warn";o.textContent="יש נתונים שדורשים בדיקה או אימות."}else{o.className="overall ok";o.textContent="הנתונים שנקראו נראים תואמים."}
  $("resultsSection").classList.remove("hidden");
  $("reviewRows").innerHTML=S.docs.map((d,i)=>'<div class="review-doc"><b>'+(d.kind==="payslip"?"📄 תלוש":"🕒 נוכחות")+' · '+esc(d.month)+' · '+esc(d.fileName)+'</b></div>').join("");
  $("reviewSection").classList.remove("hidden");
}
function request(){
  if(!S.issues.length)return "שלום,\n\nביצעתי בדיקה של תלוש השכר מול דוח הנוכחות ולא נמצא כרגע פער ברור שניתן לנסח כפנייה. אבקש בדיקה כללית של הנתונים המצורפים.\n\nתודה.";
  return "שלום,\n\nבבדיקה בין דוח הנוכחות לתלוש השכר עלו הנקודות הבאות לבדיקה:\n\n"+S.issues.map((x,i)=>(i+1)+". חודש "+x.month+": "+x.text).join("\n")+"\n\nאבקש לבדוק מול מערכת הנוכחות ורכיבי השכר ולתקן במידת הצורך.\n\nתודה.";
}

function fileKey(f){return [f.name,f.size,f.lastModified].join("::")}
function mergeFiles(current,incoming){
  const seen=new Set(current.map(fileKey)),out=[...current];
  for(const f of incoming){
    const k=fileKey(f);
    if(!seen.has(k)){seen.add(k);out.push(f)}
  }
  return out;
}
function resetVisibleResults(){
  ["autoProfileSection","resultsSection","requestSection","reviewSection"].forEach(id=>$(id)?.classList.add("hidden"));
  $("progressWrap")?.classList.add("hidden");
}
function renderSelectedFiles(){
  const chips=(files,kind)=>files.map((f,i)=>
    '<span class="file-chip file-chip-removable"><span class="file-name">'+esc(f.name)+'</span>'+
    '<button type="button" class="file-remove" data-kind="'+kind+'" data-index="'+i+'" aria-label="הסר '+esc(f.name)+'">×</button></span>'
  ).join("")+(files.length?'<button type="button" class="clear-files" data-kind="'+kind+'">נקה הכל</button>':"");

  $("payList").innerHTML=chips(S.pay,"pay");
  $("attList").innerHTML=chips(S.att,"att");

  document.querySelectorAll(".file-remove").forEach(btn=>btn.onclick=()=>{
    const key=btn.dataset.kind==="pay"?"pay":"att",idx=Number(btn.dataset.index);
    S[key].splice(idx,1);
    resetVisibleResults();
    renderSelectedFiles();
  });
  document.querySelectorAll(".clear-files").forEach(btn=>btn.onclick=()=>{
    const key=btn.dataset.kind==="pay"?"pay":"att";
    S[key]=[];
    const input=$(key==="pay"?"payFiles":"attFiles"); if(input)input.value="";
    resetVisibleResults();
    renderSelectedFiles();
  });
}

$("payFiles").onchange=e=>{
  S.pay=mergeFiles(S.pay,[...e.target.files]);
  e.target.value="";
  resetVisibleResults();
  renderSelectedFiles();
};
$("attFiles").onchange=e=>{
  S.att=mergeFiles(S.att,[...e.target.files]);
  e.target.value="";
  resetVisibleResults();
  renderSelectedFiles();
};
$("requestBtn").onclick=()=>{$("requestText").value=request();$("requestSection").classList.remove("hidden");$("requestSection").scrollIntoView({behavior:"smooth"})};
$("copyRequestBtn").onclick=async()=>{try{await navigator.clipboard.writeText($("requestText").value);$("copyRequestBtn").textContent="הועתק ✓"}catch{}};
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(S.report);$("copyBtn").textContent="הועתק ✓"}catch{}};
$("recalcBtn").onclick=()=>render();

$("analyzeBtn").onclick=async()=>{
  if(!S.pay.length||!S.att.length){alert("צריך לפחות תלוש אחד ודוח נוכחות אחד.");return}
  $("analyzeBtn").disabled=true;S.docs=[];$("requestSection").classList.add("hidden");
  const jobs=[...S.pay.map(file=>({file,kind:"payslip"})),...S.att.map(file=>({file,kind:"attendance"}))];
  const failed=[];
  try{
    for(let i=0;i<jobs.length;i++){
      const j=jobs[i],base=i/jobs.length,span=.94/jobs.length,isPdf=j.file.type==="application/pdf"||j.file.name.toLowerCase().endsWith(".pdf");
      try{
        const text=isPdf?await pdfText(j.file,base,span):await imageText(j.file,base,span);
        if(!String(text||"").trim())throw new Error("EMPTY_TEXT");
        S.docs.push(parse(j.kind,text,j.file));
      }catch(e){
        console.error("Failed file:",j.file.name,e);
        failed.push({name:j.file.name,reason:e?.message||"read-failed"});
        // Continue with the rest of the batch instead of aborting everything.
      }
    }
    if(S.docs.length){
      prog("הניתוח הסתיים",1);
      render();
      $("autoProfileSection").scrollIntoView({behavior:"smooth"});
    }
    if(failed.length){
      const names=failed.map(x=>"• "+x.name+" ["+x.reason+"]").join("\n");
      alert("הבדיקה המשיכה, אבל לא הצלחתי לקרוא "+failed.length+" קובץ/ים:\n"+names+"\n\nאפשר להסיר אותם מהרשימה ולנסות שוב, או להעלות PDF מקורי/צילום חד.");
    }else if(!S.docs.length){
      alert("לא הצלחתי לקרוא אף אחד מהקבצים שנבחרו. נסה PDF מקורי או צילום חד יותר.");
    }
  }finally{$("analyzeBtn").disabled=false}
};