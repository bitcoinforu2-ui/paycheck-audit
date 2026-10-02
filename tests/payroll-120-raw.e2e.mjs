import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";

// Browser-level six-upload test with JSON-backed PDF.js shim. The uploaded
// "PDFs" are synthetic. Real employee PDF files remain outside GitHub.
const mockPdfJs=`
(()=> {
 const fmt=x=>Number(x).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
 const item=(str,x,y)=>({str:String(str),transform:[1,0,0,1,x,y]});
 const summary=[11000,500,100,11600,1400,13000,0,13000,300,500,2800,2500,6900];
 const summaryX=[59.4,112.2,158.3,192.5,235.2,274.4,324.2,357.2,402.8,440.6,481.8,523,564.9];
 const rows=[
  ["1125",200,50,4,"שעות נוספות 125%"],
  ["1150",240,60,4,"ש.נ. 150%"],
  ["1138",420,70,6,"ש.נ. שב 175%"],
  ["1119",400,80,5,"ש.נ. 200%"]
 ];
 function payItems(d) {
   const a=[item(d.title+" "+d.paymonth.slice(-4),400,780),
     item('שכר בסיס תוספות עבודה נוספת החזר הוצאות תש אחרים ברוטו שוטף הפרשים סך תשלומים ניכויי חובה שכר נטו ניכויי משרד ניכויי חו"ז סכום בבנק',0,762)];
   summary.forEach((v,i)=>a.push(item(fmt(v),summaryX[i],749)));
   rows.concat(d.oncall?[["4392",960,40,24,"כוננות חול"]]:[])
    .forEach(([code,amount,tariff,qty,label],i)=>{
      const y=716-i*12;
      a.push(item(fmt(amount),100,y),item(d.paymonth,160,y),
       item(fmt(tariff),247,y),item(fmt(qty),288,y),
       item(label,345,y),item(code,410,y));
    });
   return a;
 }
 function attendanceItems(d){
   const a=[item("01/"+String(Number(d.attmonth.slice(0,2))+2).padStart(2,"0")+"/2026",18,825),
     item("ןוילג תוחכונ םכסמ",280,825)];
   // PDF positioning of the original report's MONTHLY TOTAL band.
   [["176.00",345],["190.16",315],["38.16",285],
     ["4.00",180],["4.00",155],["6.00",125],["5.00",100]]
     .forEach(([v,x])=>a.push(item(v,x,300)));
   return a;
 }
 window.pdfjsLib={GlobalWorkerOptions:{},getDocument({data}){
   const d=JSON.parse(new TextDecoder().decode(data));
   const att=d.kind==="attendance";
   window.__currentMonth=d.attmonth;
   const width=att?595:612,height=att?842:792;
   const page={view:[0,0,width,height],
     getViewport({scale=1}={}){return {width:width*scale,height:height*scale,scale}},
     getTextContent(){return Promise.resolve({items:att?attendanceItems(d):payItems(d)})},
     render(){return {promise:Promise.resolve()}}
   };
   return {promise:Promise.resolve({numPages:1,getPage:async()=>page})};
 }};
})();
`;
const mockTess=`window.Tesseract={recognize:async()=>({data:{text:window.__currentMonth||""}})};`;
const exe=process.env.CHROME_PATH||"/usr/bin/google-chrome";
const browser=await chromium.launch({headless:true,executablePath:exe,args:["--no-sandbox"]});
const page=await browser.newPage();
const errors=[];
page.on("pageerror",e=>errors.push("JS "+e.message));
page.on("console",e=>{if(e.type()==="error")errors.push("CONSOLE "+e.text())});
await page.route("**/pdf.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",body:mockPdfJs}));
await page.route("**/pdf.worker.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",body:""}));
await page.route("**/tesseract.min.js",r=>r.fulfill({status:200,contentType:"text/javascript",body:mockTess}));

const months=["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function mm(offset){const d=new Date(Date.UTC(2021,0+offset,1));return String(d.getUTCMonth()+1).padStart(2,"0")+"/"+d.getUTCFullYear()}
const pairs=Array.from({length:60},(_,i)=>{
 const payMonth=mm(i+1),attMonth=mm(i);
 return [
  {name:"payslip-"+i+".pdf",mimeType:"application/pdf",buffer:Buffer.from(JSON.stringify({kind:"payslip",title:months[Number(payMonth.slice(0,2))-1],paymonth:payMonth,oncall:true}))},
  {name:"attendance-"+i+".pdf",mimeType:"application/pdf",buffer:Buffer.from(JSON.stringify({kind:"attendance",attmonth:attMonth}))}
 ]
});
try{
 await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded",timeout:20000});
 await page.getByText("ארכיון מקומי נטען",{exact:false}).waitFor({timeout:10000});
 // Simulates a phone selecting six payslips and six reports each time.
 for(let batch=0;batch<10;batch++){
  await page.locator("#payFiles").setInputFiles(pairs.slice(batch*6,(batch+1)*6).flat());
  await page.locator("#analyzeBtn").click();
  await page.waitForFunction(count=>Number(document.getElementById("kpiPayslips")?.textContent)===count,(batch+1)*6,{timeout:70000});
  await page.waitForFunction(count=>String(document.getElementById("kpiReports")?.textContent).startsWith(String(count)),(batch+1)*6,{timeout:10000});
  assert.match(await page.locator("#archiveStatus").innerText(),/0 ממתינים/);
 }
 assert.equal(await page.locator("#kpiPayslips").innerText(),"60");
 assert.match(await page.locator("#kpiReports").innerText(),/60 דוחות/);
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.getElementById("kpiPayslips")?.textContent==="60",null,{timeout:25000});
 assert.match(await page.locator("#kpiReports").innerText(),/60 דוחות/);
 await page.locator("#payFiles").setInputFiles(pairs[0]);
 await page.locator("#analyzeBtn").click();
 await page.waitForFunction(()=>document.getElementById("archiveStatus")?.textContent?.includes("0 ממתינים"),null,{timeout:15000});
 assert.equal(await page.locator("#kpiPayslips").innerText(),"60","Repeated file must not duplicate historic month");
 assert.deepEqual(errors,[],"No browser JS errors during 120-file raw import");
 console.log("BROWSER_120_RAW_PASS: 60 payslips + 60 attendance reports in 10 batches, browser reload, duplicate reimport");
}finally{await browser.close()}
