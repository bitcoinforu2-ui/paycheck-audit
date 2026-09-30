const $=id=>document.getElementById(id);
const state={payFiles:[],attFiles:[],docs:[],issues:[],report:"",auto:{}};

const pdfjsLib=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const payCodes={
  "1125":{key:"ot125",label:"125%",factor:1.25},
  "1150":{key:"ot150",label:"150%",factor:1.50},
  "1138":{key:"ot175",label:"175%",factor:1.75},
  "1119":{key:"ot200",label:"200%",factor:2.00},
  "4392":{key:"oncall",label:"כוננות",factor:1.00}
};
const cats=[
  {key:"ot125",label:"125%",factor:1.25},
  {key:"ot150",label:"150%",factor:1.50},
  {key:"ot175",label:"175%",factor:1.75},
  {key:"ot200",label:"200%",factor:2.00}
];

function n(v){
  if(v===null||v===undefined||v==="")return null;
  const x=Number(String(v).replace(/,/g,"").replace(/[^0-9.\-]/g,""));
  return Number.isFinite(x)?x:null;
}
function numToken(s){
  const x=Number(String(s).replace(/,/g,""));
  return Number.isFinite(x)?x:null;
}
function fmt(v,d=2){return v==null?"—":Number(v).toLocaleString("he-IL",{maximumFractionDigits:d})}
function hhmm(v){
  if(v==null)return "—";
  const sign=v<0?"-":"";
  const t=Math.round(Math.abs(v)*60),h=Math.floor(t/60),m=t%60;
  return sign+h+":"+String(m).padStart(2,"0");
}
function toHours(v){
  if(v==null)return null;
  const s=String(v).trim().replace(",",".");
  const m=s.match(/^(\d{1,3})[:.](\d{2})$/);
  if(m&&+m[2]<60)return +m[1]+(+m[2]/60);
  const x=Number(s.replace(/[^0-9.\-]/g,""));
  return Number.isFinite(x)?x:null;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function median(a){
  const x=a.filter(v=>Number.isFinite(v)).sort((p,q)=>p-q);
  if(!x.length)return null;
  const m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
}
function uniqVals(a,tol=.05){
  const out=[];
  for(const v of a.filter(Number.isFinite)){
    if(!out.some(x=>Math.abs(x-v)<=tol))out.push(v);
  }
  return out;
}
function monthFrom(text){
  const t=String(text||"");
  const he={ינואר:1,פברואר:2,מרץ:3,אפריל:4,מאי:5,יוני:6,יולי:7,אוגוסט:8,ספטמבר:9,אוקטובר:10,נובמבר:11,דצמבר:12};
  for(const [name,mn] of Object.entries(he)){
    const a=t.match(new RegExp(name+"\\s*(20\\d{2})"));
    const b=t.match(new RegExp("(20\\d{2})\\s*"+name));
    const y=a?.[1]||b?.[1];
    if(y)return String(mn).padStart(2,"0")+"/"+y;
  }
  let m=t.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})\b/);
  if(m)return String(+m[1]).padStart(2,"0")+"/"+m[2];
  m=t.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(2\d)\b/);
  if(m)return String(+m[1]).padStart(2,"0")+"/20"+m[2];
  return "לא זוהה";
}
function monthShift(mm,delta){
  if(!mm||mm==="לא זוהה")return null;
  const [m,y]=mm.split("/").map(Number);
  const d=new Date(y,m-1+delta,1);
  return String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear();
}

$("payFiles").onchange=e=>{state.payFiles=[...e.target.files];renderFiles()};
$("attFiles").onchange=e=>{state.attFiles=[...e.target.files];renderFiles()};
function renderFiles(){
  $("payList").innerHTML=state.payFiles.map(f=>'<span class="file-chip">'+esc(f.name)+'</span>').join("");
  $("attList").innerHTML=state.attFiles.map(f=>'<span class="file-chip">'+esc(f.name)+'</span>').join("");
}
function progress(txt,p){
  $("progressWrap").classList.remove("hidden");
  $("progressText").textContent=txt;
  $("progressPct").textContent=Math.round(p*100)+"%";
  $("progressBar").style.width=Math.round(p*100)+"%";
}

function groupPdfLines(items){
  const rows=[];
  for(const it of items){
    const str=(it.str||"").trim();
    if(!str)continue;
    const y=it.transform?.[5]??0;
    let row=rows.find(r=>Math.abs(r.y-y)<2.2);
    if(!row){row={y,items:[]};rows.push(row)}
    row.items.push({x:it.transform?.[4]??0,str});
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>{
    const asc=r.items.slice().sort((a,b)=>a.x-b.x).map(x=>x.str).join(" ");
    const desc=r.items.slice().sort((a,b)=>b.x-a.x).map(x=>x.str).join(" ");
    return asc+"   ||   "+desc;
  });
}
async function pdfText(file,base,span){
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++){
    progress("קורא PDF: "+file.name+" — "+i+"/"+pdf.numPages,base+span*((i-1)/pdf.numPages));
    const page=await pdf.getPage(i);
    const tc=await page.getTextContent();
    pages.push(groupPdfLines(tc.items).join("\n"));
  }
  return pages.join("\n");
}
async function imageText(file,base,span){
  const res=await Tesseract.recognize(file,"heb+eng",{logger:m=>{
    if(m.status==="recognizing text")progress("OCR: "+file.name,base+span*(m.progress||0));
  }});
  return res.data.text||"";
}

function lineNumbers(line){
  const raw=(String(line).match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g)||[]);
  return raw.map(s=>({raw:s,val:numToken(s)})).filter(x=>x.val!=null);
}
function detectHourlyRate(lines,text){
  const candidates=[];
  for(const line of lines){
    if(/ע\.\s*שעה|ערך\s*שעה\s*\/\s*יום/i.test(line)){
      for(const x of lineNumbers(line)){
        if(x.val>=20&&x.val<=200&&/\./.test(x.raw))candidates.push(x.val);
      }
    }
  }
  if(candidates.length)return median(candidates);
  const m=String(text).match(/ע\.\s*שעה[^\n]{0,100}?(\d{2,3}[.,]\d{2})/i);
  return m?Number(m[1].replace(",",".")):null;
}
function detectWeeklyHours(lines){
  for(const line of lines){
    if(/שעות\s*שבועיות/i.test(line)){
      const vals=lineNumbers(line).map(x=>x.val).filter(v=>v>=10&&v<=60);
      if(vals.length)return vals[0];
    }
  }
  return null;
}
function detectEmploymentStatus(text){
  const m=String(text).match(/מעמד\s*:\s*([^\n|]{2,30})/i);
  return m?m[1].trim():null;
}
function bestRowMetric(line,codeInfo,hourlyRate){
  const nums=lineNumbers(line)
    .map(x=>x.val)
    .filter(v=>v!==Number(codeInfo.code)&&v>0&&v<100000);
  if(!nums.length)return null;

  const factor=codeInfo.factor;
  let tariff=null;
  if(hourlyRate!=null){
    const target=hourlyRate*factor;
    const near=nums.filter(v=>v>=5&&v<=500).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
    if(near.length&&Math.abs(near[0]-target)/target<0.12)tariff=near[0];
  }
  if(tariff==null&&codeInfo.key==="oncall"&&hourlyRate!=null)tariff=hourlyRate;

  let best=null;
  if(tariff!=null){
    for(const amount of nums){
      if(amount<5||Math.abs(amount-tariff)<0.01)continue;
      const q=amount/tariff;
      if(q<=0||q>350)continue;
      const qShown=nums.find(v=>Math.abs(v-q)<=Math.max(.06,q*.015));
      const score=(qShown!=null?0:2)+Math.abs((qShown??q)-q);
      if(!best||score<best.score)best={qty:qShown??q,amount,tariff,score};
    }
  }
  if(best)return best;

  for(let i=0;i<nums.length;i++){
    for(let j=0;j<nums.length;j++){
      if(i===j)continue;
      const q=nums[i],amount=nums[j];
      if(q<=0||q>350||amount<=q)continue;
      const implied=amount/q;
      if(hourlyRate!=null){
        const target=hourlyRate*factor;
        const err=Math.abs(implied-target)/target;
        if(err<.08&&(!best||err<best.score))best={qty:q,amount,tariff:implied,score:err};
      }
    }
  }
  return best;
}
function parsePayslipMetrics(lines,text,d){
  d.hourlyRate=detectHourlyRate(lines,text);
  d.weeklyHours=detectWeeklyHours(lines);
  d.employmentStatus=detectEmploymentStatus(text);
  d.tariffs={};
  d.amounts={};

  for(const [code,info0] of Object.entries(payCodes)){
    const info={...info0,code};
    const labelRegex={
      "1125":/125/,
      "1150":/150/,
      "1138":/175/,
      "1119":/200/,
      "4392":/כוננות/
    }[code];
    const candidates=lines.filter(line=>new RegExp("\\b"+code+"\\b").test(line)||(labelRegex.test(line)&&/(שעות|ש\.נ|כוננות)/.test(line)));
    let best=null;
    for(const line of candidates){
      const m=bestRowMetric(line,info,d.hourlyRate);
      if(m&&(!best||m.score<best.score))best=m;
    }
    if(best){
      d[info.key]=best.qty;
      d.tariffs[info.key]=best.tariff;
      d.amounts[info.key]=best.amount;
    }
  }

  // OCR / plain-text fallback when a whole row is readable.
  const fallback={
    ot125:[/(?:שעות\s*נוספות\s*%?\s*125|ש\.נ\.\s*%?\s*125)[^\n]{0,100}/i],
    ot150:[/(?:שעות\s*נוספות\s*%?\s*150|ש\.נ\.\s*%?\s*150)[^\n]{0,100}/i],
    ot175:[/(?:ש\.נ\.\s*שב\.?\s*%?\s*175|175\s*%)[^\n]{0,100}/i],
    ot200:[/(?:ש\.נ\.\s*%?\s*200|200\s*%)[^\n]{0,100}/i],
    oncall:[/(?:כוננות\s*חול|כוננות)[^\n]{0,100}/i]
  };
  for(const [key,regs] of Object.entries(fallback)){
    if(d[key]!=null)continue;
    for(const re of regs){
      const m=String(text).match(re);
      if(!m)continue;
      const info=Object.values(payCodes).find(x=>x.key===key);
      const guessed=bestRowMetric(m[0],{...info,code:"0"},d.hourlyRate);
      if(guessed){d[key]=guessed.qty;d.tariffs[key]=guessed.tariff;d.amounts[key]=guessed.amount;break}
    }
  }
}
function firstNear(t,patterns){
  for(const p of patterns){
    const m=t.match(p);
    if(m){
      const v=toHours(m[1]);
      if(v!=null)return v;
    }
  }
  return null;
}
function parseAttendance(text,d){
  const t=String(text||"");
  const pats={
    ot125:[/(?:125\s*%|שעות\s*נוספות\s*125)[^0-9\n]{0,40}(\d{1,3}(?:[:.]\d{2})?)/i],
    ot150:[/(?:150\s*%|שעות\s*נוספות\s*150)[^0-9\n]{0,40}(\d{1,3}(?:[:.]\d{2})?)/i],
    ot175:[/(?:175\s*%|שעות\s*נוספות\s*175)[^0-9\n]{0,40}(\d{1,3}(?:[:.]\d{2})?)/i],
    ot200:[/(?:200\s*%|שעות\s*נוספות\s*200)[^0-9\n]{0,40}(\d{1,3}(?:[:.]\d{2})?)/i],
    oncall:[/(?:כוננ(?:ות|ת)|כוננות)[^0-9\n]{0,40}(\d+(?:[.,]\d+)?)/i]
  };
  for(const k of Object.keys(pats))d[k]=firstNear(t,pats[k]);
}
function parse(kind,text,file){
  const clean=String(text||"").replace(/[\u200e\u200f]/g," ");
  const lines=clean.split(/\n+/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const d={kind,fileName:file.name,month:monthFrom(clean),ot125:null,ot150:null,ot175:null,ot200:null,oncall:null,confidence:35,text:clean,hourlyRate:null,weeklyHours:null,employmentStatus:null,tariffs:{},amounts:{}};

  if(kind==="payslip")parsePayslipMetrics(lines,clean,d);
  else parseAttendance(clean,d);

  const vals=cats.map(c=>d[c.key]).filter(v=>v!=null);
  d.otTotal=vals.length?vals.reduce((a,b)=>a+b,0):null;
  let score=35;
  if(d.month!=="לא זוהה")score+=15;
  score+=Math.min(30,vals.length*8);
  if(kind==="payslip"&&d.hourlyRate!=null)score+=15;
  if(d.oncall!=null)score+=5;
  d.confidence=Math.min(95,score);
  return d;
}
function pairDocs(){
  const a=state.docs.filter(d=>d.kind==="attendance");
  const p=state.docs.filter(d=>d.kind==="payslip");
  const used=new Set(),pairs=[];
  for(const ad of a){
    let best=null,bestScore=-1e9;
    p.forEach((pd,i)=>{
      if(used.has(i))return;
      let s=0;
      if(pd.month===ad.month)s+=120;
      else if(pd.month===monthShift(ad.month,1))s+=70;
      if(pd.otTotal!=null&&ad.otTotal!=null)s-=Math.min(50,Math.abs(pd.otTotal-ad.otTotal));
      if(s>bestScore){bestScore=s;best={pd,i}}
    });
    if(best&&bestScore>0){used.add(best.i);pairs.push({a:ad,p:best.pd,lag:best.pd.month===monthShift(ad.month,1)})}
    else pairs.push({a:ad,p:null,lag:false});
  }
  p.forEach((pd,i)=>{if(!used.has(i))pairs.push({a:null,p:pd,lag:false})});
  return pairs;
}
function rows(d){
  if(!d)return '<span class="small">לא נמצא</span>';
  return [["125%",d.ot125],["150%",d.ot150],["175%",d.ot175],["200%",d.ot200],["כוננות",d.oncall]]
    .map(([k,v])=>'<div class="data-row"><span>'+k+'</span><b>'+(v==null?"—":fmt(v))+'</b></div>').join("");
}
function autoProfile(){
  const pays=state.docs.filter(d=>d.kind==="payslip");
  const rates=uniqVals(pays.map(d=>d.hourlyRate));
  const weeks=uniqVals(pays.map(d=>d.weeklyHours));
  const statuses=[...new Set(pays.map(d=>d.employmentStatus).filter(Boolean))];
  state.auto={
    hourlyRate:median(pays.map(d=>d.hourlyRate)),
    weeklyHours:median(pays.map(d=>d.weeklyHours)),
    rates,weeks,statuses,
    months:pays.map(d=>d.month).filter(m=>m!=="לא זוהה")
  };
  const cards=[
    ["ערך שעה שזוהה",state.auto.hourlyRate==null?"לא זוהה":"₪"+fmt(state.auto.hourlyRate)],
    ["שעות שבועיות",state.auto.weeklyHours==null?"לא זוהה":fmt(state.auto.weeklyHours)],
    ["חודשי תלוש שנקראו",String(state.auto.months.length)],
    ["מעמד",statuses[0]||"לא זוהה"]
  ];
  $("autoProfile").innerHTML=cards.map(([k,v])=>'<div class="metric"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div></div>').join("");
  $("autoProfileSection").classList.remove("hidden");
}
function moneyEstimate(a,p){
  if(!a||!p)return null;
  let total=0,has=false;
  for(const c of cats){
    if(a[c.key]==null||p[c.key]==null)continue;
    const gap=a[c.key]-p[c.key];
    if(gap<=.02)continue;
    const tariff=p.tariffs?.[c.key]??(p.hourlyRate!=null?p.hourlyRate*c.factor:null);
    if(tariff!=null){total+=gap*tariff;has=true}
  }
  if(a.oncall!=null&&p.oncall!=null){
    const gap=a.oncall-p.oncall;
    if(gap>.02){
      const tariff=p.tariffs?.oncall??p.hourlyRate;
      if(tariff!=null){total+=gap*tariff;has=true}
    }
  }
  return has?total:null;
}
function compareDetails(a,p){
  const out=[];
  for(const c of cats){
    if(a?.[c.key]==null||p?.[c.key]==null)continue;
    const gap=a[c.key]-p[c.key];
    if(Math.abs(gap)>.25)out.push({key:c.key,label:c.label,gap});
  }
  if(a?.oncall!=null&&p?.oncall!=null){
    const gap=a.oncall-p.oncall;
    if(Math.abs(gap)>.25)out.push({key:"oncall",label:"כוננות",gap});
  }
  return out;
}
function buildResults(){
  state.issues=[];
  autoProfile();
  const pairs=pairDocs();
  let severe=0,warn=0,ok=0;
  const summaries=[];

  $("monthResults").innerHTML=pairs.map(({a,p,lag})=>{
    const workMonth=a?.month||p?.month||"לא זוהה";
    let cls="info",title="חסר מסמך משלים",flags=[],gap=null;
    let estimate=null;

    if(!a){warn++;cls="warn";title="חסר דוח נוכחות";flags.push(["warn","לא נמצא דוח נוכחות מתאים לתלוש."])}
    if(!p){warn++;cls="warn";title="חסר תלוש";flags.push(["warn","לא נמצא תלוש מתאים לתקופת העבודה."])}

    if(a&&p){
      if(lag)flags.push(["info","התלוש הקרוב ביותר הוא מהחודש העוקב. מומלץ לוודא שזה אכן חודש התשלום של הרכיבים המדווחים."]);

      const details=compareDetails(a,p);
      if(a.otTotal!=null&&p.otTotal!=null)gap=a.otTotal-p.otTotal;

      if(!details.length&&a.otTotal!=null&&p.otTotal!=null){
        ok++;cls="ok";title="התאמה טובה";
        flags.push(["ok","רכיבי השעות שנקראו מהנוכחות ומהתלוש תואמים בקירוב."]);
      }else if(details.length){
        const big=details.some(x=>Math.abs(x.gap)>1);
        if(big){severe++;cls="bad";title="פער משמעותי לבדיקה"}
        else{warn++;cls="warn";title="פער קטן לבדיקה"}
        details.forEach(x=>{
          const dir=x.gap>0?"חסרות בתלוש":"מופיעות בתלוש יותר";
          flags.push([Math.abs(x.gap)>1?"bad":"warn",x.label+": "+dir+" כ־"+hhmm(Math.abs(x.gap))+(x.key==="oncall"?" יחידות":" שעות")+"."]);
          if(x.gap>0)state.issues.push({month:workMonth,text:x.label+": בדוח הנוכחות נקראו "+fmt(a[x.key])+" ובתלוש נקראו "+fmt(p[x.key])+". פער לבדיקה: "+fmt(x.gap)+(x.key==="oncall"?" יחידות.":" שעות.")});
        });
      }else{
        warn++;cls="warn";title="לא נקראו מספיק נתונים";
        flags.push(["warn","לא הצלחתי לחלץ מספיק רכיבים משני המסמכים. אפשר לפתוח את בדיקת הנתונים הידנית למטה."]);
      }

      estimate=moneyEstimate(a,p);
      if(estimate!=null&&estimate>0){
        flags.push(["info","אומדן כספי גולמי לפי התעריפים שזוהו בתלוש: כ־₪"+fmt(estimate)+"."]);
        const last=state.issues[state.issues.length-1];
        if(last&&last.month===workMonth)last.estimate=estimate;
      }
      if(p.hourlyRate!=null)flags.push(["info","ערך שעה שנקרא מהתלוש: ₪"+fmt(p.hourlyRate)+"."]);
      if(Math.min(a.confidence,p.confidence)<65)flags.push(["warn","רמת הביטחון בקריאה נמוכה יחסית — מומלץ לאמת את המספרים באזור הבדיקה הידנית."]);
    }

    summaries.push(workMonth+": "+title+(gap==null?"":" | פער כולל "+hhmm(gap)));
    return '<article class="month"><div class="month-head"><div><div class="month-name">חודש '+esc(workMonth)+'</div><div class="small">תלוש משויך: '+esc(p?.month||"—")+'</div></div><span class="badge '+cls+'">'+title+'</span></div>'+
      '<div class="metrics"><div class="metric"><div class="k">נוכחות — נוספות</div><div class="v">'+(a?.otTotal==null?"—":hhmm(a.otTotal))+'</div></div>'+
      '<div class="metric"><div class="k">תלוש — נוספות</div><div class="v">'+(p?.otTotal==null?"—":hhmm(p.otTotal))+'</div></div>'+
      '<div class="metric"><div class="k">פער כולל</div><div class="v">'+(gap==null?"—":hhmm(gap))+'</div></div>'+
      '<div class="metric"><div class="k">ביטחון קריאה</div><div class="v">'+(a&&p?Math.min(a.confidence,p.confidence)+"%":"—")+'</div></div></div>'+
      '<div class="compare"><div class="side"><h3>🕒 נוכחות</h3>'+rows(a)+'</div><div class="side"><h3>📄 תלוש</h3>'+rows(p)+'</div></div>'+
      '<div class="flags">'+flags.map(([c,t])=>'<div class="flag '+c+'">'+esc(t)+'</div>').join("")+'</div></article>';
  }).join("");

  state.report=summaries.join("\n");
  const o=$("overall");
  if(severe){o.className="overall bad";o.textContent="נמצאו "+severe+" תקופות עם פער משמעותי לבדיקה."}
  else if(warn){o.className="overall warn";o.textContent="יש "+warn+" נקודות שדורשות בדיקה או אימות."}
  else{o.className="overall ok";o.textContent="הנתונים שנקראו נראים תואמים."}
  $("resultsSection").classList.remove("hidden");
  buildReview();
}
function buildReview(){
  $("reviewRows").innerHTML=state.docs.map((d,i)=>{
    const extra=d.kind==="payslip"?'<label>ערך שעה<input data-i="'+i+'" data-k="hourlyRate" value="'+(d.hourlyRate??"")+'" inputmode="decimal"></label>':"";
    return '<div class="review-doc"><b>'+(d.kind==="payslip"?"📄 תלוש":"🕒 נוכחות")+' · '+esc(d.month)+' · '+esc(d.fileName)+'</b><div class="review-grid">'+
      ["ot125","ot150","ot175","ot200","oncall"].map(k=>'<label>'+(k==="oncall"?"כוננות":k.replace("ot","")+"%")+'<input data-i="'+i+'" data-k="'+k+'" value="'+(d[k]??"")+'" inputmode="decimal"></label>').join("")+
      extra+'</div></div>';
  }).join("");
  $("reviewSection").classList.remove("hidden");
}
$("recalcBtn").onclick=()=>{
  document.querySelectorAll("#reviewRows input").forEach(inp=>{
    const d=state.docs[+inp.dataset.i];
    d[inp.dataset.k]=n(inp.value);
  });
  state.docs.forEach(d=>{
    const v=cats.map(c=>d[c.key]).filter(x=>x!=null);
    d.otTotal=v.length?v.reduce((a,b)=>a+b,0):null;
    if(d.kind==="payslip"&&d.hourlyRate!=null){
      d.tariffs=d.tariffs||{};
      for(const c of cats)if(d.tariffs[c.key]==null)d.tariffs[c.key]=d.hourlyRate*c.factor;
      if(d.tariffs.oncall==null)d.tariffs.oncall=d.hourlyRate;
    }
  });
  buildResults();
  $("resultsSection").scrollIntoView({behavior:"smooth"});
};

function requestText(){
  if(!state.issues.length){
    return "שלום,\n\nביצעתי בדיקה של תלוש השכר מול דוח הנוכחות ולא נמצא כרגע פער ברור שניתן לנסח כפנייה. אבקש בדיקה כללית של הנתונים המצורפים.\n\nתודה.";
  }
  const lines=state.issues.map((x,i)=>(i+1)+". חודש "+x.month+": "+x.text+(x.estimate!=null?" אומדן גולמי לפער: כ־₪"+fmt(x.estimate)+".":""));
  return "שלום,\n\nבבדיקה שערכתי בין דוח הנוכחות לבין תלוש השכר, עלו הנקודות הבאות לבדיקה:\n\n"+lines.join("\n")+"\n\nאבקש לבדוק את הנתונים מול מערכת הנוכחות ורכיבי השכר ולבצע תיקון במידת הצורך.\n\nתודה.";
}
$("copyBtn").onclick=async()=>{
  const t="סיכום בדיקת שכר מול נוכחות\n\n"+state.report;
  try{await navigator.clipboard.writeText(t);$("copyBtn").textContent="הועתק ✓";setTimeout(()=>$("copyBtn").textContent="העתק סיכום",1200)}
  catch{alert(t)}
};
$("requestBtn").onclick=()=>{
  $("requestText").value=requestText();
  $("requestSection").classList.remove("hidden");
  $("requestSection").scrollIntoView({behavior:"smooth"});
};
$("copyRequestBtn").onclick=async()=>{
  const t=$("requestText").value||requestText();
  try{await navigator.clipboard.writeText(t);$("copyRequestBtn").textContent="הועתק ✓";setTimeout(()=>$("copyRequestBtn").textContent="העתק פנייה",1200)}
  catch{alert(t)}
};

$("analyzeBtn").onclick=async()=>{
  if(!state.payFiles.length||!state.attFiles.length){
    alert("צריך לפחות תלוש שכר אחד ודוח נוכחות אחד.");
    return;
  }
  $("analyzeBtn").disabled=true;
  state.docs=[];state.issues=[];
  $("requestSection").classList.add("hidden");
  $("resultsSection").classList.add("hidden");
  $("autoProfileSection").classList.add("hidden");

  const jobs=[
    ...state.payFiles.map(file=>({file,kind:"payslip"})),
    ...state.attFiles.map(file=>({file,kind:"attendance"}))
  ];
  try{
    for(let i=0;i<jobs.length;i++){
      const j=jobs[i],base=i/jobs.length,span=.94/jobs.length;
      const isPdf=j.file.type==="application/pdf"||j.file.name.toLowerCase().endsWith(".pdf");
      const text=isPdf?await pdfText(j.file,base,span):await imageText(j.file,base,span);
      state.docs.push(parse(j.kind,text,j.file));
    }
    progress("הניתוח הסתיים",1);
    buildResults();
    $("autoProfileSection").scrollIntoView({behavior:"smooth"});
  }catch(e){
    console.error(e);
    alert("הייתה שגיאה בקריאת אחד הקבצים. נסה PDF מקורי או צילום חד יותר.");
  }finally{
    $("analyzeBtn").disabled=false;
  }
};