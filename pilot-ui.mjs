import {buildPilotEvents,normalizePilotReport} from "./pilot-protocol.mjs";
import {PILOT_API_BASE,PILOT_TURNSTILE_SITE_KEY} from "./pilot-config.mjs";

const el=id=>document.getElementById(id);
const configured=/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(PILOT_API_BASE)&&
  PILOT_TURNSTILE_SITE_KEY.length>10;
const prefix="paycheck-pilot-v1";
let current=null,captchaToken="",widgetId=null,sendBusy=false,sentCurrent=false;
const read=(key,otherwise)=>{try{return JSON.parse(localStorage.getItem(key))??otherwise}catch{return otherwise}};
const write=(key,value)=>{localStorage.setItem(key,JSON.stringify(value))};
const randomToken=()=>[...crypto.getRandomValues(new Uint8Array(32))]
  .map(v=>v.toString(16).padStart(2,"0")).join("");
const status=(msg,ok=false)=>{
  el("pilotStatus").textContent=msg;
  el("pilotStatus").dataset.state=ok?"ok":"info";
};
function receipts(){return read(prefix+"-receipts",[])}
function displayReceipts(){
  const list=el("pilotReceipts");
  if(!list)return;
  list.replaceChildren();
  for(const rec of receipts()){
    const row=document.createElement("div"),label=document.createElement("span"),
      del=document.createElement("button");
    row.className="pilot-receipt";
    label.textContent="בדיקה "+rec.period+" · מזהה "+rec.reportId.slice(0,8);
    del.type="button";del.className="secondary";del.textContent="מחק מהמאגר";
    del.onclick=async()=>{
      if(!configured)return;
      del.disabled=true;
      try{
        const res=await fetch(PILOT_API_BASE+"/v1/delete",{
          method:"DELETE",mode:"cors",headers:{"content-type":"application/json"},
          body:JSON.stringify({reportId:rec.reportId,deleteToken:rec.deleteToken}),
          credentials:"omit"});
        if(!res.ok)throw Error("DELETE_FAILED");
        write(prefix+"-receipts",receipts().filter(r=>r.reportId!==rec.reportId));
        displayReceipts();status("הבקשה למחיקת הבדיקה הושלמה.",true);
      }catch{status("לא ניתן לאמת מחיקה כרגע. נסה שוב מאוחר יותר.");del.disabled=false}
    };
    row.append(label,del);list.appendChild(row);
  }
}
function ready(){
  return Boolean(configured&&current&&el("pilotConsent").checked&&!sentCurrent);
}
function updateButton(){
  el("pilotSend").disabled=!ready()||sendBusy||!captchaToken;
}
async function prepareCaptcha(){
  if(window.turnstile){renderCaptcha();return}
  if(document.getElementById("pilotTurnstileScript"))return;
  const script=document.createElement("script");
  script.id="pilotTurnstileScript";script.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async=true;
  script.onload=renderCaptcha;
  script.onerror=()=>status("אימות נגד בוטים לא נטען. לא נשלחו נתונים.");
  document.head.appendChild(script);
}
function renderCaptcha(){
  if(!window.turnstile||widgetId!==null||!el("pilotConsent").checked)return;
  widgetId=window.turnstile.render("#pilotCaptcha",{
    sitekey:PILOT_TURNSTILE_SITE_KEY,
    callback:token=>{captchaToken=token;updateButton()},
    "expired-callback":()=>{captchaToken="";updateButton()},
    "error-callback":()=>{captchaToken="";status("אימות נכשל. אפשר לנסות שוב.");updateButton()}
  });
}
window.addEventListener("paycheck:analysis-ready",event=>{
  const d=event.detail;
  if(!d||!/^(0[1-9]|1[0-2])\/20\d{2}$/.test(d.month||""))return;
  current={period:d.month.slice(3)+"-"+d.month.slice(0,2),
    events:buildPilotEvents({
      findings:d.findings,
      pairs:(d.hourlyDifferences||[]).map(diffs=>({
        a:{verifiedAttendanceSummary:true,diffs},
        p:{payrollCodesVerified:true}})),
      assess:a=>({diffs:a.diffs}),
      unknown:d.unknown,unpaired:d.unpaired
    })};
  sentCurrent=false;captchaToken="";
  if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId);
  el("pilotPanel").classList.remove("hidden");
  if(!configured)status("איסוף הנתונים טרם הופעל על ידי מנהל הפיילוט. הבדיקות עצמן נשארות במכשיר.");
  else status("הניתוח הושלם. ניתן לשתף רק את קטגוריות הממצאים, בהסכמתך.");
  updateButton();
});
el("pilotConsent").onchange=async()=>{
  if(!configured)return;
  if(el("pilotConsent").checked)await prepareCaptcha();
  else {captchaToken="";if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId)}
  updateButton();
};
el("pilotSend").onclick=async()=>{
  if(!ready()||!captchaToken)return;
  sendBusy=true;updateButton();
  let report=null;
  try{
    const participantKey=prefix+"-participant";
    let participant=read(participantKey,null);
    if(typeof participant!=="string"){
      participant=crypto.randomUUID();
      write(participantKey,participant);
    }
    report=normalizePilotReport({version:1,reportId:crypto.randomUUID(),
      participantId:participant,deleteToken:randomToken(),
      period:current.period,events:current.events});
    // Keep the deletion secret locally BEFORE sending, including if the
    // remote request succeeds but the browser loses its confirmation.
    write(prefix+"-receipts",[...receipts(),{reportId:report.reportId,
      deleteToken:report.deleteToken,period:report.period,pending:true}]);
    const res=await fetch(PILOT_API_BASE+"/v1/report",{method:"POST",mode:"cors",
      credentials:"omit",headers:{"content-type":"application/json"},
      body:JSON.stringify({...report,turnstileToken:captchaToken})});
    if(!res.ok)throw Error("REMOTE_ERROR_"+res.status);
    write(prefix+"-receipts",receipts().map(x=>x.reportId===report.reportId?
      {...x,pending:false}:x));
    sentCurrent=true;
    el("pilotConsent").checked=false;
    status("קטגוריות הממצאים נשלחו בהצלחה. מסמכי המקור לא נשלחו.",true);
  }catch{
    status("השליחה לא אושרה. בדוק את החיבור או את הגדרות הפיילוט. אם נשמר מזהה מחיקה מקומי, אפשר למחוק באמצעותו גם במקרה של תשובה שאבדה.");
  }finally{
    sendBusy=false;captchaToken="";
    if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId);
    displayReceipts();updateButton();
  }
};
el("pilotResetId").onclick=()=>{
  if(!confirm("להחליף את המזהה האנונימי? מומלץ במכשיר משותף לפני שעובד חדש משתמש באפליקציה. קבלות מחיקה קיימות יישמרו."))return;
  try{localStorage.removeItem(prefix+"-participant");status("המזהה האנונימי אופס. בבדיקה הבאה יוקצה מזהה חדש.",true)}
  catch{status("לא ניתן לאפס מזהה במכשיר זה.")}
};
displayReceipts();
if(!configured){
  el("pilotConsent").disabled=true;
  status("הפיילוט עדיין לא חובר למאגר מאובטח. אפשר להמשיך בבדיקות שכר מקומיות ללא איסוף נתונים.");
}
