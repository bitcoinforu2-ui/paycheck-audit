import {createPeerExport,parsePeerExport,comparableMonths,difference} from "./peer-comparison.mjs";
import {toRoundedSample,researchReady} from "./research-client.mjs";
import {RESEARCH_API_URL,RESEARCH_TURNSTILE_SITE_KEY} from "./research-config.mjs";
// Dark dashboard presentation ONLY. The existing app-v7.js remains the audit engine.
// No sample monetary findings, confidence scores or recovery amounts are fabricated.
const $=id=>document.getElementById(id);
const money=n=>Number.isFinite(n)?Math.round(n).toLocaleString("he-IL")+" ₪":"—";
const decimal=n=>Number.isFinite(n)?n.toLocaleString("he-IL",{maximumFractionDigits:2})+" ₪":"—";
const integer=n=>Number.isFinite(n)?Math.round(n).toLocaleString("he-IL"):"—";
const goodNum=n=>typeof n==="number"&&Number.isFinite(n);
const asIndex=m=>{const q=/^(0[1-9]|1[0-2])\/(20\d{2})$/.exec(m||"");return q?+q[2]*12+ +q[1]:null};
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const idText=m=>/^(0[1-9]|1[0-2])\/20\d{2}$/.test(m||"")?m:"לא ידוע";
const legendColor={gross:"#9a4ffe",net:"#2dbeff",hourly:"#985dfd",oncall:"#36e0ba"};
let state={docs:[],findings:[],issues:[],pairs:[],coverage:null};
let historySeries="hourly";
let peerRecords=[];
const getDocs=()=>[...new Map(state.docs.filter(d=>d.kind==="payslip"&&asIndex(d.month)!==null)
  .map(d=>[d.month,d])).values()].sort((a,b)=>asIndex(a.month)-asIndex(b.month));
function metricDoc(d,metric){
  if(metric==="gross")return goodNum(d.guard?.summary?.grossCurrent)?d.guard.summary.grossCurrent:null;
  if(metric==="net")return goodNum(d.guard?.summary?.net)?d.guard.summary.net:null;
  if(metric==="hourly")return goodNum(d.hourly)&&d.hourly>=10&&d.hourly<=250?d.hourly:null;
  if(metric==="base")return goodNum(d.guard?.summary?.baseSalary)?d.guard.summary.baseSalary:null;
  if(metric==="extra")return goodNum(d.guard?.summary?.extraWork)?d.guard.summary.extraWork:null;
  if(metric==="additions")return goodNum(d.guard?.summary?.additions)?d.guard.summary.additions:null;
  if(metric==="oncall"){
    const v=goodNum(d.oncallPaidAmount)?d.oncallPaidAmount:d.guard?.recurring?.find?.(r=>r.code==="4392")?.amount;
    return goodNum(v)?v:null;
  }
  return null;
}
function renderKpis(){
  const pay=getDocs(),att=state.docs.filter(x=>x.kind==="attendance");
  $("kpiPayslips").textContent=String(pay.length);
  $("kpiReports").textContent=att.filter(a=>asIndex(a.month)!==null).length+" דוחות נוכחות עם חודש מזוהה";
  $("kpiFindings").textContent=pay.length?String(state.findings.length):"—";
  const all=state.docs.filter(d=>d.kind!=="unknown");
  const confirmed=all.filter(d=>d.kind==="payslip"?Boolean(d.guard?.summary):Boolean(d.verifiedAttendanceSummary));
  $("kpiQuality").textContent=all.length?confirmed.length+"/"+all.length:"—";
  $("kpiQualityNote").textContent=all.length?"סיכומים שנקראו; אימות שיוך חודשי מוצג בנפרד":"ממתין להעלאת קבצים";
  const has=state.docs.length>0;
  $("resultsPlaceholder").classList.toggle("hidden",has);
  $("letterShortcut").disabled=!has;
  const readyPay=pay.length,readyAtt=att.filter(x=>x.verifiedAttendanceSummary).length;
  const coverage=state.coverage;
  const rows=Array.isArray(coverage?.rows)?coverage.rows:[];
  const fullyMatched=Number.isFinite(coverage?.verified)?coverage.verified:0;
  const pending=rows.length-fullyMatched;
  $("integrityList").innerHTML=
    '<p class="'+(readyPay?"good":"")+'">'+(readyPay?"✓":"◯")+' נקראו '+readyPay+' תלושי שכר</p>'+
    '<p class="'+(readyAtt?"good":"")+'">'+(readyAtt?"✓":"◯")+' זוהו '+readyAtt+' דוחות נוכחות עם סיכומים</p>'+
    '<p class="'+(pay.length>=3?"good":"")+'">'+(pay.length>=3?"✓ בוצעה השוואה רב־חודשית":"◯ נדרשים 3 תלושים לבדיקת רכיבים חוזרים")+'</p>'+
    (rows.length?'<p class="'+(pending===0?"good":"")+'">'+(pending===0?"✓":"◯")+' '+fullyMatched+' מתוך '+rows.length+' חודשי תלוש שויכו לדוחות נוכחות מאומתים'+
      (pending>0?' · '+pending+' חודשי תלוש דורשים השלמה או אימות':'')+'</p>':'');
}
function plotBars(){
 const pay=getDocs().filter(p=>goodNum(metricDoc(p,"gross"))&&goodNum(metricDoc(p,"net"))).slice(-12);
 if(!pay.length){$("monthlyChart").innerHTML='<p class="chart-empty">גרף השוואת השכר יתמלא לאחר ייבוא התלושים או העלאתם.</p>';return}
 const w=740,h=214,right=33,left=42,top=13,bottom=33,aw=w-left-right,ah=h-bottom-top;
 const max=Math.ceil(Math.max(...pay.map(d=>metricDoc(d,"gross")))*1.12/5000)*5000||5000;
 const step=aw/pay.length,bw=Math.min(step*.28,24),parts=[];
 for(let i=0;i<=4;i++){const y=top+ah*i/4;parts.push('<line x1="'+left+'" x2="'+(w-right)+'" y1="'+y+'" y2="'+y+'" stroke="#294768" stroke-width=".7"/><text x="'+(left-7)+'" y="'+(y+4)+'" fill="#8aa3c4" text-anchor="end" font-size="10">'+Math.round(max*(1-i/4)/1000)+'K</text>')}
 pay.forEach((d,i)=>{const x=left+step*(i+.5),gross=metricDoc(d,"gross"),net=metricDoc(d,"net");
  for(const [n,color,dx] of [[gross,"#974af9",-bw-1],[net,"#28b5ff",1]]){const ht=n/max*ah;
    parts.push('<rect x="'+(x+dx)+'" y="'+(top+ah-ht)+'" width="'+bw+'" height="'+ht+'" rx="2" fill="'+color+'" opacity=".92"><title>'+esc(d.month)+': '+money(n)+'</title></rect>')}
  parts.push('<text x="'+x+'" y="'+(h-9)+'" text-anchor="middle" fill="#a9b9d5" font-size="11">'+esc(d.month.slice(0,2))+"/"+esc(d.month.slice(-2))+'</text>');
 });
 $("monthlyChart").innerHTML='<svg role="img" aria-label="ברוטו ונטו לפי חודש מתוך התלושים שהועלו" viewBox="0 0 '+w+' '+h+'">'+parts.join("")+'</svg>';
 $("monthlyFoot").textContent=pay.length+" חודשי שכר מזוהים. המספרים מגיעים מסיכומי התלושים בלבד.";
}
function plotHistory(){
 const pay=getDocs(),valid=pay.map(d=>({month:d.month,value:metricDoc(d,historySeries)}))
  .filter(x=>goodNum(x.value)),container=$("historyChart");
 if(!valid.length){container.innerHTML='<p class="chart-empty">אין עדיין נתונים מאומתים לרכיב זה. הוסף תלושים ישנים כדי להרחיב את ההיסטוריה.</p>';}
 else{
  const w=550,h=212,left=48,right=16,top=17,bottom=39,aw=w-left-right,ah=h-top-bottom;
  const times=valid.map(x=>asIndex(x.month)),minX=Math.min(...times),maxX=Math.max(...times);
  const values=valid.map(x=>x.value),low=Math.min(...values),high=Math.max(...values);
  const pad=Math.max((high-low)*.35,historySeries==="hourly"?4:high*.11,1);
  const vmin=Math.max(0,low-pad),vmax=high+pad;
  const px=t=>left+aw*(maxX===minX?.5:(t-minX)/(maxX-minX));
  const py=v=>top+ah*(1-(v-vmin)/(vmax-vmin));
  const parts=[];
  for(let i=0;i<=3;i++){const y=top+ah*i/3,label=vmax-(vmax-vmin)*i/3;
   parts.push('<line x1="'+left+'" x2="'+(w-right)+'" y1="'+y+'" y2="'+y+'" stroke="#2a4267" stroke-width=".7"/><text x="'+(left-7)+'" y="'+(y+3)+'" font-size="10" text-anchor="end" fill="#859bbf">'+(historySeries==="hourly"?label.toFixed(0):(label/1000).toFixed(1)+"k")+'</text>');
  }
  const pts=valid.map(x=>[px(asIndex(x.month)),py(x.value)]);
  parts.push('<polyline points="'+pts.map(v=>v.join(",")).join(" ")+'" fill="none" stroke="'+legendColor[historySeries]+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>');
  pts.forEach(([x,y],i)=>parts.push('<circle cx="'+x+'" cy="'+y+'" r="4" fill="'+legendColor[historySeries]+'" stroke="#d8dbff" stroke-width="1.5"><title>'+esc(valid[i].month)+' · '+(historySeries==="hourly"?decimal(valid[i].value):money(valid[i].value))+'</title></circle>'));
  const labels=[valid[0],...(valid.length>1?[valid[valid.length-1]]:[])];
  for(const d of labels){const x=px(asIndex(d.month));parts.push('<text x="'+x+'" y="'+(h-13)+'" text-anchor="middle" font-size="11" fill="#afc7e7">'+esc(d.month)+'</text>')}
  if(valid.length===1)parts.push('<text x="'+(w/2)+'" y="'+(h-2)+'" text-anchor="middle" font-size="9" fill="#b7c4de">נקודת נתונים אחת — עדיין אין מגמה</text>');
  container.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="מגמת '+esc(historySeries)+' על בסיס '+valid.length+' תלושים">'+parts.join("")+'</svg>';
 }
 const verifiedHourly=pay.filter(d=>goodNum(metricDoc(d,"hourly"))&&d.hourlySource);
 const initial=verifiedHourly[0],latest=verifiedHourly.at(-1);
 $("startWage").textContent=initial?decimal(initial.hourly):"—";
 $("latestWage").textContent=latest?decimal(latest.hourly):"—";
 $("wageChange").textContent=initial&&latest&&initial.month!==latest.month&&initial.hourly>0?
  ((latest.hourly/initial.hourly-1)*100).toFixed(1)+"%":"—";
 $("historyFoot").textContent=verifiedHourly.length>1?
  "מגמה לפי "+verifiedHourly[0].month+" עד "+latest.month+" בלבד. שכר פתיחה של כ־35.8 ₪ טרם אומת.":
  "השכר ההתחלתי שציינת (כ־35.8 ₪) יתווסף רק אחרי אימות בתלוש ישן.";
}
const findingNames={oncall:"כוננות חול",premium:"שעות פרמיה",mileage:"ק״מ משתנות",mealShift:"כלכלה משמרת",mealAllowance:"דמי כלכלה"};
function renderFindings(){
 const box=$("findingList");
 const finds=state.findings.filter(f=>f&&["missing","drop"].includes(f.kind)&&typeof f.month==="string").slice(0,7);
 if(!finds.length){box.innerHTML='<p class="chart-empty">'+(getDocs().length?"לא התגלו כרגע רכיבים חוזרים חסרים ברמת אימות מספקת. ממצאים אחרים מפורטים למטה.":"העלה לפחות שלושה תלושים רצופים להשוואת רכיבים חוזרים.")+'</p>';return}
 box.innerHTML=finds.map(f=>'<div class="finding-row"><div><strong>'+esc(findingNames[f.id]||"רכיב משתנה")+'</strong><small>תלוש '+esc(idText(f.month))+' · '+(f.kind==="missing"?"לא מופיע אחרי חודשים קודמים":"ירידה בכמות לעומת חודשים קודמים")+'</small></div><span class="warning">לבירור</span></div>').join("");
}
function renderOvertime(){
 const pay=getDocs(),keys=[["ot125","125%","#29aaff"],["ot150","150%","#9159fa"],["ot175","175%","#f6ae59"],["ot200","200%","#2ed5b8"]];
 const hours=keys.map(([key,label,color])=>({label,color,value:pay.reduce((sum,d)=>sum+(goodNum(d[key])?d[key]:0),0)}));
 const total=hours.reduce((sum,d)=>sum+d.value,0);
 if(!total){$("overtimeChart").innerHTML='<p class="chart-empty">אין שעות נוספות שנקראו לתצוגה.</p>';return}
 const r=61,c=2*Math.PI*r;let offset=0;
 const arcs=hours.map(d=>{const length=d.value/total*c,start=offset;offset+=length;
   return '<circle cx="80" cy="80" r="'+r+'" fill="none" stroke="'+d.color+'" stroke-width="22" stroke-dasharray="'+length+' '+(c-length)+'" stroke-dashoffset="'+(-start)+'" transform="rotate(-90 80 80)"/>';}).join("");
 $("overtimeChart").innerHTML='<div class="donut-wrap"><svg viewBox="0 0 160 160" role="img" aria-label="התפלגות שעות נוספות"><circle cx="80" cy="80" r="61" stroke="#19395c" stroke-width="22" fill="none"/>'+arcs+'</svg><div class="donut-label">'+total.toFixed(1)+'<small>שעות שנקראו</small></div></div><div class="overtime-legend">'+hours.map(d=>'<p><i class="dot" style="background:'+d.color+'"></i>'+d.label+' — '+d.value.toFixed(1)+'</p>').join("")+'</div>';
}
function exportIsReady(){
 return Boolean($("peerConsent")?.checked&&getDocs().some(d=>Number.isFinite(d.hourly)||Number.isFinite(d.guard?.summary?.grossCurrent)));
}
function renderPeerComparison(){
 const target=$("peerComparison");if(!target)return;
 if(!peerRecords.length){target.innerHTML='<p class="chart-empty">לא נטענו קובצי השוואה. זהו כלי השוואה מקומי ואינו אוסף נתונים מעובדים אחרים.</p>';return}
 const my=createPeerExport(state.docs,{scope:"all"});
 const common=comparableMonths(my,peerRecords);
 const counts=peerRecords.map((p,i)=>"עמית "+(i+1)+": "+p.months.length+" חודשים").join(" · ");
 if(!common.length){
  target.innerHTML='<p class="muted-note">נקלטו '+counts+', אבל אין כרגע חודש תלוש שמופיע אצל כולם. לא ניתן לבצע השוואה חודשית ישירה.</p>';
  return;
 }
 const cells=(r,label)=>'<tr><td>'+esc(r.month)+'</td><td>'+esc(label)+'</td>'+
   [r.hourly,r.gross,r.extraWork,r.oncallPaidAmount].map((v,i)=>
    '<td>'+(Number.isFinite(v)?Number(v).toLocaleString("he-IL",{maximumFractionDigits:2})+(i===0?" ₪/שעה":" ₪"):"לא נקרא")+'</td>').join("")+'</tr>';
 const selected=common.slice(0,6);
 const months=selected.map(x=>{
   const rows=[cells(x.mine,"הנתונים שלי")];
   x.others.forEach((p,i)=>rows.push(cells(p,"עמית "+(i+1))));
   const comparisons=x.others.map((p,i)=>{
    const n=difference(x.mine.hourly,p.hourly);
    return n!==null?'פער שעתי מול עמית '+(i+1)+': '+(n>0?"+":"")+n.toLocaleString("he-IL",{maximumFractionDigits:2})+' ₪':null;
   }).filter(Boolean).join(" · ");
   return '<details class="peer-month"><summary>תלוש '+esc(x.month)+(comparisons?' · '+esc(comparisons):'')+'</summary>'+
    '<div class="peer-table-wrap"><table class="peer-table"><thead><tr><th>חודש</th><th>משתתף</th><th>לשעה</th><th>ברוטו</th><th>עבודה נוספת</th><th>כוננויות</th></tr></thead><tbody>'+
     rows.join("")+'</tbody></table></div></details>';
 }).join("");
 const roleNote=peerRecords.some(p=>p.role!=="similar")?
  'חלק מהמשתתפים לא אישרו שמדובר בתפקיד דומה. אין להסיק מסקנות על שוויון זכאות. ':'';
 target.innerHTML='<p class="muted-note">נקלטו '+counts+'. נמצאו '+common.length+' חודשי תלוש משותפים, מוצגים '+selected.length+' החודשים האחרונים.</p>'+
  '<p class="muted-note">'+roleNote+'סכומי ברוטו מושפעים מהיקף משרה, ותק, דרגה, שעות נוספות, חופשה, החזרים ותיקונים רטרואקטיביים. הבדלי שכר הם שאלות לבירור, לא ראיה לחוב.</p>'+months;
}
function refreshPeerUI(){
 $("peerExportBtn").disabled=!exportIsReady();
 if(peerRecords.length)renderPeerComparison();
}
function draw(){renderKpis();plotBars();plotHistory();renderFindings();renderOvertime();refreshPeerUI()}

window.addEventListener("paycheck:dashboard-data",event=>{
 const d=event.detail||{};state={docs:Array.isArray(d.docs)?d.docs:[],
  findings:Array.isArray(d.findings)?d.findings:[],
  issues:Array.isArray(d.issues)?d.issues:[],
  pairs:Array.isArray(d.pairs)?d.pairs:[],
  coverage:d.coverage&&typeof d.coverage==="object"?d.coverage:null};
 draw();
});
for(const item of document.querySelectorAll("[data-nav]")){
 item.onclick=()=>{
  const target=$(item.dataset.nav),alias={findings:"findings",payroll:"payroll",monthly:"monthly",attendance:"attendance",tax:"tax",letter:"letter",history:"history",peers:"peers",upload:"upload",home:"home"};
  const node=$(alias[item.dataset.nav]);if(!node)return;
  if(item.dataset.nav==="tax")$("tax")?.setAttribute("open","");
  if(item.dataset.nav==="payroll")$("monthlyDetails")?.setAttribute("open","");
  item.closest("nav").querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
  item.classList.add("active");node.scrollIntoView({behavior:"smooth",block:"start"});
  $("sideNav").classList.remove("open");$("mobileNavToggle").setAttribute("aria-expanded","false");
 };
}
$("sideHistoryBtn").onclick=()=>$("history").scrollIntoView({behavior:"smooth"});
$("mobileNavToggle").onclick=()=>{
 const open=$("sideNav").classList.toggle("open");$("mobileNavToggle").setAttribute("aria-expanded",String(open));
};
for(const btn of document.querySelectorAll("[data-series]")){
 btn.onclick=()=>{
  historySeries=btn.dataset.series;
  document.querySelectorAll("[data-series]").forEach(x=>x.classList.toggle("chosen",x===btn));
  plotHistory();
 };
}
$("viewFindings").onclick=()=>{
 $("guardDetails").open=true;$("payroll").scrollIntoView({behavior:"smooth"});
};
$("letterShortcut").onclick=()=>{
 $("requestBtn").click();$("requestSection").scrollIntoView({behavior:"smooth"});
};
$("dashboardSearch").oninput=event=>{
 const q=event.target.value.trim().toLocaleLowerCase("he");
 document.querySelectorAll(".finding-row").forEach(x=>x.style.display=x.textContent.toLocaleLowerCase("he").includes(q)?"":"none");
};
const drop=$("uploadDrop");
drop.ondragover=event=>{event.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=event=>{
 event.preventDefault();drop.classList.remove("drag");
 const files=[...(event.dataTransfer?.files||[])].filter(f=>f.type==="application/pdf"||f.type.startsWith("image/"));
 if(!files.length)return;
 const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));
 $("payFiles").files=dt.files;$("payFiles").dispatchEvent(new Event("change",{bubbles:true}));
};
// This is intentionally opt-in, on demand and disabled until the private
// research Worker and human-verification keys are provisioned.
const researchOn=researchReady(RESEARCH_API_URL,RESEARCH_TURNSTILE_SITE_KEY);
let turnstileResponse="";
function researchControls(){
 const optIn=Boolean($("researchConsent").checked);
 $("researchContributeBtn").disabled=!(researchOn&&optIn&&turnstileResponse&&getDocs().length);
 $("researchRevokeBtn").disabled=!researchOn||!$("researchReceipt").value.trim();
}
$("researchConsent").onchange=researchControls;
$("researchReceipt").oninput=researchControls;
if(researchOn){
 const script=document.createElement("script");
 script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
 script.async=true;script.defer=true;
 script.onload=()=>{
  if(!window.turnstile){$("researchStatus").textContent="לא ניתן להפעיל אימות אנושי כרגע.";return}
  window.turnstile.render("#researchChallenge",{
   sitekey:RESEARCH_TURNSTILE_SITE_KEY,
   callback:token=>{turnstileResponse=token;researchControls()},
   "expired-callback":()=>{turnstileResponse="";researchControls()},
   "error-callback":()=>{turnstileResponse="";researchControls()}
  });
  $("researchStatus").textContent="מאגר מחקר מאובטח זמין. לא יישלח מידע ללא פעולה והסכמה מפורשות.";
 };
 script.onerror=()=>{$("researchStatus").textContent="אימות אנושי אינו זמין כרגע. לא נשלח מידע."};
 document.head.append(script);
}else{
 $("researchStatus").textContent="מאגר המחקר המאובטח עדיין בהכנה; שיתוף אוטומטי מושבת. ניתן להמשיך להשתמש באפליקציה ולהפיק קובץ השוואה פרטי.";
}
$("researchContributeBtn").onclick=async()=>{
 if(!researchOn||!$("researchConsent").checked||!turnstileResponse||!getDocs().length)return;
 const btn=$("researchContributeBtn");btn.disabled=true;
 try{
  const packet=createPeerExport(state.docs,{scope:"all",role:$("peerRole").value});
  const sample=toRoundedSample(packet);
  // Separate consent for server storage; never reuse the private-file checkbox.
  const body={consent:{version:1,purpose:"voluntary-peer-research",accepted:true},
    sample,captcha:turnstileResponse};
  const res=await fetch(RESEARCH_API_URL+"/v1/contribute",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify(body),mode:"cors",credentials:"omit",referrerPolicy:"no-referrer"
  });
  const result=await res.json();
  if(!res.ok||result?.ok!==true||!result?.receipt)throw Error(result?.error||"SHARE_FAILED");
  $("researchReceipt").value=result.receipt;
  $("researchStatus").textContent="השיתוף בוצע בהסכמתך. שמור/י את קוד הביטול המופיע מטה במקום פרטי; בלעדיו לא נוכל לזהות איזו תרומה למחוק.";
  // This session may end without being recoverable: prompt participant
  // to copy their revocation credential, do not send it elsewhere.
  $("researchConsent").checked=false;turnstileResponse="";
  window.turnstile?.reset();
 }catch(e){
  $("researchStatus").textContent="השיתוף לא אושר; אין להניח שהנתונים נשמרו. פירוט: "+String(e?.message||e);
 }finally{researchControls()}
};
$("researchRevokeBtn").onclick=async()=>{
 if(!researchOn)return;const receipt=$("researchReceipt").value.trim();
 if(!receipt||!confirm("למחוק את התרומה שלך ממאגר המחקר?"))return;
 $("researchRevokeBtn").disabled=true;
 try{
  const res=await fetch(RESEARCH_API_URL+"/v1/revoke",{method:"DELETE",
    headers:{"content-type":"application/json"},body:JSON.stringify({receipt}),
    credentials:"omit",mode:"cors",referrerPolicy:"no-referrer"});
  if(!res.ok)throw Error("REVOCATION_NOT_CONFIRMED");
  $("researchReceipt").value="";
  $("researchStatus").textContent="נשלחה ואושרה בקשת מחיקה של התרומה התואמת לקוד. עותקים שכבר חולקו מחוץ למאגר אינם נמחקים מכאן.";
 }catch(e){$("researchStatus").textContent="לא הצלחנו לאשר מחיקה. שמור/י את הקוד ונסה/י שוב."}
 finally{researchControls()}
};
$("peerConsent").onchange=()=>refreshPeerUI();
$("peerExportRange").onchange=()=>refreshPeerUI();
$("peerExportBtn").onclick=()=>{
 if(!exportIsReady()){alert("ייצוא דורש אישור מפורש ותלושי שכר שנקראו.");return}
 try{
  const pack=createPeerExport(state.docs,{scope:$("peerExportRange").value,role:$("peerRole").value});
  const file=new Blob([JSON.stringify(pack,null,2)],{type:"application/json"});
  const uri=URL.createObjectURL(file),link=document.createElement("a");
  link.href=uri;link.download="peer-comparison-private.json";link.click();
  URL.revokeObjectURL(uri);
  $("peerExportStatus").textContent="נוצר קובץ לשיתוף יזום בלבד. הקובץ מכיל נתוני שכר מדויקים; שקול/י היטב למי למסור אותו.";
 }catch(e){$("peerExportStatus").textContent="לא ניתן לייצא: "+String(e?.message||e)}
};
$("peerFiles").onchange=async event=>{
 const files=[...(event.target.files||[])];event.target.value="";
 if(!files.length)return;
 const next=[],errors=[];
 for(const f of files.slice(0,2)){
  try{
   if(f.size>1_000_000)throw Error("FILE_TOO_LARGE");
   const payload=JSON.parse(await f.text());
   next.push(parsePeerExport(payload));
  }catch(e){errors.push("אחד הקבצים לא נקלט ("+String(e?.message||e)+")")}
 }
 peerRecords=next;
 $("peerImportStatus").textContent=(next.length?"נטענו בהסכמה "+next.length+" קובצי השוואה לזיכרון זמני בלבד. ":"")+
   (files.length>2?"בניסוי זה ניתן להשוות לכל היותר שני עמיתים בכל פעם. ":"")+
   errors.join(" ");
 if(next.length&&getDocs().length){
  renderPeerComparison();
 }else if(next.length){
  $("peerComparison").textContent="קובצי העמיתים נקלטו; טען/י תחילה גם את תלושי השכר האישיים שלך.";
 }else{
  renderPeerComparison();
 }
};
$("peerClearBtn").onclick=()=>{
 peerRecords=[];$("peerFiles").value="";
 $("peerImportStatus").textContent="נתוני העמיתים נוקו מהדפדפן הנוכחי.";
 renderPeerComparison();
};
draw();
