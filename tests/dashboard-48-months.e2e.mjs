import {chromium} from "playwright-core";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:1300,height:800}});
page.on("pageerror",e=>{throw e});
for(const u of ["**/pdf.min.js","**/pdf.worker.min.js","**/tesseract.min.js"]){
 await page.route(u,r=>r.fulfill({status:200,contentType:"text/javascript",
  body:u.includes("pdf.min.js")?"window.pdfjsLib={GlobalWorkerOptions:{}}":u.includes("tesseract")?"window.Tesseract={recognize:async()=>({data:{text:''}})}":""}));
}
function monthAt(offset){
 const dt=new Date(Date.UTC(2022,10+offset,1));
 return String(dt.getUTCMonth()+1).padStart(2,"0")+"/"+dt.getUTCFullYear();
}
function summary(i){
 const gross=16000+i*75,net=12500+i*55,mandatory=gross-net;
 return {bank:net-1800,externalDeductions:1300,officeDeductions:500,
  net,mandatoryDeductions:mandatory,totalPayments:gross,differences:0,
  grossCurrent:gross,otherPayments:400,expenseRefunds:600,extraWork:1800,
  additions:3800,baseSalary:7000+i*48};
}
try{
 await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded",timeout:20000});
 for(let batch=0;batch<4;batch++){
  const slips=[],attendance=[];
  for(let j=0;j<12;j++){
   const i=batch*12+j;
   slips.push({month:monthAt(i),hourly:35.8+(50.71-35.8)*i/47,
    ot125:4,ot150:5,ot175:6,ot200:7,oncall:10,oncallPaidAmount:510,
    summary:summary(i),variableComponents:{oncall:{state:"paid",quantity:10}}});
   attendance.push({month:monthAt(i-1),ot125:4,ot150:5,ot175:6,ot200:7});
  }
  const data={format:"paycheck-history-v1",version:1,slips,attendance};
  await page.locator("#historyImport").setInputFiles({name:"anonymous-pack-"+batch+".json",
    mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
  await page.getByText("נקלטו 12 תלושים",{exact:false}).waitFor({timeout:12000});
 }
 assert.equal(await page.locator("#kpiPayslips").innerText(),"48");
 assert.match(await page.locator("#kpiReports").innerText(),/48 דוחות/);
 assert.equal(await page.locator("#monthlyChart svg rect").count(),24,"last 12 monthly gross/net bars only");
 assert.equal(await page.locator("#historyChart svg circle").count(),48,"all 48 months shown as observations");
 assert.match(await page.locator("#latestWage").innerText(),/50/);
 await page.locator('[data-series="base"]').click();
 assert.equal(await page.locator("#historyChart svg circle").count(),48);
 console.log("DASHBOARD_48_MONTHS_PASS: four consecutive local JSON imports; 48 hourly and base observations; last-12 monthly chart");
}finally{await browser.close()}
