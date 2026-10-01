const $=id=>document.getElementById(id);
const S={pay:[],att:[],docs:[],issues:[],report:"",insufficient:false};

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


// Identify documents by multiple content signatures, never by upload bucket.
// Absence or contradictory evidence => manual review, not automatic classification.
function detectDocumentKind(text){
  const t=String(text||"").replace(/[\u200e\u200f]/g," ").replace(/\s+/g," ");
  const features={
    payslip:[
      [/(?:שכר\s*בסיס|סיסב\s*רכש)/,5],
      [/(?:ניכויי?\s*חובה|הבוח\s*ייוכינ)/,4],
      [/(?:סכום\s*בבנק|קנבב\s*םוכס)/,4],
      [/(?:ברוטו\s*שוטף|ףטוש\s*וטורב)/,4],
      [/(?:תלוש\s*שכר|שכר\s*נטו|וטנ\s*רכש)/,3],
      [/(?:ברוטו\s*למס\s*הכנסה|הסנכה\s*סמל\s*וטורב)/,3],
      [/(?:94010|91001|92041)/,2]
    ],
    attendance:[
      [/(?:גליון\s*נוכחות|גיליון\s*נוכחות|ןוילג\s*תוחכונ|תוחכונ\s*םכסמ)/,7],
      [/(?:משמרות\s*רגילות|תוליגרתורמשמ|הסכם\s*סוג)/,3],
      [/(?:\b19410\b)/,3],
      [/(?:כניסה.{0,20}יציאה|הסינכ.{0,30}האיצי)/,3],
      [/(?:תועש\s*,?%\s*תופסונ|תופסונמףדע|שעות\s*נוספות.{0,25}(?:125|150|175|200))/,3],
      [/(?:עובשלתועש|לשבוע\s*שעות|שעות\s*לשבוע)/,2]
    ]
  };
  const score=kind=>features[kind].reduce((n,[re,points])=>n+(re.test(t)?points:0),0);
  const pay=score("payslip"),att=score("attendance");
  if(pay>=6&&pay>=att+4)return {kind:"payslip",confidence:pay,reason:"content-signatures"};
  if(att>=6&&att>=pay+4)return {kind:"attendance",confidence:att,reason:"content-signatures"};
  return {kind:"unknown",confidence:0,reason:"insufficient-or-ambiguous-signatures"};
}

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
// Attendance PDFs from this municipal export have reversed Hebrew text, but
// stable visual numeric columns. Read the MONTHLY TOTAL row geometrically.
function attendancePdfTotals(items,width,height){
  const factor=width/595,rows=[];
  for(const it of items){
    const x=Number(it.transform?.[4]),y=Number(it.transform?.[5]),str=String(it.str||"").trim();
    if(!str||!Number.isFinite(x)||!Number.isFinite(y))continue;
    let row=rows.find(r=>Math.abs(r.y-y)<2);
    if(!row){row={y,items:[]};rows.push(row)}
    row.items.push({x:x/factor,str});
  }
  const read=(r,lo,hi)=>{
    const txt=r.items.filter(it=>it.x>=lo&&it.x<hi).sort((a,b)=>a.x-b.x)
      .map(it=>it.str).join("").replace(/[\s|_]/g,"");
    if(!txt)return {present:false,value:null};
    const m=txt.match(/^(\d{1,3})[.:](\d{2})$/);
    return {present:true,value:m&&+m[2]<60?Number(m[1])+Number(m[2])/60:null};
  };
  const found=[];
  for(const row of rows){
    const top=height-row.y;
    if(top<height*.48||top>height*.82)continue;
    const anchors=[[339,370],[308,340],[280,309]].map(a=>read(row,...a));
    if(anchors.some(a=>!Number.isFinite(a.value)))continue;
    const cols={ot125:[173,205],ot150:[150,174.9],ot175:[123,149.9],ot200:[96,122.9]};
    const values={},present={};
    for(const [key,range] of Object.entries(cols)){
      const cell=read(row,...range);values[key]=cell.value;present[key]=cell.present;
    }
    if(Object.values(present).some((p,i)=>p&&!Number.isFinite(Object.values(values)[i])))continue;
    const nonempty=Object.values(present).filter(Boolean).length;
    if(!nonempty||anchors[1].value>400)continue;
    // Empty cells only mean zero when all independent monthly-row anchors exist.
    for(const key of Object.keys(values))if(!present[key])values[key]=0;
    if(Object.values(values).some(v=>v>80)||Object.values(values).reduce((a,b)=>a+b,0)>180)continue;
    found.push({values,columns:nonempty,method:"pdf-positioned-monthly-summary",
      required:anchors[0].value,accrued:anchors[1].value,remainder:anchors[2].value});
  }
  return found.length===1?found[0]:null;
}
// Some report headings contain visibly printed month text NOT exposed via the
// PDF text layer. OCR only this tiny, isolated heading without the report date.
async function attendancePdfMonth(page){
  const scale=3.5,view=page.getViewport({scale}),full=document.createElement("canvas");
  full.width=Math.ceil(view.width);full.height=Math.ceil(view.height);
  await page.render({canvasContext:full.getContext("2d"),viewport:view}).promise;
  const small=document.createElement("canvas");
  small.width=Math.round(full.width*.19);small.height=Math.round(50*scale);
  const ctx=small.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,small.width,small.height);
  ctx.drawImage(full,Math.round(full.width*.285),0,small.width,small.height,0,0,small.width,small.height);
  const blob=await canvasBlob(small,"image/png");
  const r=await Tesseract.recognize(blob,"eng",{tessedit_char_whitelist:"0123456789/.-"});
  const months=[...new Set([...String(r.data?.text||"").matchAll(/(?:^|[^\d])(0?[1-9]|1[0-2])[/.-](20\d{2})(?!\d)/g)]
    .map(m=>String(+m[1]).padStart(2,"0")+"/"+m[2]))];
  return months.length===1?months[0]:null;
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
async function pdfText(file,base,span,kind){
  let p;try{p=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise}
  catch(err){throw new Error("PDF_OPEN_FAILED",{cause:err})}
  const out=[],sums=[],months=[];
  for(let i=1;i<=p.numPages;i++){
    const pb=base+span*((i-1)/p.numPages),ps=span/p.numPages;
    prog("קורא PDF: "+file.name+" — "+i+"/"+p.numPages,pb);
    const pg=await p.getPage(i);
    let txt="",tc=null;
    try{tc=await pg.getTextContent();txt=pdfRows(tc.items).join("\n")}catch{}
    // The caller's upload slot cannot determine the document type.
    // Probe geometry when selectable text identifies an attendance report.
    // OCR a scanned PDF before document classification.
    if(txt.replace(/\s+/g,"").length<40)
      txt=await ocrPdfPage(pg,file.name,i,pb,ps);
    const classified=detectDocumentKind(txt);
    if(classified.kind==="attendance"){
      if(tc){
        const v=attendancePdfTotals(tc.items,pg.view[2]-pg.view[0],pg.view[3]-pg.view[1]);
        if(v)sums.push(v);
      }
      try{const month=await attendancePdfMonth(pg);if(month)months.push(month)}
      catch(err){console.warn("Attendance month unreadable",err?.message)}
    }
    out.push(txt);
  }
  if(sums.length||months.length){
    const distinct=[...new Set(sums.map(x=>JSON.stringify(x.values)))];
    const uniqueMonths=[...new Set(months)];
    out.unshift("@@ATT_PDF_META "+JSON.stringify({month:uniqueMonths.length===1?uniqueMonths[0]:null,
      summary:distinct.length===1?sums[0]:null})+" @@");
  }
  return out.join("\n");
}
function canvasBlob(canvas,type="image/jpeg",quality=.95){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("CANVAS_BLOB_FAILED")),type,quality));
}
function preparedCanvas(bmp,scale=1){
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bmp.width*scale));
  canvas.height=Math.max(1,Math.round(bmp.height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.filter="grayscale(1) contrast(1.65)";
  ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
  return canvas;
}
function cropCanvas(source,y0,y1){
  const h=Math.max(1,y1-y0);
  const canvas=document.createElement("canvas");
  canvas.width=source.width;canvas.height=h;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,0,y0,source.width,h,0,0,source.width,h);
  return canvas;
}
async function imageText(file,base,span){
  try{
    const bmp=await createImageBitmap(file);
    const longSide=Math.max(bmp.width,bmp.height);
    const scale=Math.max(1,Math.min(3.2,4600/longSide));
    const source=preparedCanvas(bmp,scale);
    const texts=[];

    // First pass: full page. Good for month/header and document classification.
    const fullMax=3000;
    let fullCanvas=source;
    if(Math.max(source.width,source.height)>fullMax){
      const fullScale=fullMax/Math.max(source.width,source.height);
      const small=document.createElement("canvas");
      small.width=Math.max(1,Math.round(source.width*fullScale));
      small.height=Math.max(1,Math.round(source.height*fullScale));
      const c=small.getContext("2d",{willReadFrequently:true});
      c.drawImage(source,0,0,small.width,small.height);
      fullCanvas=small;
    }
    prog("OCR כללי: "+file.name,base);
    texts.push(await ocrBlob(await canvasBlob(fullCanvas),file.name+" — עמוד מלא",base,span*.24));

    // Second pass: overlapping horizontal tiles. This is the key path for screenshots:
    // small payroll/attendance tables become large enough for OCR to read numbers reliably.
    const aspect=source.height/Math.max(1,source.width);
    const tiles=aspect>2.6?5:aspect>1.65?4:3;
    const overlap=.14;
    const step=source.height/tiles;
    for(let i=0;i<tiles;i++){
      const y0=Math.max(0,Math.floor(i*step-step*overlap));
      const y1=Math.min(source.height,Math.ceil((i+1)*step+step*overlap));
      const tile=cropCanvas(source,y0,y1);
      const pBase=base+span*(.24+.76*(i/tiles));
      const pSpan=span*(.76/tiles);
      prog("OCR אזור "+(i+1)+"/"+tiles+": "+file.name,pBase);
      texts.push(await ocrBlob(await canvasBlob(tile),file.name+" — אזור "+(i+1),pBase,pSpan));
    }

    return texts.filter(Boolean).join("\n--- OCR REGION ---\n");
  }catch(e){
    console.warn("screenshot OCR fallback",e);
    return ocrBlob(file,file.name,base,span);
  }
}
function prog(t,p){
  $("progressWrap").classList.remove("hidden");$("progressText").textContent=t;
  $("progressPct").textContent=Math.round(p*100)+"%";$("progressBar").style.width=Math.round(p*100)+"%";
}

function hourly(lines){
  // Prefer the employee's actual regular hourly-rate fields.
  // Do not mix in minimum-wage notices or overtime tariffs.
  const vals=[];
  for(const l of lines){
    if(!/(?:ע\.\s*שעה|ערך\s*שעה\s*\/\s*יום)/.test(l))continue;
    const xs=lineNums(l).filter(v=>v>=20&&v<=250);
    const decimal=xs.filter(v=>Math.abs(v-Math.round(v))>.005&&v<180);
    if(decimal.length)vals.push(Math.min(...decimal));
  }
  return median(vals);
}
function metricFromNums(values,rate,factor,exclude=[]){
  const banned=new Set(exclude.map(Number));
  const xs=[...new Set(values.filter(v=>Number.isFinite(v)&&v>0&&v<100000&&!banned.has(Number(v))).map(v=>Math.round(v*10000)/10000))];
  if(!xs.length)return null;
  let best=null;
  for(const q of xs){
    if(q<=0||q>350)continue;
    for(const tariff of xs){
      if(tariff<10||tariff>500||tariff===q)continue;
      const base=tariff/factor;
      if(base<20||base>250)continue;
      const product=q*tariff;
      for(const amount of xs){
        if(amount<=0||amount===q||amount===tariff)continue;
        const err=Math.abs(amount-product)/Math.max(1,amount);
        if(err>.025)continue;
        const ratePenalty=rate?Math.abs(base-rate)/Math.max(1,rate)*.08:0;
        const score=err+ratePenalty;
        if(!best||score<best.score)best={q,tariff,amount,base,score};
      }
    }
  }
  if(best)return {q:best.q,tariff:best.tariff,amount:best.amount,base:best.base};

  const target=rate?rate*factor:null;
  if(target){
    const tariff=xs.filter(v=>v>=5&&v<=500).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
    if(tariff&&Math.abs(tariff-target)/target<.12){
      for(const amount of xs){
        if(amount<=tariff*1.2)continue;
        const q=amount/tariff,shown=xs.find(v=>Math.abs(v-q)<=Math.max(.08,q*.02));
        if(q>0&&q<350&&shown!=null)return {q:shown,tariff,amount,base:tariff/factor};
      }
    }
  }
  return null;
}
function metricFromRow(lines,code,rate,factor,labelNumber=null){
  const idx=lines.findIndex(l=>new RegExp("\\b"+code+"\\b").test(l));
  if(idx>=0){
    const values=lineNums(lines[idx]);
    const hit=metricFromNums(values,rate,factor,[Number(code),labelNumber]);
    if(hit)return hit;
  }

  // Screenshot/OCR fallback: codes are often missed while "125 / 150 / 175 / 200"
  // remains readable. Inspect a small neighborhood around the percentage label.
  if(labelNumber!=null){
    const re=new RegExp("(^|[^0-9])"+labelNumber+"\\s*%?([^0-9]|$)");
    for(let i=0;i<lines.length;i++){
      if(!re.test(lines[i]))continue;
      const block=lines.slice(Math.max(0,i-2),Math.min(lines.length,i+3)).join(" ");
      const hit=metricFromNums(lineNums(block),rate,factor,[Number(code),labelNumber]);
      if(hit)return hit;
    }
  }
  return null;
}
function toHours(raw){
  const v=String(raw??'').trim().replace(',','.');
  const colon=v.match(/^(\d{1,3}):(\d{2})$/);
  if(colon&&Number(colon[2])<=59)return Number(colon[1])+Number(colon[2])/60;
  const dot=v.match(/^(\d{1,3})\.(\d{2})$/);
  if(dot&&Number(dot[2])<=59)return Number(dot[1])+Number(dot[2])/60;
  const n=Number(v);return Number.isFinite(n)?n:null;
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
function taxLabeledAmount(lines,re,{min=0,max=5000000,pick="max"}={}){
  for(const line of lines){
    if(!re.test(line))continue;
    const xs=[...new Set(lineNums(line).filter(v=>v>=min&&v<=max).map(v=>Math.round(v*100)/100))];
    if(!xs.length)continue;
    if(pick==="min")return Math.min(...xs);
    if(pick==="median")return median(xs);
    return Math.max(...xs);
  }
  return null;
}
function taxMarginalRate(lines){
  for(const line of lines){
    if(!/מס\s*שולי/.test(line))continue;
    const direct=line.match(/מס\s*שולי[^0-9]{0,24}(\d{1,2}(?:[.,]\d+)?)/)||
      line.match(/(\d{1,2}(?:[.,]\d+)?)\s*[^0-9]{0,12}%?\s*מס\s*שולי/);
    if(direct){
      const v=num(direct[1]);
      if(Number.isFinite(v)&&v>=0&&v<=60)return v;
    }
    const xs=[...new Set(lineNums(line).filter(v=>v>=5&&v<=55).map(v=>Math.round(v*100)/100))];
    if(xs.length===1)return xs[0];
  }
  return null;
}
function modeRounded(values){
  const m=new Map();
  for(const v of values.filter(Number.isFinite)){
    const k=(Math.round(v*100)/100).toFixed(2);
    m.set(k,(m.get(k)||0)+1);
  }
  let best=null,n=-1;
  for(const [k,c] of m)if(c>n){best=Number(k);n=c}
  return best;
}
// Israeli employee 2026 rates: Bituach Leumi 1.04% / 7%, health 3.23% / 5.17%,
// reduced threshold ₪7,703 and ceiling ₪51,910. Used ONLY to validate the
// explicitly read NI and health amounts, never to assume a worker's tax status.
function expectedEmployeeDeductions2026(gross){
  const low=Math.min(Math.max(gross,0),7703);
  const high=Math.min(Math.max(gross-7703,0),51910-7703);
  return {ni:low*.0104+high*.07,health:low*.0323+high*.0517};
}
function incomeTaxFromSlip(lines,guard,month){
  const s=guard?.summary, ni=guard?.ni, health=guard?.health;
  const validCodes=["91003","91001","92041"].every(code=>
    lines.some(line=>new RegExp("(^|[^0-9])"+code+"([^0-9]|$)").test(line)));
  if(!s||!validCodes||!Number.isFinite(s.mandatoryDeductions)||
     !Number.isFinite(ni)||!Number.isFinite(health)){
    return {amount:null,verified:false,reason:"חסר פירוט מאומת של ניכויי החובה"};
  }
  // The municipal sample contains these three mandatory deductions. If another
  // deduction is present, do not assert this residual equals income tax.
  const tax=Math.round((s.mandatoryDeductions-ni-health)*100)/100;
  if(tax<0||tax>s.mandatoryDeductions||tax>Math.max(10000,(guard.grossBL||0)*.5)){
    return {amount:null,verified:false,reason:"סכומי ניכויי החובה אינם ניתנים לפירוק אמין"};
  }
  const year=Number(String(month).split("/")[1]);
  const gross=guard?.grossBL;
  if(year!==2026||!Number.isFinite(gross)||gross<1000){
    return {amount:tax,verified:false,reason:"סכום המס מחושב בהפרש; טרם אומתו כל רכיבי ניכויי החובה"};
  }
  const expected=expectedEmployeeDeductions2026(gross);
  // Allow small payroll rounding and a minor contemporaneous adjustment.
  if(Math.abs(ni-expected.ni)>1||Math.abs(health-expected.health)>1){
    return {amount:tax,verified:false,reason:"ביטוח לאומי או בריאות לא אומתו מול בסיס החיוב"};
  }
  return {amount:tax,verified:true,reason:null};
}
function taxMonthSeries(pays){
  const known=pays.filter(d=>d.month!=="לא זוהה").sort((a,b)=>monthKey(a.month)-monthKey(b.month));
  const byMonth=new Map(known.map(d=>[d.month,d]));
  return known.map(d=>{
    const prev=byMonth.get(shift(d.month,-1));
    const [mm]=d.month.split("/").map(Number);
    // "Income tax annually for collection" is NOT actual withheld tax; never
    // subtract that informational field to calculate monthly withholding.
    let taxable=null;
    if(mm===1&&Number.isFinite(d.taxGrossYtd))taxable=d.taxGrossYtd;
    else if(prev&&Number.isFinite(d.taxGrossYtd)&&Number.isFinite(prev.taxGrossYtd))
      taxable=Math.round((d.taxGrossYtd-prev.taxGrossYtd)*100)/100;
    const actual=d.incomeTaxPeriod;
    const currentGross=d.guard?.grossBL;
    const grossMatch=Number.isFinite(currentGross)&&
      Number.isFinite(taxable)&&taxable>500&&
      Math.abs(taxable-currentGross)<=Math.max(1000,currentGross*.2);
    const verified=Boolean(actual?.verified&&grossMatch);
    const effective=verified?actual.amount/taxable*100:null;
    const reason=verified?null:
      (!actual?.verified?(actual?.reason||"מס הכנסה שנוכה לא אומת"):
       "לא אותר בסיס חודשי מאומת למס מתוך הפרש נתוני המס המצטברים");
    return {d,month:d.month,marginal:d.marginalTax,taxable:verified?taxable:null,
      tax:actual?.amount??null,effective,verified,reason};
  });
}
function renderTaxAnalysis(pays){
  const el=$("taxAnalysis");if(!el)return {alerts:0,hasData:false};
  const series=taxMonthSeries(pays);
  const validRates=series.map(x=>x.effective).filter(Number.isFinite);
  const marginalBase=modeRounded(series.map(x=>x.marginal).filter(Number.isFinite));
  const rows=series.map(x=>{
    const previous=series.find(p=>p.month===shift(x.month,-1));
    const changes=[];
    if(previous&&Number.isFinite(x.marginal)&&Number.isFinite(previous.marginal)&&
      x.marginal!==previous.marginal)
      changes.push("שינוי במס השולי אינו הוכחה לשגיאה: יש לבדוק מדרגות מס וחישוב מצטבר");
    if(previous&&Number.isFinite(x.effective)&&Number.isFinite(previous.effective)&&
      Math.abs(x.effective-previous.effective)>1.5)
      changes.push("שיעור המס האפקטיבי השתנה; ייתכן שהסיבה היא שינוי בשכר החייב");
    if(x.reason)changes.push("לא ניתן לאמת שיעור אפקטיבי: "+x.reason);
    if(!changes.length)changes.push(x.verified?"ניכוי ובסיס המס אומתו אריתמטית":"נתון חלקי בלבד");
    return '<div class="data-row"><span><b>'+esc(x.month)+'</b><br><span class="small">'+
      esc(changes.join(". "))+'</span></span><b>שולי '+
      (Number.isFinite(x.marginal)?fmt(x.marginal)+"%":"—")+
      ' · אפקטיבי '+(Number.isFinite(x.effective)?fmt(x.effective)+"%":"—")+
      '</b></div>';
  }).join("");
  const exactCount=validRates.length;
  const baseline=(Number.isFinite(marginalBase)?'מס שולי נפוץ: '+fmt(marginalBase)+'%. ':'')+
    (exactCount?'חציון מס אפקטיבי מחודשים מאומתים: '+fmt(median(validRates))+'%.':'');
  el.innerHTML='<article class="month"><div class="month-head"><div>'+
    '<div class="month-name">בדיקת מס רב־חודשית</div>'+
    '<div class="small">נבדקו '+series.length+' תלושים; חישוב מס אפקטיבי מבוקר ב־'+exactCount+
    ' חודשים. שינוי שיעור מס לבדו אינו יוצר התראת שכר.</div></div>'+
    '<span class="badge ok">השוואה אינפורמטיבית</span></div>'+
    '<div class="flags"><div class="flag info">'+esc(baseline||
    "רק נתוני מס שנקראו ואומתו יוצגו כאחוז.")+'</div>'+
    '<div class="flag info">בדיקת מס משפטית מלאה מחייבת הכנסה מצטברת, נקודות זיכוי,'+
    ' אישורי תיאום מס, הפרשים והוראות המס החלות באותה שנת מס.</div></div>'+
    '<div class="side">'+rows+'</div></article>';
  // Income changes, marginal bracket changes and effective tax changes are
  // informational. A warning requires an independently verified statutory
  // calculation, not comparison to the median of other months.
  return {alerts:0,hasData:series.length>0};
}

function mirroredNums(line){
  const xs=lineNums(line);
  if(xs.length>=4&&xs.length%2===0){
    const n=xs.length/2,a=xs.slice(0,n),b=xs.slice(n);
    const mirror=a.every((v,i)=>Math.abs(v-b[n-1-i])<.001);
    if(mirror)return a;
  }
  return xs;
}
function findCodeRow(lines,code){
  return lines.find(l=>new RegExp("(^|[^0-9])"+String(code)+"([^0-9]|$)").test(l))||null;
}
function codeTotal(lines,code,{min=0,max=1000000}={}){
  const row=findCodeRow(lines,code);if(!row)return null;
  const xs=mirroredNums(row).filter(v=>v!==Number(code)&&v>=min&&v<=max);
  return xs.length?Math.max(...xs):null;
}
function labeledNumber(lines,re,{min=-Infinity,max=Infinity,preferDecimal=false}={}){
  for(let i=0;i<lines.length;i++){
    if(!re.test(lines[i]))continue;
    const candidates=[];
    for(const line of lines.slice(Math.max(0,i-1),Math.min(lines.length,i+2))){
      candidates.push(...mirroredNums(line).filter(v=>v>=min&&v<=max));
    }
    if(!candidates.length)continue;
    if(preferDecimal){
      const dec=candidates.filter(v=>Math.abs(v-Math.round(v))>.005);
      if(dec.length)return dec[0];
    }
    return candidates[0];
  }
  return null;
}
function summaryPayroll(lines){
  const idx=lines.findIndex(l=>/סכום\s*בבנק/.test(l)&&/שכר\s*נטו/.test(l)&&/שכר\s*בסיס/.test(l));
  if(idx<0)return null;
  for(let j=Math.max(0,idx-2);j<=Math.min(lines.length-1,idx+2);j++){
    if(j===idx)continue;
    const xs=mirroredNums(lines[j]).filter(v=>Math.abs(v)<10000000);
    if(xs.length>=13){
      const a=xs.slice(0,13);
      const out={bank:a[0],externalDeductions:a[1],officeDeductions:a[2],net:a[3],mandatoryDeductions:a[4],totalPayments:a[5],differences:a[6],grossCurrent:a[7],otherPayments:a[8],expenseRefunds:a[9],extraWork:a[10],additions:a[11],baseSalary:a[12]};
      const check1=Math.abs((out.totalPayments-out.mandatoryDeductions)-out.net);
      const check2=Math.abs((out.net-out.officeDeductions-out.externalDeductions)-out.bank);
      if(check1<20&&check2<20)return out;
    }
  }
  return null;
}
function leaveRow(lines,re){
  const row=lines.find(l=>re.test(l));
  if(!row)return null;
  const xs=mirroredNums(row).filter(v=>v>-1000&&v<1000);
  if(xs.length<4)return null;
  const a=xs.slice(0,4);
  // Printed order in the supported municipal payslip: new balance, used, credit, previous.
  const out={newBalance:a[0],used:a[1],credit:a[2],previous:a[3]};
  const err=Math.abs((out.previous+out.credit-out.used)-out.newBalance);
  out.mathError=err;
  return err<3?out:null;
}
// Do not infer pension deductions from generic informational "pension"
// rows, page headers or an accidental match of 1% / 2% somewhere nearby.
// A rate needs an identifiable employee deduction row with all three values.
function fundRow(lines,re){
  const found=[];
  for(const line of lines){
    if(!re.test(line)||!/ניכוי/.test(line))continue;
    const xs=mirroredNums(line).filter(v=>v>0&&v<1000000);
    const bases=xs.filter(v=>v>=1000&&v<100000);
    const pcts=xs.filter(v=>v>=5&&v<=9);
    for(const gross of bases)for(const pct of pcts){
      const expected=gross*pct/100;
      const matches=xs.filter(v=>v!==gross&&v!==pct&&v>=100&&Math.abs(v-expected)<=Math.max(1,expected*.005));
      if(matches.length===1)found.push({pct,gross,amount:matches[0]});
    }
  }
  // Ambiguity is an unreadable record, not a genuine change in rate.
  if(found.length!==1)return null;
  return found[0];
}

function recurrentComponents(lines){
  const defs=[
    ["יסוד",/(?:^|\s)יסוד(?:\s|$)/],
    ["תוספת ותק",/תוספת\s*ותק/],
    ["איזון משרדי",/איזון\s*משרדי/],
    ["שקלית מדורג",/שקלית\s*מדורג/],
    ["ע״נ פק.חניה",/ע["״']?נ\s*פק\.?\s*חניה/],
    ["תוספת שכר",/תוספת\s*שכר\s*3[.,]?6/],
    ["הסכם ב.י. 2003",/הסכם\s*ב\.?י\.?\s*2003/],
    ["תוספת 1997",/תוספת\s*1997/],
    ["תוספת 2011",/תוספת\s*2011/],
    ["תוספת מעו״ף",/תוספת\s*מעו/],
    ["תוספת אחוזית 2016",/תוספת\s*אחוזית\s*2016/],
    ["תוספת שקלית 2016",/תוספת\s*שקלית\s*2016/],
    ["תוספת שקלית 2023",/תוספת\s*שקלית\s*2023/],
    ["תוספת אחוזית 2024",/תוספת\s*אחוזית\s*2024/],
    ["רכב קבועות ברוטו",/רכב\s*קבועות\s*ברוטו/],
    ["רכב קבועות נטו",/רכב\s*קבועות\s*נטו/],
    ["טלפון",/(?:^|\s)טלפון(?:\s|$)/],
    ["נסיעות",/(?:^|\s)נסיעות(?:\s|$)/]
  ];
  const out={};
  for(const [name,re] of defs)out[name]=lines.some(l=>re.test(l));
  return out;
}
function extractPayrollGuard(clean,lines){
  const summary=summaryPayroll(lines);
  const grossBL=codeTotal(lines,94010,{min:100,max:1000000});
  const ni=codeTotal(lines,91001,{min:0,max:50000});
  const health=codeTotal(lines,92041,{min:0,max:50000});
  const pension=fundRow(lines,/(?:פנסיה|הראל)/);
  const credits=labeledNumber(lines,/סך\s*נקודות\s*זיכוי/,{min:0,max:20,preferDecimal:true});
  const fraction=labeledNumber(lines,/חלקיות\s*ותק/,{min:.05,max:1.5,preferDecimal:true});
  return {
    summary,
    leave:{
      vacation:leaveRow(lines,/(?:^|\s)חופשה(?:\s|$)/),
      sick:leaveRow(lines,/(?:^|\s)מחלה(?:\s|$)/),
      special:leaveRow(lines,/חופשה\s*מיוחדת/)
    },
    ni,health,grossBL,
    niRate:Number.isFinite(ni)&&Number.isFinite(grossBL)&&grossBL>0?ni/grossBL*100:null,
    healthRate:Number.isFinite(health)&&Number.isFinite(grossBL)&&grossBL>0?health/grossBL*100:null,
    pension,
    creditPoints:credits,
    employmentFraction:fraction,
    components:recurrentComponents(lines),
    hasRetro:Boolean(summary&&Number.isFinite(summary.differences)&&Math.abs(summary.differences)>.5)
  };
}
function mad(values){
  const xs=values.filter(Number.isFinite);if(xs.length<3)return null;
  const m=median(xs);return median(xs.map(v=>Math.abs(v-m)));
}
function addGuardIssue(month,text){
  S.issues.push({month,text});
}
function renderPayrollGuard(pays){
  const el=$("payrollGuard");if(!el)return {alerts:0};
  const docs=pays.filter(d=>d.month!=="לא זוהה"&&d.guard).sort((a,b)=>monthKey(a.month)-monthKey(b.month));
  let alerts=0;
  const sections=[];
  const push=(title,items,info="",unverified="")=>{
    const badItems=items.filter(Boolean);
    if(!badItems.length&&docs.length<3)return;
    sections.push('<div class="guard-check"><b>'+esc(title)+'</b>'+
      (info?'<div class="small">'+esc(info)+'</div>':'')+
      (badItems.length?badItems.map(x=>'<div class="flag warn">'+esc(x)+'</div>').join(""):
        unverified?'<div class="flag info">'+esc(unverified)+'</div>':
        '<div class="flag ok">לא זוהתה חריגה בולטת.</div>')+
      '</div>');
  };

  // 1. Recurring pay components.
  {
    const names=new Set();
    docs.forEach(d=>Object.keys(d.guard.components||{}).forEach(k=>names.add(k)));
    const issues=[];
    for(const name of names){
      const present=docs.filter(d=>d.guard.components?.[name]).length;
      if(docs.length>=4&&present>=Math.max(3,Math.ceil(docs.length*.7))){
        for(const d of docs){
          if(!d.guard.components?.[name]){
            issues.push(d.month+": הרכיב הקבוע „"+name+"” לא זוהה, למרות שהוא מופיע ברוב החודשים.");
            addGuardIssue(d.month,"הרכיב הקבוע "+name+" לא זוהה בתלוש, למרות שהוא מופיע ברוב החודשים.");
            alerts++;
          }
        }
      }
    }
    push("1. רציפות רכיבי שכר",issues,"מחפש רכיב שמופיע בקביעות ואז נעלם.");
  }

  // 2. Vacation / sickness arithmetic and continuity.
  {
    const issues=[];
    for(const d of docs){
      for(const [key,label] of [["vacation","חופשה"],["sick","מחלה"],["special","חופשה מיוחדת"]]){
        const x=d.guard.leave?.[key];
        if(x&&x.mathError>.08){
          issues.push(d.month+": יתרת "+label+" אינה נסגרת מתמטית.");
          addGuardIssue(d.month,"יתרת "+label+" אינה נסגרת לפי יתרה קודמת + זיכוי - ניצול.");
          alerts++;
        }
      }
    }
    for(let i=1;i<docs.length;i++){
      const prev=docs[i-1],cur=docs[i];
      if(shift(prev.month,1)!==cur.month)continue;
      for(const [key,label] of [["vacation","חופשה"],["sick","מחלה"],["special","חופשה מיוחדת"]]){
        const a=prev.guard.leave?.[key]?.newBalance,b=cur.guard.leave?.[key]?.previous;
        if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)>.08){
          issues.push(cur.month+": יתרת הפתיחה של "+label+" ("+fmt(b)+") אינה תואמת ליתרת הסגירה בחודש הקודם ("+fmt(a)+").");
          addGuardIssue(cur.month,"יתרת הפתיחה של "+label+" אינה תואמת ליתרת הסגירה בחודש הקודם.");
          alerts++;
        }
      }
    }
    push("2. חופשה ומחלה",issues,"בודק גם את החשבון בתוך התלוש וגם רצף יתרות מחודש לחודש.");
  }

  // 3. National insurance & health: never compare a raw OCR-based
  // percentage to a median. The screenshots contained impossible "96%" rates
  // caused by a misread gross base. Confirm 2026 employee deductions against
  // the actual amounts, current gross and 2026 payroll-table calculation.
  {
    const info=[],issues=[],unverified=[];
    for(const d of docs){
      const g=d.guard,gross=g.grossBL,ni=g.ni,health=g.health,s=g.summary;
      const date=Number(d.month.split("/")[1]);
      if(date!==2026||!s||![gross,ni,health,s.grossCurrent].every(Number.isFinite)||
         gross<1000||Math.abs(gross-s.grossCurrent)>Math.max(2500,s.grossCurrent*.3)||
         ni<0||health<0||ni+health>gross*.2){
        unverified.push(d.month);
        continue;
      }
      const exp=expectedEmployeeDeductions2026(gross);
      if(Math.abs(ni-exp.ni)>Math.max(2,exp.ni*.02)||
         Math.abs(health-exp.health)>Math.max(2,exp.health*.02)){
        unverified.push(d.month);
        continue;
      }
      info.push(d.month+": סכומי ביטוח לאומי ובריאות נבדקו מול בסיס החיוב.");
    }
    push("3. ביטוח לאומי ובריאות",issues,
      "שיעורי ניכוי משתנים עם ההכנסה החייבת. חוסר אימות קריאה לא יהפוך להתראה.",
      unverified.length?"לא ניתן לאמת נתונים בחודשים: "+unverified.join(", ")+".":"");
    if(info.length)sections.push('<div class="flag info">'+esc("אומתו אריתמטית "+info.length+" חודשי ביטוח מול בסיס החיוב.")+'</div>');
  }


  // 4. Employee pension contribution: show a changed rate only if BOTH
  // same-line, identifiable deduction entries are complete and unambiguous.
  // A rate shift alone is informational (it may reflect a valid agreement).
  {
    const verified=docs.filter(d=>d.guard.pension&&
      Number.isFinite(d.guard.pension.pct)&&Number.isFinite(d.guard.pension.gross));
    const base=modeRounded(verified.map(d=>d.guard.pension.pct));
    const changes=verified.filter(d=>Number.isFinite(base)&&Math.abs(d.guard.pension.pct-base)>.05);
    push("4. פנסיה",[],
      "נבדקות רק שורות ניכוי עובד עם שיעור, סכום ובסיס חישוב מאומתים.",
      (verified.length<3?"אין מספיק שורות פנסיה מזוהות בוודאות; לא ניתן לקבוע חריגה.":
       changes.length?"אותר שינוי בשיעור הפנסיה, אך דרוש הסכם/בסיס ניכוי לאימות הזכאות.":""));
  }


  // 5. Tax credit points.
  {
    const issues=[];
    const vals=docs.map(d=>d.guard.creditPoints).filter(Number.isFinite);
    const base=modeRounded(vals);
    if(vals.length>=3&&Number.isFinite(base)){
      for(const d of docs){
        const v=d.guard.creditPoints;
        if(Number.isFinite(v)&&Math.abs(v-base)>.01){
          issues.push(d.month+": נקודות זיכוי "+fmt(v)+" לעומת "+fmt(base)+" ברוב החודשים.");
          addGuardIssue(d.month,"מספר נקודות הזיכוי השתנה ל-"+fmt(v)+" לעומת "+fmt(base)+" ברוב החודשים.");
          alerts++;
        }
      }
    }
    push("5. נקודות זיכוי במס",issues,"שינוי בנקודות זיכוי מסומן לבדיקה ואינו מוגדר אוטומטית כטעות.");
  }

  // 6. Gross -> net -> bank arithmetic.
  {
    const issues=[];
    for(const d of docs){
      const x=d.guard.summary;if(!x)continue;
      const e1=Math.abs((x.totalPayments-x.mandatoryDeductions)-x.net);
      const e2=Math.abs((x.net-x.officeDeductions-x.externalDeductions)-x.bank);
      if(e1>1||e2>1){
        issues.push(d.month+": שרשרת ברוטו→נטו→בנק אינה נסגרת (פער עד ₪"+fmt(Math.max(e1,e2))+").");
        addGuardIssue(d.month,"חישוב ברוטו→נטו→סכום בבנק אינו נסגר לפי הסכומים שנקראו.");
        alerts++;
      }
    }
    push("6. ברוטו → נטו → בנק",issues,"בודק שסך התשלומים פחות ניכויי חובה שווה לנטו, ושהנטו פחות יתר הניכויים שווה לסכום בבנק.");
  }

  // 7. Empty "retro differences" headings exist on every payslip.
  // Record a correction ONLY when the reconciled summary has a real amount.
  {
    const items=docs.filter(d=>d.guard.hasRetro).map(d=>
      d.month+": נרשם הפרש שכר בפועל בסך ₪"+fmt(d.guard.summary.differences)+
      ". יש לשייך אותו לחודש העבודה לפני קביעת חוסר.");
    push("7. הפרשי שכר רטרואקטיביים",[],
      "כותרת ״פירוט הפרשים״ ללא סכום אינה מעידה על תיקון.",
      items.length?items.join(" "):"לא זוהו סכומי הפרשי שכר מאומתים.");
  }


  // 8. Variable gross/net/bank amounts naturally move with shifts,
  // extra work, tax and allowances. Only track stable pay structures.
  {
    const features=[
      ["ערך שעה",d=>d.hourly,1],
      ["שכר יסוד",d=>d.guard.summary?.baseSalary,20],
      ["חלקיות משרה",d=>d.guard.employmentFraction,.03]
    ];
    const items=[];
    if(docs.length>=5){
      for(const [label,getter,minAbs] of features){
        const vals=docs.map(getter).filter(Number.isFinite);
        if(vals.length<5)continue;
        const med=median(vals),m=mad(vals),floor=Math.max(minAbs,Math.abs(med)*.08);
        for(const d of docs){
          const v=getter(d);if(!Number.isFinite(v))continue;
          const dev=Math.abs(v-med),robust=m&&m>.0001?dev/(1.4826*m):0;
          if(dev>=floor&&(robust>=3.5||dev>=Math.abs(med)*.25))
            items.push(d.month+": "+label+" השתנה ("+fmt(v)+" לעומת חציון "+fmt(med)+
              "); יש לבדוק מועד שינוי ותנאי העסקה.");
        }
      }
    }
    push("8. מגמות רב־חודשיות",[],
      "שינוי בברוטו, נטו או סכום בבנק אינו התראה על שכר חסר.",
      items.length?items.join(" "):"לא התגלה שינוי חשוד ברכיבי השכר הקבועים.");
  }


  el.innerHTML='<article class="month"><div class="month-head"><div><div class="month-name">Payroll Guard — 8 בדיקות</div><div class="small">נבדקו '+docs.length+' תלושי שכר שנקראו וזוהו לפי חודש.</div></div><span class="badge '+(alerts?"warn":"ok")+'">'+(alerts?alerts+" התראות לבדיקה":"ללא חריגה בולטת")+'</span></div>'+
    '<div class="guard-grid">'+sections.join("")+'</div></article>';
  return {alerts};
}

function parse(kind,text,file){
  const clean=String(text||"").replace(/[\u200e\u200f]/g," ");
  const lines=clean.split(/\n+/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const d={kind,fileName:file.name,month:kind==="payslip"?month(clean):"לא זוהה",hourly:null,ot125:null,ot150:null,ot175:null,ot200:null,oncall:null,tariffs:{},confidence:40,marginalTax:null,taxGrossYtd:null,incomeTaxYtd:null,guard:null};
  if(kind==="payslip"){
    const explicitRate=hourly(lines);
    const inferredRates=[];
    d.hourlySource=null;
    for(const o of OT){
      const pct=Number(o.label.replace(/\D/g,""))||null;
      const m=metricFromRow(lines,o.code,explicitRate,o.f,pct);
      if(m){
        d[o.k]=m.q;d.tariffs[o.k]=m.tariff;
        if(Number.isFinite(m.base))inferredRates.push(m.base);
      }
    }
    let on=metricFromRow(lines,"4392",explicitRate,1,null);
    if(!on){
      const oi=lines.findIndex(l=>/כוננ/.test(l));
      if(oi>=0)on=metricFromNums(lineNums(lines.slice(Math.max(0,oi-2),Math.min(lines.length,oi+3)).join(" ")),explicitRate,1,[4392]);
    }
    if(on){
      d.oncall=on.q;d.tariffs.oncall=on.tariff;
      if(Number.isFinite(on.base))inferredRates.push(on.base);
    }
    d.hourly=Number.isFinite(explicitRate)?explicitRate:median(inferredRates);
    d.hourlySource=Number.isFinite(explicitRate)?"ע.שעה / ערך שעה בתלוש":(Number.isFinite(d.hourly)?"נגזר מתעריפי עבודה נוספת":null);

    // Multi-month tax audit fields.
    d.marginalTax=taxMarginalRate(lines);
    d.taxGrossYtd=taxLabeledAmount(lines,/ברוטו\s*למס\s*הכנסה/,{min:100,max:5000000,pick:"max"});
    d.guard=extractPayrollGuard(clean,lines);
    d.incomeTaxPeriod=incomeTaxFromSlip(lines,d.guard,d.month);
  }else{
    const m=clean.match(/@@ATT_PDF_META (\{[^\n]*\}) @@/);
    if(m){
      try{
        const v=JSON.parse(m[1]);
        if(/^(0[1-9]|1[0-2])\/20\d{2}$/.test(v.month||""))d.month=v.month;
        if(v.summary?.method==="pdf-positioned-monthly-summary"&&
           OT.every(o=>Number.isFinite(v.summary.values?.[o.k]))){
          for(const o of OT)d[o.k]=v.summary.values[o.k];
          d.verifiedAttendanceSummary=true;
          d.attendanceSource="PDF מקורי — סיכום חודשי לפי עמודות";
        }
      }catch(err){console.warn("Attendance metadata unreadable",err)}
    }else{
      // Screenshots are provisional: NEVER infer totals from adjacent daily rows
      // or take arbitrary header/generation dates as the work month.
      const heading=clean.slice(0,800);
      const months=[...new Set([...heading.matchAll(/(?:נוכחות|לחודש|בחודש)[^\n]{0,70}?(0?[1-9]|1[0-2])[/.-](20\d{2})/g)]
        .map(m=>String(+m[1]).padStart(2,"0")+"/"+m[2]))];
      if(months.length===1)d.month=months[0];
    }
  }
  const vs=OT.map(o=>d[o.k]).filter(Number.isFinite);
  d.otTotal=vs.length?vs.reduce((a,b)=>a+b,0):null;
  if(d.month!=="לא זוהה")d.confidence+=15;
  d.confidence+=Math.min(35,vs.length*9);
  if(kind==="payslip"&&d.hourly)d.confidence+=10;
  if(kind==="attendance"&&d.verifiedAttendanceSummary)d.confidence=d.month==="לא זוהה"?80:96;
  return d;
}
function pairs(){
  const att=S.docs.filter(d=>d.kind==="attendance").sort((x,y)=>monthKey(x.month)-monthKey(y.month));
  const pay=S.docs.filter(d=>d.kind==="payslip").sort((x,y)=>monthKey(x.month)-monthKey(y.month));
  const byPayMonth=new Map(),attCount=new Map(),used=new Set(),out=[];
  for(const p of pay)if(p.month!=="לא זוהה"){
    if(!byPayMonth.has(p.month))byPayMonth.set(p.month,[]);
    byPayMonth.get(p.month).push(p);
  }
  for(const a of att)if(a.month!=="לא זוהה")
    attCount.set(a.month,(attCount.get(a.month)||0)+1);
  for(const a of att){
    const expected=a.month!=="לא זוהה"?shift(a.month,1):null;
    const matches=expected?byPayMonth.get(expected)||[]:[];
    const unique=expected&&attCount.get(a.month)===1&&matches.length===1&&!used.has(matches[0]);
    if(unique){
      const p=matches[0];used.add(p);
      out.push({a,p,fallback:false,lag:true,same:false});
    }else{
      // Unknown months, same-month slips, duplicate files and other mismatches
      // MUST NOT be paired by upload order. Do not generate monetary findings.
      out.push({a,p:null,fallback:false,lag:false,same:false});
    }
  }
  for(const p of pay)if(!used.has(p))
    out.push({a:null,p,fallback:false,lag:false,same:false});
  return out;
}
function rows(d){
  if(!d)return '<span class="small">לא נמצא</span>';
  const last=d.kind==="payslip"?"כוננות חול – שעות/כמות":"כוננות";
  return [["125%",d.ot125],["150%",d.ot150],["175%",d.ot175],["200%",d.ot200]]
    .map(([k,v])=>'<div class="data-row"><span>'+esc(k)+'</span><b>'+(Number.isFinite(v)?hh(v):"—")+'</b></div>').join("")+
    '<div class="data-row"><span>'+esc(last)+'</span><b>'+fmt(d.oncall)+'</b></div>';
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
function readCount(d){
  if(!d)return 0;
  return OT.reduce((n,o)=>n+(Number.isFinite(d[o.k])?1:0),0);
}
function readLabels(d){
  if(!d)return [];
  return OT.filter(o=>Number.isFinite(d[o.k])).map(o=>o.label);
}
function missingLabels(d){
  if(!d)return OT.map(o=>o.label);
  return OT.filter(o=>!Number.isFinite(d[o.k])).map(o=>o.label);
}
function monthKey(mm){
  if(!mm||mm==="לא זוהה")return -1;
  const [m,y]=mm.split("/").map(Number);
  return y*12+m;
}
function render(){
  S.issues=[];S.insufficient=false;const ps=pairs();let bad=0,warn=0,good=0;
  const unresolved=S.docs.filter(d=>d.kind==="unknown");
  if(unresolved.length)S.insufficient=true;
  const pays=S.docs.filter(d=>d.kind==="payslip");
  const rated=pays.filter(d=>Number.isFinite(d.hourly)).sort((a,b)=>monthKey(b.month)-monthKey(a.month));
  const rateDoc=rated[0]||null,rate=rateDoc?.hourly??null;
  $("autoProfile").innerHTML=[
    ["ערך שעה רגילה"+(rateDoc?.month&&rateDoc.month!=="לא זוהה"?" · "+rateDoc.month:""),rate!=null?"₪"+fmt(rate):"לא זוהה"],
    ["מקור ערך השעה",rateDoc?.hourlySource||"לא זוהה"],
    ["חודשי תלוש שנקראו",String(pays.filter(d=>d.month!=="לא זוהה").length)],
    ["שמירת מסמכים","לא נשמרים במאגר"]
  ].map(([k,v])=>'<div class="metric"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join("");
  $("autoProfileSection").classList.remove("hidden");
  const typeSummary=$("typeSummary");
  if(typeSummary)typeSummary.innerHTML='<div class="flag info">זוהו לפי תוכן הקבצים: '+
    pays.length+' תלושי שכר, '+S.docs.filter(d=>d.kind==="attendance").length+
    ' דוחות נוכחות'+(unresolved.length?' · '+unresolved.length+
    ' מסמכים דורשים זיהוי ידני':'')+'. הקבצים ממוינים לפי חודש העבודה ומשויכים לתלוש בחודש העוקב.</div>';

  $("monthResults").innerHTML=ps.map(({a,p,fallback,lag,same})=>{
    const m=a&&a.month!=="לא זוהה"?a.month:(p?.month||"לא זוהה"),flags=[];
    let cls="warn",title="דורש בדיקה",gap=null;
    if(!a){warn++;S.insufficient=true;title="אין דוח משויך";flags.push(["info","לתלוש "+(p?.month||"לא זוהה")+" נדרש דוח נוכחות של "+(p?.month!=="לא זוהה"?shift(p.month,-1):"החודש הקודם")+". אם הדוח הועלה, יש לוודא שחודש העבודה נקרא נכון; לא נוצר פער כספי."])}
    else if(!p){warn++;S.insufficient=true;title="אין תלוש משויך";flags.push(["info",a.month==="לא זוהה"?"לא זוהה חודש העבודה בדוח. יש לבחור את חודש העבודה בבדיקת נתונים ידנית.":"דוח "+a.month+" מחייב תלוש "+shift(a.month,1)+". לא נמצא תלוש מאומת מתאים; לא נוצר פער כספי."])}
    else{
      if(fallback)flags.push(["info","שיוך לפי סדר העלאה אינו מאומת ואינו בסיס למסקנה כספית."]);
      if(lag)flags.push(["info","שיוך חודש: דוח הנוכחות של חודש העבודה הותאם לתלוש של החודש הבא (M→M+1), בהתאם לדפוס שאומת בתלושים שנבדקו. ההשוואה כוללת את כל חודש הנוכחות — ללא חיתוך אוטומטי ב־24/25."]);
      // Same-month payslips are never paired; matching must be M -> M+1.
      const ac=readCount(a),pc=readCount(p);
      const common=OT.filter(o=>Number.isFinite(a?.[o.k])&&Number.isFinite(p?.[o.k]));
      const complete=ac===OT.length&&pc===OT.length;
      const ds=details(a,p);
      gap=complete&&Number.isFinite(a.otTotal)&&Number.isFinite(p.otTotal)?a.otTotal-p.otTotal:null;

      if(!complete){
        S.insufficient=true;
        const missA=missingLabels(a),missP=missingLabels(p);
        flags.push(["warn","קריאה חלקית: המערכת משווה רק את מה שנקרא בפועל מהמסמכים שהועלו. רכיבים משותפים שניתן לבדוק: "+common.length+"/"+OT.length+"."]);
        if(missA.length)flags.push(["info","לא נקראו מדוח הנוכחות: "+missA.join(", ")+"."]);
        if(missP.length)flags.push(["info","לא נקראו מהתלוש: "+missP.join(", ")+"."]);
      }

      // Never label a discrepancy or estimate money when OCR has read only
      // 1/4 or 2/4 overtime categories, when the payroll period is ambiguous,
      // or when extraction confidence is low.
      const trustworthy=complete&&lag&&!fallback&&a.verifiedAttendanceSummary&&a.month!=="לא זוהה"&&a.confidence>=90&&p.confidence>=85;
      if(!trustworthy){
        S.insufficient=true;
        if(a.month==="לא זוהה")flags.push(["info","חודש העבודה אינו מזוהה בוודאות מתוך כותרת הדוח. תאריך ההפקה אינו חודש העבודה."]);
        if(!a.verifiedAttendanceSummary)flags.push(["info","סיכום שעות הנוכחות לא אומת מהעמודות המקוריות של ה-PDF; אין אומדן כספי."]);
        warn++;cls="warn";title="השוואה לא מאומתת";
        if(ds.length){
          flags.push(["info","נראים הבדלים בנתונים שנקראו, אך השוואת השעות אינה מלאה או שיוך התקופה אינו ודאי. לא ניתן לקבוע חוסר או אומדן כספי."]);
        }else{
          flags.push(["info","הבדיקה אינה מלאה; יש להשלים נתונים לפני מסקנה כספית."]);
        }
      }else if(ds.length){
        const big=ds.some(x=>x.type==="missing"||Math.abs(x.g)>1);
        cls=big?"bad":"warn";title=big?"פער משמעותי לבדיקה":"פער קטן לבדיקה";big?bad++:warn++;
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
      }else if(complete&&gap!=null){
        good++;cls="ok";title="התאמה טובה";flags.push(["ok","כל ארבעת רכיבי השעות שנקראו תואמים בקירוב."]);
      }else if(common.length){
        warn++;title="השוואה חלקית";
        flags.push(["ok","ברכיבים המשותפים שנקראו משני המסמכים לא זוהה כרגע פער מעבר לסף. הבדיקה אינה מלאה."]);
      }else{
        warn++;title="לא ניתן להשוות";
        if(ac===0&&pc===0)flags.push(["warn","החודש זוהה, אבל טבלאות השעות לא נקראו משני המסמכים. אין כרגע בסיס לקבוע אם יש התאמה או פער."]);
        else if(ac===0)flags.push(["warn","דוח הנוכחות זוהה, אבל רכיבי השעות שבו לא נקראו. מומלץ להעלות PDF מקורי ולא צילום מסך."]);
        else if(pc===0)flags.push(["warn","התלוש זוהה, אבל רכיבי השעות שבו לא נקראו. מומלץ להעלות PDF מקורי ולא צילום מסך."]);
        else flags.push(["warn","אין כרגע רכיב שעות משותף שנקרא משני המסמכים."]);
      }
      if(Number.isFinite(p.oncall))flags.push(["info","כוננות חול בתלוש: "+fmt(p.oncall)+" שעות/כמות לחישוב שכר. זה אינו מספר הכוננויות."]);
      const est=trustworthy?estimate(a,p):null;if(est)flags.push(["info","אומדן ראשוני בלבד לפני בדיקת תשלומים משלימים: כ־₪"+fmt(est)+"."]);
    }
    return '<article class="month"><div class="month-head"><div><div class="month-name">חודש '+esc(m)+'</div><div class="small">תלוש משויך: '+esc(p?.month||"—")+'</div></div><span class="badge '+cls+'">'+title+'</span></div>'+
      '<div class="metrics"><div class="metric"><div class="k">נוכחות — נוספות</div><div class="v">'+(a?.otTotal==null?"—":hh(a.otTotal))+'</div></div><div class="metric"><div class="k">תלוש — נוספות</div><div class="v">'+(p?.otTotal==null?"—":hh(p.otTotal))+'</div></div><div class="metric"><div class="k">פער כולל</div><div class="v">'+(gap==null?"—":hh(gap))+'</div></div><div class="metric"><div class="k">ביטחון קריאה</div><div class="v">'+(a&&p?Math.min(a.confidence,p.confidence)+"%":"—")+'</div></div></div>'+
      '<div class="compare"><div class="side"><h3>🕒 נוכחות</h3>'+rows(a)+'</div><div class="side"><h3>📄 תלוש</h3>'+rows(p)+'</div></div>'+
      '<div class="flags">'+flags.map(([c,t])=>'<div class="flag '+c+'">'+esc(t)+'</div>').join("")+'</div></article>';
  }).join("");

  const guardAudit=renderPayrollGuard(pays);
  if(guardAudit.alerts)warn+=guardAudit.alerts;
  const taxAudit=renderTaxAnalysis(pays);
  if(taxAudit.alerts)warn+=taxAudit.alerts;
  S.report=ps.map(x=>(x.a?.month||x.p?.month||"לא זוהה")).join("\n");
  const o=$("overall");if(bad){o.className="overall bad";o.textContent="נמצאו פערים משמעותיים לבדיקה."}else if(S.insufficient){o.className="overall warn";o.textContent=unresolved.length?
    "יש "+unresolved.length+" מסמכים שסוגם לא זוהה. בדוק את הזיהוי באזור הבדיקה הידנית.":
    "הקריאה חלקית — אין עדיין מספיק נתונים לקבוע אם יש התאמה או פער."}else if(warn){o.className="overall warn";o.textContent="יש נתונים שדורשים בדיקה או אימות."}else{o.className="overall ok";o.textContent="הנתונים שנקראו נראים תואמים."}
  $("resultsSection").classList.remove("hidden");
  $("reviewRows").innerHTML=S.docs.map((d,i)=>{
    const select='<label class="small">סוג מסמך <select data-document-kind="'+i+'">'+
      '<option value="unknown"'+(d.kind==="unknown"?' selected':'')+'>לא זוהה — יש לבחור</option>'+
      '<option value="payslip"'+(d.kind==="payslip"?' selected':'')+'>תלוש שכר</option>'+
      '<option value="attendance"'+(d.kind==="attendance"?' selected':'')+'>דוח נוכחות</option></select></label>';
    if(d.kind!=="attendance")return '<div class="review-doc"><b>'+esc(d.kind==="payslip"?"📄 תלוש שכר":"מסמך לא מזוהה")+
      ' · '+esc(d.month)+' · '+esc(d.fileName)+'</b>'+select+
      (d.kind==="unknown"?'<div class="small">הזיהוי אינו ודאי. יש לבחור סוג מסמך ולחשב מחדש.</div>':'')+'</div>';
    const options=[...new Set([
      d.month,
      ...S.docs.filter(x=>x.kind==="payslip"&&x.month!=="לא זוהה").map(x=>shift(x.month,-1))
    ].filter(mm=>mm&&mm!=="לא זוהה"))].sort((x,y)=>monthKey(x)-monthKey(y));
    const opts='<option value="">בחר חודש עבודה</option>'+options.map(mm=>
      '<option value="'+esc(mm)+'"'+(mm===d.month?' selected':'')+'>'+esc(mm)+'</option>').join("");
    return '<div class="review-doc"><b>🕒 נוכחות · '+esc(d.fileName)+'</b>'+select+
      '<div class="small">חודש הדוח חייב להיות חודש אחד לפני תלוש השכר. תאריך הפקת PDF אינו חודש העבודה.</div>'+
      '<label>חודש העבודה <select data-attendance-month="'+i+'">'+opts+'</select></label>'+
      '<div class="small">סיכום שעות PDF: '+(d.verifiedAttendanceSummary?'זוהה':'לא אומת — לא ניתן לקבוע פער כספי')+'</div></div>';
  }).join("");
  $("reviewSection").classList.remove("hidden");
}
function request(){
  if(!S.issues.length&&S.insufficient)return "שלום,\n\nניסיתי לבצע השוואה בין תלוש השכר לדוח הנוכחות, אך חלק מרכיבי השעות במסמכים לא נקראו בצורה שמאפשרת השוואה אמינה. אבקש בדיקה ידנית של הנתונים המצורפים.\n\nתודה.";
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
$("recalcBtn").onclick=()=>{
  // User can correct uncertain or mistaken document classifications without
  // re-uploading. Retain raw source text only for this in-memory review.
  for(const field of document.querySelectorAll("[data-document-kind]")){
    const idx=Number(field.dataset.documentKind),d=S.docs[idx],kind=field.value;
    if(!d||!["attendance","payslip"].includes(kind)||kind===d.kind)continue;
    const corrected=parse(kind,d.rawText||"",{name:d.fileName});
    corrected.rawText=d.rawText;
    corrected.userChosenKind=true;
    S.docs[idx]=corrected;
  }
  for(const field of document.querySelectorAll("[data-attendance-month]")){
    const doc=S.docs[Number(field.dataset.attendanceMonth)];
    if(!doc||doc.kind!=="attendance")continue;
    const next=String(field.value||"");
    if(/^(0[1-9]|1[0-2])\/20\d{2}$/.test(next)){
      doc.month=next;
      // Month is user-confirmed, not extrapolated from PDF generation date.
      doc.workMonthConfirmed=true;
      if(doc.verifiedAttendanceSummary)doc.confidence=96;
    }
  }
  render();
};

$("analyzeBtn").onclick=async()=>{
  if(S.pay.length+S.att.length<2){alert("נא להעלות לפחות שני מסמכים. אפשר לבחור את כל הקבצים באותו מקום וללא סדר מסוים.");return}
  $("analyzeBtn").disabled=true;S.docs=[];$("requestSection").classList.add("hidden");
  const seen=new Set();
  const jobs=[...S.pay,...S.att].filter(file=>{
    const key=fileKey(file);if(seen.has(key))return false;seen.add(key);return true;
  }).map(file=>({file}));
  const failed=[];
  try{
    for(let i=0;i<jobs.length;i++){
      const j=jobs[i],base=i/jobs.length,span=.94/jobs.length,isPdf=j.file.type==="application/pdf"||j.file.name.toLowerCase().endsWith(".pdf");
      try{
        const text=isPdf?await pdfText(j.file,base,span,"auto"):await imageText(j.file,base,span);
        if(!String(text||"").trim())throw new Error("EMPTY_TEXT");
        const detected=detectDocumentKind(text);
        const d=detected.kind==="unknown"?{kind:"unknown",month:"לא זוהה",fileName:j.file.name,
          confidence:0,tariffs:{},classification:detected}:
          parse(detected.kind,text,j.file);
        d.classification=detected;
        d.rawText=text;S.docs.push(d);
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