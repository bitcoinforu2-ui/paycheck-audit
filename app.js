const $=id=>document.getElementById(id);
const state={payFiles:[],attFiles:[],docs:[],issues:[],report:"",profile:{}};
const PROFILE_KEY="paycheckAuditProfileV5";

const pdfjsLib=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

function n(v){if(v===null||v===undefined||v==="")return null;const x=Number(String(v).replace(/,/g,".").replace(/[^0-9.\-]/g,""));return Number.isFinite(x)?x:null}
function fmt(v,d=2){return v==null?"—":Number(v).toLocaleString("he-IL",{maximumFractionDigits:d})}
function hhmm(v){if(v==null)return "—";const t=Math.round(v*60),h=Math.floor(t/60),m=t%60;return h+":"+String(m).padStart(2,"0")}
function toHours(v){if(v==null)return null;const s=String(v).trim(),m=s.match(/^(\d{1,3})[:.](\d{2})$/);if(m&&+m[2]<60)return +m[1]+(+m[2]/60);return n(s)}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function monthFrom(text){
  const t=String(text||"");
  const he={ינואר:1,פברואר:2,מרץ:3,אפריל:4,מאי:5,יוני:6,יולי:7,אוגוסט:8,ספטמבר:9,אוקטובר:10,נובמבר:11,דצמבר:12};
  for(const [k,v] of Object.entries(he)){const m=t.match(new RegExp(k+"\\s*(20\\d{2})"));if(m)return String(v).padStart(2,"0")+"/"+m[1]}
  const m=t.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})\b/);return m?String(+m[1]).padStart(2,"0")+"/"+m[2]:"לא זוהה";
}
function monthShift(mm,delta){if(!mm||mm==="לא זוהה")return null;const [m,y]=mm.split("/").map(Number);const d=new Date(y,m-1+delta,1);return String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear()}

function profileFromForm(){return{salaryType:$("salaryType").value,hourlyRate:n($("hourlyRate").value),weeklyHours:n($("weeklyHours").value),expectedOncall:n($("expectedOncall").value),oncallRate:n($("oncallRate").value),notes:$("profileNotes").value.trim()}}
function fillProfile(p={}){$("salaryType").value=p.salaryType||"unknown";$("hourlyRate").value=p.hourlyRate??"";$("weeklyHours").value=p.weeklyHours??"";$("expectedOncall").value=p.expectedOncall??"";$("oncallRate").value=p.oncallRate??"";$("profileNotes").value=p.notes||""}
try{state.profile=JSON.parse(localStorage.getItem(PROFILE_KEY)||"{}")}catch{state.profile={}} fillProfile(state.profile);
function saveProfile(){state.profile=profileFromForm();if($("rememberProfile").checked)localStorage.setItem(PROFILE_KEY,JSON.stringify(state.profile));else localStorage.removeItem(PROFILE_KEY)}
$("saveProfileBtn").onclick=()=>{saveProfile();const b=$("saveProfileBtn");b.textContent="נשמר ✓";setTimeout(()=>b.textContent="שמור תנאים",1200)};
$("clearDataBtn").onclick=()=>{localStorage.removeItem(PROFILE_KEY);fillProfile({});state.payFiles=[];state.attFiles=[];state.docs=[];state.issues=[];$("payFiles").value="";$("attFiles").value="";renderFiles();$("resultsSection").classList.add("hidden");$("requestSection").classList.add("hidden");$("reviewSection").classList.add("hidden")};

$("payFiles").onchange=e=>{state.payFiles=[...e.target.files];renderFiles()};
$("attFiles").onchange=e=>{state.attFiles=[...e.target.files];renderFiles()};
function renderFiles(){$("payList").innerHTML=state.payFiles.map(f=>'<span class="file-chip">'+esc(f.name)+'</span>').join("");$("attList").innerHTML=state.attFiles.map(f=>'<span class="file-chip">'+esc(f.name)+'</span>').join("")}
function progress(txt,p){$("progressWrap").classList.remove("hidden");$("progressText").textContent=txt;$("progressPct").textContent=Math.round(p*100)+"%";$("progressBar").style.width=Math.round(p*100)+"%"}

async function pdfText(file,base,span){
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let text="";
  for(let i=1;i<=pdf.numPages;i++){progress("קורא PDF: "+file.name+" — "+i+"/"+pdf.numPages,base+span*((i-1)/pdf.numPages));const page=await pdf.getPage(i);const tc=await page.getTextContent();text+="\n"+tc.items.map(x=>x.str).join(" ")}
  return text;
}
async function imageText(file,base,span){
  const res=await Tesseract.recognize(file,"heb+eng",{logger:m=>{if(m.status==="recognizing text")progress("OCR: "+file.name,base+span*(m.progress||0))}});return res.data.text||"";
}
function firstNear(t,patterns){
  for(const p of patterns){const m=t.match(p);if(m){const v=toHours(m[1]);if(v!=null)return v}}
  return null;
}
function parse(kind,text,file){
  const t=String(text||"").replace(/[\u200e\u200f]/g," ").replace(/\s+/g," ");
  const d={kind,fileName:file.name,month:monthFrom(t),ot125:null,ot150:null,ot175:null,ot200:null,oncall:null,confidence:35,text:t};
  const pats={
    ot125:[/(?:125\s*%|שעות\s*נוספות\s*125)[^0-9]{0,35}(\d{1,3}(?:[:.]\d{2})?)/i,/\b1125\b[^0-9]{0,25}(\d+(?:[.,]\d+)?)/],
    ot150:[/(?:150\s*%|שעות\s*נוספות\s*150)[^0-9]{0,35}(\d{1,3}(?:[:.]\d{2})?)/i,/\b1150\b[^0-9]{0,25}(\d+(?:[.,]\d+)?)/],
    ot175:[/(?:175\s*%|שעות\s*נוספות\s*175)[^0-9]{0,35}(\d{1,3}(?:[:.]\d{2})?)/i,/\b1138\b[^0-9]{0,25}(\d+(?:[.,]\d+)?)/],
    ot200:[/(?:200\s*%|שעות\s*נוספות\s*200)[^0-9]{0,35}(\d{1,3}(?:[:.]\d{2})?)/i,/\b1119\b[^0-9]{0,25}(\d+(?:[.,]\d+)?)/],
    oncall:[/(?:כוננ(?:ות|ות)|כוננות)[^0-9]{0,35}(\d+(?:[.,]\d+)?)/i,/\b4392\b[^0-9]{0,25}(\d+(?:[.,]\d+)?)/]
  };
  for(const k of Object.keys(pats))d[k]=firstNear(t,pats[k]);
  const vals=["ot125","ot150","ot175","ot200"].map(k=>d[k]).filter(v=>v!=null);d.otTotal=vals.length?vals.reduce((a,b)=>a+b,0):null;
  if(vals.length>=2)d.confidence=70;if(vals.length>=3)d.confidence=85;
  return d;
}
function pairDocs(){
  const a=state.docs.filter(d=>d.kind==="attendance"),p=state.docs.filter(d=>d.kind==="payslip"),used=new Set(),pairs=[];
  for(const ad of a){
    let best=null,bestScore=-1;
    p.forEach((pd,i)=>{if(used.has(i))return;let s=0;if(pd.month===ad.month)s=80;if(pd.month===monthShift(ad.month,1))s=100;if(pd.otTotal!=null&&ad.otTotal!=null)s-=Math.abs(pd.otTotal-ad.otTotal);if(s>bestScore){bestScore=s;best={pd,i}}});
    if(best){used.add(best.i);pairs.push({a:ad,p:best.pd,lag:best.pd.month===monthShift(ad.month,1)})}else pairs.push({a:ad,p:null,lag:false});
  }
  p.forEach((pd,i)=>{if(!used.has(i))pairs.push({a:null,p:pd,lag:false})});return pairs;
}
function rows(d){if(!d)return '<span class="small">לא נמצא</span>';return [["125%",d.ot125],["150%",d.ot150],["175%",d.ot175],["200%",d.ot200],["כוננות",d.oncall]].map(([k,v])=>'<div class="data-row"><span>'+k+'</span><b>'+(v==null?"—":fmt(v))+'</b></div>').join("")}
function estimateMoney(gap,p){
  const rate=state.profile.hourlyRate;if(gap==null||gap<=0||rate==null)return null;
  return gap*rate*1.25;
}
function buildResults(){
  saveProfile();state.issues=[];const pairs=pairDocs();let severe=0,warn=0,ok=0;const summaries=[];
  $("monthResults").innerHTML=pairs.map(({a,p,lag})=>{
    const workMonth=a?.month||(p?monthShift(p.month,-1):"לא זוהה")||"לא זוהה";let cls="info",title="חסר מסמך משלים",flags=[],gap=null,estimate=null;
    if(!a){warn++;cls="warn";title="חסר דוח נוכחות";flags.push(["warn","לא נמצא דוח נוכחות מתאים לתלוש."])}
    if(!p){warn++;cls="warn";title="חסר תלוש";flags.push(["warn","לא נמצא תלוש מתאים לתקופת העבודה."])}
    if(a&&p){
      if(lag)flags.push(["info","זוהתה התאמה לתלוש של החודש העוקב — ייתכן שרכיבי השעות משולמים בפיגור של חודש."]);
      if(a.otTotal!=null&&p.otTotal!=null){
        gap=a.otTotal-p.otTotal;const ag=Math.abs(gap);
        if(ag<=.25){ok++;cls="ok";title="התאמה טובה";flags.push(["ok","סה״כ השעות הנוספות קרוב מאוד."])}
        else if(ag<=1){warn++;cls="warn";title="פער קטן לבדיקה";flags.push(["warn","פער של כ־"+hhmm(ag)+" בסה״כ שעות נוספות."])}
        else{severe++;cls="bad";title="פער משמעותי לבדיקה";flags.push(["bad","פער של כ־"+hhmm(ag)+" בסה״כ שעות נוספות."])}
        if(gap>.25){estimate=estimateMoney(gap,p);state.issues.push({month:workMonth,text:"בדוח הנוכחות נמצאו כ־"+hhmm(gap)+" שעות יותר מסך השעות הנוספות בתלוש המשויך"+(p?.month?" ("+p.month+")":"")+".",estimate})}
      }else{warn++;cls="warn";title="לא נקראו מספיק נתונים";flags.push(["warn","לא הצלחתי לחלץ את סה״כ השעות משני המסמכים. אפשר לתקן ידנית למטה."])}
      if(state.profile.expectedOncall!=null&&p.oncall!=null){
        const od=state.profile.expectedOncall-p.oncall;if(od>.25){flags.push(["warn","לפי התנאים שהוזנו צפויות "+fmt(state.profile.expectedOncall)+" כוננויות, ובתלוש נקראו "+fmt(p.oncall)+"."]);state.issues.push({month:workMonth,text:"פער כוננויות: צפויות "+fmt(state.profile.expectedOncall)+", בתלוש נקראו "+fmt(p.oncall)+".",estimate:state.profile.oncallRate!=null?od*state.profile.oncallRate:null})}
      }
      if(Math.min(a.confidence,p.confidence)<70)flags.push(["warn","רמת הביטחון בקריאה נמוכה יחסית — מומלץ לאמת את המספרים ידנית."]);
    }
    summaries.push(workMonth+": "+title+(gap==null?"":" | פער "+(gap>0?"+":"")+fmt(gap)+" שעות"));
    return '<article class="month"><div class="month-head"><div><div class="month-name">תקופת עבודה '+esc(workMonth)+'</div><div class="small">תלוש משויך: '+esc(p?.month||"—")+'</div></div><span class="badge '+cls+'">'+title+'</span></div><div class="metrics"><div class="metric"><div class="k">נוכחות — נוספות</div><div class="v">'+(a?.otTotal==null?"—":hhmm(a.otTotal))+'</div></div><div class="metric"><div class="k">תלוש — נוספות</div><div class="v">'+(p?.otTotal==null?"—":fmt(p.otTotal)+" ש׳")+'</div></div><div class="metric"><div class="k">פער</div><div class="v">'+(gap==null?"—":(gap>0?"+":"")+hhmm(Math.abs(gap)))+'</div></div><div class="metric"><div class="k">ביטחון</div><div class="v">'+(a&&p?Math.min(a.confidence,p.confidence)+"%":"—")+'</div></div></div><div class="compare"><div class="side"><h3>🕒 נוכחות</h3>'+rows(a)+'</div><div class="side"><h3>📄 תלוש</h3>'+rows(p)+'</div></div><div class="flags">'+flags.map(([c,t])=>'<div class="flag '+c+'">'+t+(estimate&&c==="bad"?" אומדן גולמי: כ־₪"+fmt(estimate)+".":"")+'</div>').join("")+'</div></article>';
  }).join("");
  state.report=summaries.join("\n");
  const o=$("overall");if(severe){o.className="overall bad";o.textContent="נמצאו "+severe+" תקופות עם פער משמעותי לבדיקה."}else if(warn){o.className="overall warn";o.textContent="יש "+warn+" נקודות שדורשות בדיקה או השלמת מסמך."}else{o.className="overall ok";o.textContent="הנתונים שנקראו נראים תואמים."}
  $("resultsSection").classList.remove("hidden");buildReview();
}
function buildReview(){
  $("reviewRows").innerHTML=state.docs.map((d,i)=>'<div class="review-doc"><b>'+(d.kind==="payslip"?"📄 תלוש":"🕒 נוכחות")+' · '+esc(d.month)+' · '+esc(d.fileName)+'</b><div class="review-grid">'+["ot125","ot150","ot175","ot200","oncall"].map(k=>'<label>'+(k==="oncall"?"כוננות":k.replace("ot","")+"%")+'<input data-i="'+i+'" data-k="'+k+'" value="'+(d[k]??"")+'" inputmode="decimal"></label>').join("")+'</div></div>').join("");
  $("reviewSection").classList.remove("hidden");
}
$("recalcBtn").onclick=()=>{document.querySelectorAll("#reviewRows input").forEach(inp=>{const d=state.docs[+inp.dataset.i];d[inp.dataset.k]=n(inp.value)});state.docs.forEach(d=>{const v=["ot125","ot150","ot175","ot200"].map(k=>d[k]).filter(x=>x!=null);d.otTotal=v.length?v.reduce((a,b)=>a+b,0):null});buildResults();$("resultsSection").scrollIntoView({behavior:"smooth"})};

function requestText(){
  if(!state.issues.length)return "שלום,\n\nביצעתי בדיקה של תלוש השכר מול דוח הנוכחות ולא נמצא כרגע פער ברור שניתן לנסח כפנייה. אבקש בדיקה כללית של הנתונים המצורפים.\n\nתודה.";
  const lines=state.issues.map((x,i)=>(i+1)+". תקופת עבודה "+x.month+": "+x.text+(x.estimate!=null?" אומדן גולמי לפער: כ־₪"+fmt(x.estimate)+".":""));
  return "שלום,\n\nבבדיקה שערכתי בין דוח הנוכחות, תלוש השכר ותנאי העבודה שהזנתי, עלו הנקודות הבאות לבדיקה:\n\n"+lines.join("\n")+(state.profile.notes?"\n\nהערה: "+state.profile.notes:"")+"\n\nאבקש לבדוק את הנתונים מול מערכת הנוכחות ותנאי ההעסקה ולבצע תיקון במידת הצורך.\n\nתודה.";
}
$("copyBtn").onclick=async()=>{const t="סיכום בדיקת שכר מול נוכחות\n\n"+state.report;try{await navigator.clipboard.writeText(t);$("copyBtn").textContent="הועתק ✓";setTimeout(()=>$("copyBtn").textContent="העתק סיכום",1200)}catch{alert(t)}};
$("requestBtn").onclick=()=>{saveProfile();$("requestText").value=requestText();$("requestSection").classList.remove("hidden");$("requestSection").scrollIntoView({behavior:"smooth"})};
$("copyRequestBtn").onclick=async()=>{const t=$("requestText").value||requestText();try{await navigator.clipboard.writeText(t);$("copyRequestBtn").textContent="הועתק ✓";setTimeout(()=>$("copyRequestBtn").textContent="העתק פנייה",1200)}catch{alert(t)}};

$("analyzeBtn").onclick=async()=>{
  if(!state.payFiles.length||!state.attFiles.length){alert("צריך לפחות תלוש שכר אחד ודוח נוכחות אחד.");return}
  $("analyzeBtn").disabled=true;state.docs=[];state.issues=[];saveProfile();$("requestSection").classList.add("hidden");
  const jobs=[...state.payFiles.map(file=>({file,kind:"payslip"})),...state.attFiles.map(file=>({file,kind:"attendance"}))];
  try{
    for(let i=0;i<jobs.length;i++){const j=jobs[i],base=i/jobs.length,span=.94/jobs.length;const isPdf=j.file.type==="application/pdf"||j.file.name.toLowerCase().endsWith(".pdf");const text=isPdf?await pdfText(j.file,base,span):await imageText(j.file,base,span);state.docs.push(parse(j.kind,text,j.file))}
    progress("הניתוח הסתיים",1);buildResults();$("resultsSection").scrollIntoView({behavior:"smooth"});
  }catch(e){console.error(e);alert("הייתה שגיאה בקריאת אחד הקבצים. נסה PDF מקורי או צילום חד יותר.")}finally{$("analyzeBtn").disabled=false}
};