import {chromium} from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1672,height:941},deviceScaleFactor:1});
const errors=[],uploads=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("request",req=>{if(req.method()!=="GET"&&req.method()!=="OPTIONS")uploads.push(req.url())});
await page.route("**/pdf.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",
 body:"window.pdfjsLib={GlobalWorkerOptions:{},getDocument(){throw Error('No PDF should be sent in JSON fixture test')}}"}));
await page.route("**/pdf.worker.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",body:""}));
await page.route("**/tesseract.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",
 body:"window.Tesseract={recognize:async()=>({data:{text:''}})}"}));
const summary=i=>{
 const gross=15000+i*800,net=12000+i*500,mandatory=gross-net,bank=net-2000;
 return {bank,externalDeductions:1000,officeDeductions:1000,net,mandatoryDeductions:mandatory,
  totalPayments:gross,differences:0,grossCurrent:gross,otherPayments:500,expenseRefunds:500,
  extraWork:1500,additions:3500,baseSalary:8000+i*100};
};
const report={format:"paycheck-history-v1",version:1,
 slips:["07/2026","08/2026","09/2026"].map((month,i)=>({
  month,hourly:40+i*5,ot125:5+i,ot150:6,ot175:7,ot200:8,
  oncall:i===2?null:20,oncallPaidAmount:i===2?null:800,
  summary:summary(i),variableComponents:{oncall:i===2?
   {state:"absent",quantity:0}:{state:"paid",quantity:20}}
 })),
 attendance:["06/2026","07/2026","08/2026"].map(month=>({
  month,ot125:5,ot150:6,ot175:7,ot200:8
 }))};
try{
 await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded",timeout:20000});
 assert.equal(await page.title(),"בדיקת התלוש שלי · דשבורד");
 assert.match(await page.locator("h1").innerText(),/המשכורת שלך/);
 assert.equal(await page.locator("#kpiRefund").innerText(),"—","never fabricate recovered money");
 assert.equal(await page.locator("#kpiQuality").innerText(),"—","no fabricated 96% quality");
 await page.locator("#historyImport").setInputFiles({
  name:"synthetic-history.json",mimeType:"application/json",
  buffer:Buffer.from(JSON.stringify(report))
 });
 await page.getByText("נקלטו 3 תלושים",{exact:false}).waitFor({timeout:15000});
 assert.equal(await page.locator("#kpiPayslips").innerText(),"3");
 assert.match(await page.locator("#findingList").innerText(),/כוננות חול/);
 assert.equal(await page.locator("#monthlyChart svg").count(),1);
 assert.equal(await page.locator("#historyChart svg").count(),1);
 assert.equal(await page.locator("#overtimeChart svg").count(),1);
 assert.equal(await page.locator("#latestWage").innerText(),"50 ₪");
 assert.match(await page.locator("#wageChange").innerText(),/25\.0%/);
 assert.equal(await page.locator("#letterShortcut").isEnabled(),true);
 assert.deepEqual(uploads,[],"no employee data or statistics transmitted from page");
 await page.locator('[data-series="gross"]').click();
 assert.equal(await page.locator("#historyChart svg").count(),1);
 await page.locator("#viewFindings").click();
 assert.equal(await page.locator("#guardDetails").getAttribute("open"),"");
 assert.deepEqual(errors,[],"no browser JS runtime errors");
 fs.mkdirSync("/tmp/payroll-screens",{recursive:true});
 await page.screenshot({path:"/tmp/payroll-screens/dashboard-desktop.png",fullPage:true});
 console.log("DASHBOARD_E2E_PASS: no fake money; 3 imported months; history trend; overtime; finding; private-only.");
 const phone=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await phone.route("**/pdf.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",
  body:"window.pdfjsLib={GlobalWorkerOptions:{}}"}));
 await phone.route("**/pdf.worker.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",body:""}));
 await phone.route("**/tesseract.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",
  body:"window.Tesseract={recognize:async()=>({data:{text:''}})}"}));
 await phone.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
 await phone.locator("#mobileNavToggle").click();
 assert.equal(await phone.locator("#sideNav").evaluate(el=>el.classList.contains("open")),true);
 await phone.locator('[data-nav="history"]').click();
 assert.equal(await phone.locator("#sideNav").evaluate(el=>el.classList.contains("open")),false);
 assert.equal(await phone.locator("body").evaluate(el=>el.scrollWidth<=390),true,"no horizontal overflow");
 await phone.screenshot({path:"/tmp/payroll-screens/dashboard-mobile.png",fullPage:true});
 console.log("DASHBOARD_MOBILE_PASS: navigation works, no horizontal overflow");
}finally{await browser.close()}
