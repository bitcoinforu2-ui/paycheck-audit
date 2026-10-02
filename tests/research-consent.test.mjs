import test from "node:test";
import assert from "node:assert/strict";
import worker from "../research-worker/index.mjs";
import {toRoundedSample,researchReady} from "../research-client.mjs";
const origin="https://bitcoinforu2-ui.github.io";
const peer={format:"paycheck-comparison-v1",comparability:{role:"similar"},months:[{
 month:"08/2026",hourly:51.7,gross:17123,baseSalary:8004,extraWork:2904,additions:3101,oncallPaidAmount:798,
 employeeName:"SHOULD_NOT_EXPORT",taxIdentifier:"private"}]};
test("disabled until validated HTTPS API and public verification key",()=>{
 assert.equal(researchReady("",""),false);
 assert.equal(researchReady("http://example.com","longtestsitekey"),false);
 assert.equal(researchReady("https://research.example.com","longtestsitekey"),true);
});
test("before request, private payroll data is excluded and all exported amounts are rounded",()=>{
 const packet=toRoundedSample(peer),str=JSON.stringify(packet);
 assert.equal(packet.months[0].hourlyBucket,50);
 assert.equal(packet.months[0].grossBucket,17000);
 for(const secret of ["SHOULD_NOT_EXPORT","private","17123","51.7","taxIdentifier"])
  assert.equal(str.includes(secret),false);
});
test("worker refuses unconfigured service, unconsented data, and anonymous public listing",async()=>{
 const good=toRoundedSample(peer),req=(body)=>new Request("https://api.example.com/v1/contribute",{
  method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
 let r=await worker.fetch(req({consent:{version:1,purpose:"voluntary-peer-research",accepted:true},sample:good,captcha:"123456"}),{});
 assert.equal(r.status,503);
 r=await worker.fetch(new Request("https://api.example.com/v1/list",{headers:{origin}}),{});
 assert.equal(r.status,404);
 const env={RESEARCH_DB:{},TURNSTILE_SECRET:"secret"};
 r=await worker.fetch(req({consent:{version:1,purpose:"voluntary-peer-research",accepted:false},sample:good,captcha:"123456"}),env);
 assert.equal(r.status,400);
 r=await worker.fetch(req({consent:{version:1,purpose:"voluntary-peer-research",accepted:true},sample:{...good,employeeId:"123"},captcha:"123456"}),env);
 assert.equal(r.status,400);
});
test("consented contribution is stored without source files and revocable with secret receipt",async()=>{
 const records=new Map(),db={prepare(query){return{bind(...params){return{
 async run(){
  if(query.startsWith("INSERT"))records.set(params[0],{consent:params[1],sample:params[4]});
  if(query.startsWith("DELETE"))records.delete(params[0]);
  return {success:true};
 }}}}}};
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:"bitcoinforu2-ui.github.io"}),{status:200});
 try{
  const env={RESEARCH_DB:db,TURNSTILE_SECRET:"secret"};
  const r=await worker.fetch(new Request("https://api.example.com/v1/contribute",{
   method:"POST",headers:{origin,"content-type":"application/json"},
   body:JSON.stringify({consent:{version:1,purpose:"voluntary-peer-research",accepted:true},
    sample:toRoundedSample(peer),captcha:"1234567"})
  }),env);
  assert.equal(r.status,201);
  const out=await r.json();assert.ok(out.receipt);assert.equal(records.size,1);
  const stored=[...records.values()][0].sample;
  assert.equal(stored.includes("employeeName"),false);
  assert.equal(stored.includes("17123"),false);
  const del=await worker.fetch(new Request("https://api.example.com/v1/revoke",{
   method:"DELETE",headers:{origin,"content-type":"application/json"},
   body:JSON.stringify({receipt:out.receipt})}),env);
  assert.equal(del.status,200);
  assert.equal(records.size,0);
 }finally{globalThis.fetch=originalFetch}
});
