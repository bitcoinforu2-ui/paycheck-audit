import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",args:["--no-sandbox"]});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:390,height:844}});
const errors=[],writes=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("request",r=>{if(!["GET","OPTIONS"].includes(r.method()))writes.push(r.url())});
for(const u of ["**/pdf.min.js","**/pdf.worker.min.js","**/tesseract.min.js"]){
 await page.route(u,r=>r.fulfill({status:200,contentType:"text/javascript",
 body:u.includes("pdf.min.js")?"window.pdfjsLib={GlobalWorkerOptions:{}}":u.includes("tesseract")?"window.Tesseract={recognize:async()=>({data:{text:''}})}":""}));
}
const sum={bank:12000,externalDeductions:600,officeDeductions:400,net:13000,mandatoryDeductions:4000,totalPayments:17000,differences:0,grossCurrent:17000,otherPayments:400,expenseRefunds:600,extraWork:2800,additions:3200,baseSalary:9000};
const payload={format:"paycheck-history-v1",version:1,slips:[{month:"08/2026",hourly:50,ot125:4,ot150:5,ot175:1,ot200:2,oncall:8,oncallPaidAmount:400,summary:sum}],attendance:[]};
try{
 await page.goto("http://127.0.0.1:8765/#peers",{waitUntil:"domcontentloaded"});
 await page.locator("#historyImport").setInputFiles({name:"personal.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(payload))});
 await page.waitForFunction(()=>document.getElementById("kpiPayslips")?.textContent==="1",null,{timeout:15000});
 assert.equal(await page.locator("#peerExportBtn").isDisabled(),true);
 assert.match(await page.locator("#peers").innerText(),/שיפור את בדיקות מנוע השכר|שתשפר את בדיקות מנוע השכר/);
 await page.locator("#peerConsent").check();
 assert.equal(await page.locator("#peerExportBtn").isEnabled(),true);
 const downloaded=page.waitForEvent("download");
 await page.locator("#peerExportBtn").click();
 const download=await downloaded;
 assert.match(download.suggestedFilename(),/peer-comparison-private/);
 const packet=await page.evaluate(async()=>{
  const {createPeerExport}=await import("./peer-comparison.mjs");
  return createPeerExport([{kind:"payslip",month:"08/2026",hourly:53,ot125:4,ot150:5,ot175:1,ot200:2,oncallPaidAmount:420,guard:{summary:{grossCurrent:18100,extraWork:3000,additions:3500,baseSalary:9400}}}]);
 });
 await page.locator("#peerFiles").setInputFiles({name:"coworker-voluntary.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(packet))});
 await page.getByText("נקלטו עמיתים",{}).count().catch(()=>{});
 await page.waitForFunction(()=>document.querySelector("#peerComparison")?.textContent?.includes("עמית 1"),null,{timeout:12000});
 assert.match(await page.locator("#peerComparison").innerText(),/פער שעתי מול עמית/);
 assert.deepEqual(writes,[],"Peer comparison must not upload data automatically");
 assert.deepEqual(errors,[],"Peer comparison must have no browser runtime errors");
 await page.locator("#peerClearBtn").click();
 assert.match(await page.locator("#peerComparison").innerText(),/לא נטענו/);
 console.log("PEER_CONSENT_PASS: disabled without consent, explicit opt-in, manual download, voluntary import, no network writes, local clearing");
}finally{await browser.close()}
