import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {VARIABLE_PAY_COMPONENTS,detectVariablePayTrends,monthIndex,inferAbsentOvertimeZero} from '../payroll-trends.mjs';
import {archivedDocument,saveReviewedDocuments} from '../history-store.mjs';
const source=fs.readFileSync(new URL('../app-v7.js',import.meta.url),'utf8')
 .replace(/^import .*$/gm,'').split('function request(')[0];
const app=vm.runInNewContext(source+'\n;({S,num,lineNums,month,parse,metricFromRow,codeTotal,variablePayEvidence,assessHourDifferences,renderPayrollGuard,pdfText,incomeTaxFromSlip})',{
 window:{pdfjsLib:{GlobalWorkerOptions:{}}},document:{getElementById(){return {innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}}}}},
 VARIABLE_PAY_COMPONENTS,detectVariablePayTrends,monthIndex,inferAbsentOvertimeZero,console,Date
});
const array=x=>Array.from(x);
test('payroll codes and ungrouped long amounts remain whole numbers',()=>{
 assert.deepEqual(array(app.lineNums('1125 13000.25 91001 7,703.00 -1200.75')), [1125,13000.25,91001,7703,-1200.75]);
 assert.equal(app.codeTotal(['94010 13000.25'],94010,{min:100}),13000.25);
});
test('missing and malformed numeric cells are not zero',()=>{
 for(const x of [null,undefined,'','abc','--3','₪'])assert.equal(app.num(x),null);
 assert.equal(app.num('0'),0);
});
test('decimal quantities stay decimal while pay periods are excluded from arithmetic',()=>{
 assert.deepEqual(array(app.lineNums('1125 12.25 50.25 615.56 06/2026 03/10/2026')), [1125,12.25,50.25,615.56]);
});
test('a generation date alone cannot supply a payslip month',()=>{
 assert.equal(app.month('הופק ביום 03/10/2026\nשכר בסיס\n1125 09/2026'),'לא זוהה');
 assert.equal(app.month('הופק ביום 03/10/2026\nתלוש שכר לחודש 09/2026\nשכר בסיס'),'09/2026');
});
test('retro item periods do not override a header and conflicting slip headings stay unknown',()=>{
 assert.equal(app.month('ספטמבר 2026\nשכר בסיס\n1125 07/2026'),'09/2026');
 assert.equal(app.month('חודש שכר 08/2026\nחודש שכר 09/2026'),'לא זוהה');
 assert.equal(app.month('אוגוסט 2025\nאוגוסט 2026\nשכר בסיס'),'לא זוהה');
});
test('amount, tariff and quantity are read without a year entering the product search',()=>{
 const m=app.metricFromRow(['1500.00 08/2026 50.00 30.00 שעות נוספות 125% 1125'], '1125',40,1.25,125);
 assert.equal(m.q,30);assert.equal(m.tariff,50);assert.equal(m.amount,1500);
});
test('multiple exact pay-code rows require review instead of taking the first period',()=>{
 assert.equal(app.metricFromRow(['1125 200 50 4 06/2026','1125 300 50 6 07/2026'],'1125',40,1.25,125),null);
 const m=app.metricFromRow(['1125 200 50 4','1125 200 50 4'],'1125',40,1.25,125);
 assert.equal(m.q,4,'repeated OCR observation is one row, not a second payment');
});
test('a present unreadable code cannot be repaired from a neighboring rate',()=>{
 assert.equal(app.metricFromRow(['1125 unreadable','150% 300 50 6'],'1125',40,1.25,125),null);
});
test('two overtime rows without a reconciled summary do not prove an allowance is absent',()=>{
 const out=app.variablePayEvidence(['1125 200 50 4 || 4 50 200 1125'],{payEvidence:{ot125:'exact-code-row',ot150:'exact-code-row'},guard:{summary:null}});
 assert.equal(out.oncall.state,'unknown');
});
test('displayed component minutes and total difference use the same rounding',()=>{
 const a={ot125:4.009,ot150:4.009,ot175:4.009,ot200:4.009};
 const p={ot125:4.001,ot150:4.001,ot175:4.001,ot200:4.001};
 assert.equal(app.assessHourDifferences(a,p).minutes,4);
});
test('legacy parsed payroll is withheld until source is re-read; valid records retain provenance',()=>{
 const old=archivedDocument({id:'payslip:09/2026',hash:'old',doc:{kind:'payslip',month:'09/2026',fileName:'pay.pdf',hourly:90,guard:{summary:{}},payrollCodesVerified:true}});
 assert.equal(old.needsReparse,true);assert.equal(old.hourly,null);assert.equal(old.guard,null);assert.equal(old.payrollCodesVerified,false);
 const current=archivedDocument({id:'payslip:09/2026',hash:'new',doc:{kind:'payslip',month:'09/2026',parserVersion:2,hourly:40}});
 assert.equal(current.hourly,40);assert.equal(current.sourceHash,'new');
});
test('duplicate reviewed months are rejected before archive mutation',async()=>{
 await assert.rejects(saveReviewedDocuments([{kind:'attendance',month:'08/2026',sourceHash:'a'},{kind:'attendance',month:'08/2026',sourceHash:'b'}]),/ARCHIVE_DUPLICATE_MONTH/);
});

test('income tax must match its own row, not just a residual of mandatory deductions',()=>{
 const guard={summary:{mandatoryDeductions:2000},ni:450.902,health:522.662,grossBL:13000};
 const lines=['91003 900.00','91001 450.902','92041 522.662'];
 const result=app.incomeTaxFromSlip(lines,guard,'09/2026');
 assert.equal(result.verified,false);assert.equal(result.amount,900);
});
test('manual month swaps delete old keys before writing new archive records',async()=>{
 const records=new Map([['attendance:06/2026',{hash:'a'}],['attendance:07/2026',{hash:'b'}]]);
 const db={close(){},transaction(){
  const tx={objectStore(){return {delete(k){records.delete(k)},put(record){records.set(record.id,record)}}}};
  queueMicrotask(()=>tx.oncomplete?.());return tx;
 }};
 globalThis.window={indexedDB:{}};
 globalThis.indexedDB={open(){const req={result:db};queueMicrotask(()=>req.onsuccess());return req}};
 try{
  await saveReviewedDocuments([
   {kind:'attendance',month:'07/2026',sourceHash:'a',archiveKey:'attendance:06/2026',rawText:'private'},
   {kind:'attendance',month:'06/2026',sourceHash:'b',archiveKey:'attendance:07/2026',rawText:'private'}
  ]);
  assert.equal(records.get('attendance:06/2026').hash,'b');
  assert.equal(records.get('attendance:07/2026').hash,'a');
  assert.equal('rawText' in records.get('attendance:07/2026').doc,false);
 }finally{delete globalThis.window;delete globalThis.indexedDB}
});
