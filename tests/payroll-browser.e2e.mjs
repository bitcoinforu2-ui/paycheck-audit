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
   const a=[item(d.title+" 2026",400,780),
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
try {
 await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded",timeout:20000});
 const files=[];
 const slip=[["יולי","07/2026",true],["אוגוסט","08/2026",true],["ספטמבר","09/2026",false]];
 const att=["06/2026","07/2026","08/2026"];
 for(let i=0;i<3;i++){
   files.push({name:"payslip-"+i+".pdf",mimeType:"application/pdf",
     buffer:Buffer.from(JSON.stringify({kind:"payslip",title:slip[i][0],
       paymonth:slip[i][1],oncall:slip[i][2]}))});
   files.push({name:"attendance-"+i+".pdf",mimeType:"application/pdf",
     buffer:Buffer.from(JSON.stringify({kind:"attendance",attmonth:att[i]}))});
 }
 await page.locator("#payFiles").setInputFiles(files);
 await page.locator("#analyzeBtn").click();
 await page.locator("#typeSummary").getByText("3 תלושי שכר",{exact:false}).waitFor({timeout:25000});
 const summary=await page.locator("#typeSummary").innerText();
 const guard=await page.locator("#payrollGuard").innerText();
 const months=await page.locator("#monthResults").innerText();
 assert.match(summary,/3 תלושי שכר/);
 assert.match(summary,/3 דוחות נוכחות/);
 assert.match(summary,/חודשי תלוש מזוהים: 3/);
 assert.match(summary,/חודשי נוכחות מזוהים: 3/);
 assert.match(guard,/09\/2026/);
 assert.match(guard,/כוננות חול/);
 assert.match(months,/06\/2026/);
 assert.match(months,/07\/2026/);
 assert.match(months,/08\/2026/);
 assert.match(summary,/מה נדרש להשלמת הבדיקה/,"Unverified months must show an actionable coverage summary");
 // Confirm source months and ensure the correction survives a page reload.
 await page.locator('#reviewSection details').evaluate(el=>el.open=true);
 await page.locator('#recalcBtn').click({force:true});
 await page.getByText('האימות הידני נשמר',{exact:false}).waitFor({timeout:15000});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#typeSummary').getByText('3 תלושי שכר',{exact:false}).waitFor({timeout:15000});
 assert.match(await page.locator('#typeSummary').innerText(),/כיסוי נתונים: 3 תלושים עם נוכחות מאומתת/);
 // Add only ONE source file to the restored multi-month archive.
 await page.locator('#payFiles').setInputFiles({name:'october.pdf',mimeType:'application/pdf',
   buffer:Buffer.from(JSON.stringify({kind:'payslip',title:'אוקטובר',paymonth:'10/2026',oncall:true}))});
 await page.locator('#analyzeBtn').click();
 await page.locator('#typeSummary').getByText('4 תלושי שכר',{exact:false}).waitFor({timeout:15000});
 assert.match(await page.locator('#typeSummary').innerText(),/3 דוחות נוכחות/);
 // A full local archive must not discard a successfully parsed source.
 await page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic full archive','QuotaExceededError')}});
 await page.locator('#payFiles').setInputFiles({name:'november.pdf',mimeType:'application/pdf',
   buffer:Buffer.from(JSON.stringify({kind:'payslip',title:'נובמבר',paymonth:'11/2026',oncall:true}))});
 await page.locator('#analyzeBtn').click();
 await page.locator('#typeSummary').getByText('5 תלושי שכר',{exact:false}).waitFor({timeout:15000});
 assert.match(await page.locator('#autoProfile').innerText(),/שמירה מקומית לא זמינה/);
 assert.match(await page.locator('#archiveStatus').innerText(),/0 ממתינים/);
 assert.deepEqual(errors,[],"browser runtime should emit no JS errors");
 console.log("BROWSER_PASS: six file selection, recognition, three pairings, missing September on-call visible");
 console.log("BROWSER_SUMMARY:",summary.replace(/\s+/g," ").slice(0,300));
} finally { await browser.close(); }
