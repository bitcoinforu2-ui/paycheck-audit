// Dedicated Cloudflare Worker API for voluntary research only.
// GitHub Pages remains the user-facing URL. Never deploy this Worker without
// D1, a real Turnstile secret, configured origin and operator review.
// No raw documents, names, exact figures, free text, addresses or IDs accepted.
const respond=(body,status=200,headers={})=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json","cache-control":"no-store",
 "referrer-policy":"no-referrer",...headers}});
const cleanOrigin=x=>x==="https://bitcoinforu2-ui.github.io"?x:null;
const cors=o=>o?{"access-control-allow-origin":o,"access-control-allow-methods":"POST,DELETE,OPTIONS",
 "access-control-allow-headers":"content-type","vary":"origin"}:{};
const digest=async s=>{
 const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
 return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const validMonth=x=>/^(0[1-9]|1[0-2])\/(20\d{2})$/.test(x||"");
const finite=(n,step,max)=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=max&&n%step===0;
function validBody(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||
  Object.keys(p).some(k=>!["consent","sample","captcha"].includes(k)))return false;
 if(!p.consent||p.consent.version!==1||p.consent.purpose!=="voluntary-peer-research"||
  p.consent.accepted!==true||Object.keys(p.consent).some(k=>!["version","purpose","accepted"].includes(k)))return false;
 const s=p.sample;
 if(!s||s.version!==1||!["similar","different","unknown"].includes(s.role)||
  !Array.isArray(s.months)||!s.months.length||s.months.length>60||
  Object.keys(s).some(k=>!["version","role","months"].includes(k)))return false;
 const seen=new Set();
 for(const m of s.months){
  if(!m||typeof m!=="object"||Object.keys(m).some(k=>!["month","hourlyBucket","grossBucket","baseBucket","extraBucket","additionBucket","oncallBucket"].includes(k))||
   !validMonth(m.month)||seen.has(m.month))return false;
  seen.add(m.month);
  if(!finite(m.hourlyBucket,5,250)&&m.hourlyBucket!==null)return false;
  for(const key of ["grossBucket","baseBucket","extraBucket","additionBucket","oncallBucket"])
   if(!finite(m[key],500,100000)&&m[key]!==null)return false;
  if(m.hourlyBucket===null&&m.grossBucket===null)return false;
 }
 return typeof p.captcha==="string"&&p.captcha.length>4&&p.captcha.length<3000;
}
async function captchaOk(token,env,req){
 if(!env.TURNSTILE_SECRET)return false; // Fail closed.
 const form=new FormData();form.set("secret",env.TURNSTILE_SECRET);form.set("response",token);
 const ip=req.headers.get("CF-Connecting-IP");if(ip)form.set("remoteip",ip);
 const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
 if(!r.ok)return false;const out=await r.json();return out.success===true&&out.hostname==="bitcoinforu2-ui.github.io";
}
async function record(req,env){
 if(!env.RESEARCH_DB||!env.TURNSTILE_SECRET)return respond({error:"service_not_configured"},503);
 const raw=await req.text();
 if(raw.length>18000)return respond({error:"payload_too_large"},413);
 let p;try{p=JSON.parse(raw)}catch{return respond({error:"invalid_json"},400)}
 if(!validBody(p))return respond({error:"unsupported_or_excessive_data"},400);
 if(!await captchaOk(p.captcha,env,req))return respond({error:"human_verification_failed"},403);
 const receipt=crypto.randomUUID()+"."+crypto.randomUUID();
 const hash=await digest(receipt),created=new Date().toISOString();
 const sample=JSON.stringify(p.sample);
 await env.RESEARCH_DB.prepare(
  "INSERT INTO research_contributions (receipt_hash,consent_version,purpose,created_at,sample) VALUES(?,?,?,?,?)")
  .bind(hash,1,"voluntary-peer-research",created,sample).run();
 // The caller must store this high-entropy deletion credential. Never log it.
 return respond({ok:true,receipt,stored:"rounded_selected_monthly_metrics",notice:"Save your deletion receipt."},201);
}
async function revoke(req,env){
 if(!env.RESEARCH_DB)return respond({error:"service_not_configured"},503);
 const raw=await req.text();if(raw.length>1000)return respond({error:"invalid_request"},400);
 let p;try{p=JSON.parse(raw)}catch{return respond({error:"invalid_json"},400)}
 if(Object.keys(p||{}).length!==1||typeof p.receipt!=="string"||
   !/^[\da-f-]{36}\.[\da-f-]{36}$/i.test(p.receipt))
  return respond({error:"invalid_receipt"},400);
 const hash=await digest(p.receipt);
 await env.RESEARCH_DB.prepare("DELETE FROM research_contributions WHERE receipt_hash=?").bind(hash).run();
 return respond({ok:true,note:"Matching contribution, if any, deleted."});
}
// No individual submissions are retrievable through this API.
// Operator-only summaries are withheld for cohorts smaller than 10
// contributions (not verified distinct people). Small pilots remain local.
async function adminSummary(req,env){
 const auth=req.headers.get("authorization")||"";
 if(!env.ADMIN_API_TOKEN||!env.RESEARCH_DB||
  auth!=="Bearer "+env.ADMIN_API_TOKEN)return respond({error:"unauthorized"},401);
 const result=await env.RESEARCH_DB.prepare(
  "SELECT sample FROM research_contributions ORDER BY created_at DESC LIMIT 10000").all();
 const cohorts=new Map();
 for(const record of result.results||[]){
  let p;try{p=JSON.parse(record.sample)}catch{continue}
  if(!p||!Array.isArray(p.months)||!["similar","different","unknown"].includes(p.role))continue;
  for(const m of p.months){
   if(!validMonth(m.month))continue;
   const key=m.month+":"+p.role;
   if(!cohorts.has(key))cohorts.set(key,[]);
   cohorts.get(key).push(m);
  }
 }
 const published=[];
 for(const [key,rows] of cohorts){
  if(rows.length<10)continue; // No small-cohort disclosure.
  const [month,role]=key.split(":");
  const med=k=>{
   const arr=rows.map(r=>r[k]).filter(Number.isFinite).sort((a,b)=>a-b);
   if(arr.length<10)return null;
   const n=arr.length;return n%2?arr[(n-1)/2]:(arr[n/2-1]+arr[n/2])/2;
  };
  published.push({month,role,contributions:rows.length,
   hourlyBucketMedian:med("hourlyBucket"),grossBucketMedian:med("grossBucket"),
   baseBucketMedian:med("baseBucket"),extraBucketMedian:med("extraBucket"),
   additionBucketMedian:med("additionBucket"),oncallBucketMedian:med("oncallBucket")});
 }
 return respond({ok:true,minimumCohort:10,
  warning:"Contribution count is not proof of unique workers; results are descriptive only.",
  cohorts:published});
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==="/v1/summary"&&req.method==="GET"){
  try{return await adminSummary(req,env)}catch{return respond({error:"service_error"},503)}
 }
 const origin=cleanOrigin(req.headers.get("origin"));
 // Cross-origin browser sharing is restricted; non-browser misuse still
 // requires Turnstile. No reading endpoints are publicly exposed.
 if(req.method==="OPTIONS"){
  if(!origin)return new Response(null,{status:403});
  return new Response(null,{status:204,headers:cors(origin)});
 }
 if(!origin)return respond({error:"origin_not_allowed"},403);
 const headers=cors(origin);
 try{
  let result;
  if(u.pathname==="/v1/contribute"&&req.method==="POST")result=await record(req,env);
  else if(u.pathname==="/v1/revoke"&&req.method==="DELETE")result=await revoke(req,env);
  else result=respond({error:"not_found"},404);
  for(const [k,v] of Object.entries(headers))result.headers.set(k,v);
  return result;
 }catch(error){
  // Do not log request bodies or details of employee financial data.
  return respond({error:"service_error"},503,headers);
 }
}};
