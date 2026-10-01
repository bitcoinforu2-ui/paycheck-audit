import {normalizePilotReport} from "../pilot-protocol.mjs";

const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),
  {status,headers:{...JSON_HEADERS,...extra}});
const html=(body)=>new Response(body,{headers:{
  "content-type":"text/html; charset=utf-8","cache-control":"no-store",
  "content-security-policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"
}});
const originHeaders=(request,env)=>{
  const origin=request.headers.get("Origin");
  return origin&&origin===env.ALLOWED_ORIGIN?{
    "access-control-allow-origin":origin,"vary":"Origin",
    "access-control-allow-methods":"POST,DELETE,OPTIONS",
    "access-control-allow-headers":"Content-Type","access-control-max-age":"3600"}:null;
};
const hex=buffer=>[...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,"0")).join("");
const sha256=async text=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
const limitedJson=async request=>{
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
    throw Error("INVALID_CONTENT_TYPE");
  if(Number(request.headers.get("content-length")||"0")>12000)
    throw Error("TOO_LARGE");
  const raw=await request.text();
  if(raw.length>12000)throw Error("TOO_LARGE");
  return JSON.parse(raw);
};
async function verifyTurnstile(token,env,request){
  if(!env.TURNSTILE_SECRET||typeof token!=="string"||token.length>2048)return false;
  const body=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token});
  if(request.headers.get("CF-Connecting-IP"))body.set("remoteip",request.headers.get("CF-Connecting-IP"));
  const res=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {method:"POST",body,signal:AbortSignal.timeout(6500)});
  if(!res.ok)return false;
  const data=await res.json();
  return data.success===true&&(!env.TURNSTILE_HOSTNAME||
    data.hostname===env.TURNSTILE_HOSTNAME);
}
async function verifyAdmin(request,env){
  if(!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD||!env.ADMIN_EMAIL)
    return false; // fail closed before Cloudflare Access is configured
  const jwt=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!jwt||jwt.length>7000)return false;
  const parts=jwt.split(".");
  if(parts.length!==3)return false;
  const decode=(part)=>JSON.parse(atob(part.replace(/-/g,"+").replace(/_/g,"/")));
  let header,payload;
  try{header=decode(parts[0]);payload=decode(parts[1])}catch{return false}
  const domain=env.CF_ACCESS_TEAM_DOMAIN.replace(/\/$/,"");
  if(!/^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(domain)||
     header.alg!=="RS256"||typeof header.kid!=="string"||
     payload.iss!==domain||!([payload.aud].flat()).includes(env.CF_ACCESS_AUD)||
     payload.email?.toLowerCase()!==env.ADMIN_EMAIL.toLowerCase()||
     !Number.isFinite(payload.exp)||payload.exp<=Date.now()/1000||
     !Number.isFinite(payload.iat)||payload.iat>Date.now()/1000+60)return false;
  try{
    const certs=await fetch(domain+"/cdn-cgi/access/certs",{signal:AbortSignal.timeout(6500)});
    if(!certs.ok)return false;
    const jwks=await certs.json();
    const jwk=(jwks.keys||[]).find(k=>k.kid===header.kid&&k.kty==="RSA");
    if(!jwk)return false;
    const key=await crypto.subtle.importKey("jwk",jwk,
      {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const s=parts[2].replace(/-/g,"+").replace(/_/g,"/");
    const signature=Uint8Array.from(atob(s),v=>v.charCodeAt(0));
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,signature,
      new TextEncoder().encode(parts[0]+"."+parts[1]));
  }catch{return false}
}
async function purge(env){
  await env.PILOT_DB.prepare("DELETE FROM pilot_reports WHERE created_at < datetime('now', '-90 days')").run();
}
async function reportSummary(env){
  await purge(env);
  const r=await env.PILOT_DB.prepare("SELECT participant_id, report_json FROM pilot_reports").all();
  const reports=r.results||[];
  const grouped=new Map();
  for(const row of reports){
    let doc;try{doc=JSON.parse(row.report_json)}catch{continue}
    for(const e of doc.events){
      // Every participant contributes at most one count per category.
      const key=[e.kind,e.component||e.rate||"none",e.state,e.bucket||"none"].join("|");
      if(!grouped.has(key))grouped.set(key,new Set());
      grouped.get(key).add(row.participant_id);
    }
  }
  const categories=[...grouped].filter(([,people])=>people.size>=3)
    .map(([key,people])=>({category:key,participants:people.size}))
    .sort((a,b)=>b.participants-a.participants||a.category.localeCompare(b.category));
  return {uniqueParticipants:new Set(reports.map(x=>x.participant_id)).size,
    submittedReports:reports.length,minGroup:3,categories,
    hiddenSmallGroups:grouped.size-categories.length,retentionDays:90};
}
const adminHtml=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ממצאי פיילוט — כניסה למנהל בלבד</title>
<style>body{font:16px system-ui;background:#f5f7fb;color:#172238;max-width:850px;margin:36px auto;padding:16px}
section{background:white;padding:24px;border-radius:18px;box-shadow:0 1px 6px #0001}
table{width:100%;border-collapse:collapse}td,th{text-align:right;padding:12px;border-bottom:1px solid #ddd}
small{color:#64748b}</style>
<section><h1>ממצאים אנונימיים מהפיילוט</h1><p id="totals">טוען נתונים…</p>
<table><thead><tr><th>סוג ממצא</th><th>מספר משתתפים</th></tr></thead><tbody id="rows"></tbody></table>
<p><small>מוצגות רק קבוצות שבהן לפחות שלושה משתתפים שונים. אין כאן קובצי מקור, שמות, תעודות זהות, שכר או תיאורי טקסט חופשיים. הנתונים נשמרים עד 90 יום.</small></p></section>
<script src="/admin/dashboard.js" defer></script></html>`;
const dash=`const labels={"component-missing":"רכיב חסר","component-drop":"ירידה ברכיב","hour-difference":"פער שעות",
"ocr-incomplete":"בעיה בקריאת מסמך","month-unmatched":"שיוך חודשים לא הושלם",
"oncall":"כוננות","premium":"פרמיה","mileage":"נסיעות משתנות","mealShift":"כלכלה במשמרת",
"mealAllowance":"דמי כלכלה","attendance-higher":"שעות בדוח גבוהות","payslip-higher":"שעות בתלוש גבוהות"};
fetch("/admin/summary",{credentials:"same-origin",cache:"no-store"}).then(async r=>{
if(!r.ok)throw Error("נדרשת כניסת מנהל מאומתת");
return r.json()
}).then(data=>{
document.getElementById("totals").textContent="משתתפים: "+data.uniqueParticipants+
" | בדיקות שנשלחו: "+data.submittedReports;
const target=document.getElementById("rows");
for(const c of data.categories){
const tr=document.createElement("tr"),name=document.createElement("td"),count=document.createElement("td");
name.textContent=c.category.split("|").map(x=>labels[x]||x).filter(x=>x!=="none").join(" · ");
count.textContent=c.participants;tr.append(name,count);target.appendChild(tr);
}
if(!data.categories.length)target.textContent="עדיין אין קבוצות של שלושה משתתפים או יותר.";
}).catch(()=>{document.getElementById("totals").textContent="לא ניתן להציג נתונים. יש לבדוק כניסה והרשאות.";});`;
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith("/admin")){
      if(!await verifyAdmin(request,env))return reply({error:"NOT_AUTHORIZED"},403);
      if(request.method!=="GET")return reply({error:"METHOD"},405);
      if(url.pathname==="/admin")return html(adminHtml);
      if(url.pathname==="/admin/dashboard.js")return new Response(dash,
        {headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store",
        "x-content-type-options":"nosniff"}});
      if(url.pathname==="/admin/summary"){
        if(!env.PILOT_DB)return reply({error:"NOT_CONFIGURED"},503);
        return reply(await reportSummary(env));
      }
      return reply({error:"NOT_FOUND"},404);
    }
    if(!["/v1/report","/v1/delete"].includes(url.pathname))return reply({error:"NOT_FOUND"},404);
    const cors=originHeaders(request,env);
    if(!cors)return reply({error:"INVALID_ORIGIN"},403);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(!env.PILOT_DB)return reply({error:"NOT_CONFIGURED"},503,cors);
    if(url.pathname==="/v1/report"&&request.method==="POST"){
      if(!env.TURNSTILE_SECRET)return reply({error:"NOT_CONFIGURED"},503,cors);
      try{
        const raw=await limitedJson(request);
        if(Object.keys(raw).some(k=>!["version","reportId","participantId","deleteToken","period","events","turnstileToken"].includes(k)))
          return reply({error:"INVALID_REPORT"},400,cors);
        const {turnstileToken,...submitted}=raw;
        const report=normalizePilotReport(submitted);
        if(!await verifyTurnstile(turnstileToken,env,request))
          return reply({error:"BOT_CHECK_FAILED"},403,cors);
        const hash=await sha256(report.reportId+":"+report.deleteToken);
        const safe={version:1,period:report.period,events:report.events};
        await purge(env);
        const out=await env.PILOT_DB.prepare(
          "INSERT OR IGNORE INTO pilot_reports(report_id,participant_id,delete_hash,report_json) VALUES(?,?,?,?)")
          .bind(report.reportId,report.participantId,hash,JSON.stringify(safe)).run();
        if(!out.meta?.changes)return reply({error:"DUPLICATE_REPORT"},409,cors);
        return reply({ok:true,retentionDays:90},201,cors);
      }catch(e){
        if(["INVALID_CONTENT_TYPE","TOO_LARGE","INVALID_REPORT","INVALID_EVENT",
          "INVALID_COMPONENT","INVALID_HOURS","INVALID_QUALITY"].includes(e.message))
          return reply({error:e.message},400,cors);
        return reply({error:"SUBMISSION_FAILED"},503,cors);
      }
    }
    if(url.pathname==="/v1/delete"&&request.method==="DELETE"){
      try{
        const body=await limitedJson(request);
        const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if(Object.keys(body).sort().join(",")!=="deleteToken,reportId"||
          !uuid.test(body.reportId)||!/^[0-9a-f]{64}$/i.test(body.deleteToken))
          return reply({error:"INVALID_DELETE"},400,cors);
        const hash=await sha256(body.reportId+":"+body.deleteToken);
        const out=await env.PILOT_DB.prepare(
          "DELETE FROM pilot_reports WHERE report_id=? AND delete_hash=?")
          .bind(body.reportId,hash).run();
        // Same response for absent or invalid tokens; do not disclose record existence.
        return reply({ok:true,deleted:Boolean(out.meta?.changes)},200,cors);
      }catch{return reply({error:"DELETE_FAILED"},400,cors)}
    }
    return reply({error:"METHOD"},405,cors);
  },
  async scheduled(event,env){if(env.PILOT_DB)await purge(env)}
};
