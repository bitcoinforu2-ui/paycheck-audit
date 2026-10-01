import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { VARIABLE_PAY_COMPONENTS, detectVariablePayTrends, monthIndex,
  inferAbsentOvertimeZero } from "../payroll-trends.mjs";

// Anonymous, synthetic replicas of the verified *structure* of three monthly
// payslips and three preceding attendance summaries. NO employee data or
// actual PDF documents are embedded in this repository.
const source=fs.readFileSync(new URL("../app-v7.js",import.meta.url),"utf8")
  .replace(/^import .*$/m,"").split("function request(")[0];
const elements=new Map();
const sandbox={
  window:{pdfjsLib:{GlobalWorkerOptions:{}}},
  document:{getElementById(id){
    if(!elements.has(id))elements.set(id,{innerHTML:"",classList:{add(){},remove(){}}});
    return elements.get(id);
  }},
  VARIABLE_PAY_COMPONENTS,detectVariablePayTrends,monthIndex,inferAbsentOvertimeZero,
  console,Date
};
const app=vm.runInNewContext(source+
  "\n;({S,detectDocumentKind,parse,pairs,assessHourDifferences,renderPayrollGuard})",
  sandbox,{filename:"app-v7.js"});
const fmt=x=>Number(x).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const months=[["יולי","07/2026","06/2026"],["אוגוסט","08/2026","07/2026"],["ספטמבר","09/2026","08/2026"]];
const gross=[13000,13000,13000], summary=[
  11000,500,100,11600,1400,13000,0,13000,300,500,2800,2500,6900
];
const ot=[
  ["1125",200,50,4,"שעות נוספות 125%"],
  ["1150",240,60,4,"ש.נ. 150%"],
  ["1138",420,70,6,"ש.נ. שב 175%"],
  ["1119",400,80,5,"ש.נ. 200%"]
];
function pdfRow(code,amount,rate,qty,label,month){
  const cells=[fmt(amount),month,fmt(rate),fmt(qty),label,code];
  return cells.join(" ")+" || "+cells.slice().reverse().join(" ");
}
function payText([title,mm],oncall){
  let text=title+" 2026\n"+
    'שכר בסיס תוספות עבודה נוספת החזר הוצאות תש\' אחרים ברוטו שוטף הפרשים סך תשלומים ניכויי חובה שכר נטו ניכויי משרד ניכויי חו"ז סכום בבנק\n';
  text+=summary.map(fmt).join(" ")+" || "+summary.slice().reverse().map(fmt).join(" ")+"\n";
  text+=ot.map(r=>pdfRow(...r,mm)).join("\n");
  if(oncall)text+="\n"+pdfRow("4392",960,40,24,"כוננות חול",mm);
  return text;
}
function attendanceText(mm){
  const fields={month:mm,monthSource:"visual+calendar",monthCandidates:[mm],
    summary:{method:"pdf-positioned-monthly-summary",
      values:{ot125:4,ot150:4,ot175:6,ot200:5}}};
  return "@@ATT_PDF_META "+JSON.stringify(fields)+" @@\n"+
    "ןוילג תוחכונ םכסמ";
}
test("six-document parser recognizes three months and routes attendance to next-month payroll",()=>{
  assert.ok(app.detectDocumentKind(payText(months[0],true)).kind==="payslip");
  assert.ok(app.detectDocumentKind(attendanceText("06/2026")).kind==="attendance");
  for(let i=0;i<months.length;i++){
    const p=app.parse("payslip",payText(months[i],i!==2),{name:"synthetic-pay-"+i+".pdf"});
    const a=app.parse("attendance",attendanceText(months[i][2]),
      {name:"synthetic-attendance-"+i+".pdf"});
    assert.equal(p.month,months[i][1]);
    assert.equal(a.month,months[i][2]);
    assert.equal(a.verifiedAttendanceSummary,true);
    assert.ok(p.guard?.summary,"payroll totals must reconcile");
    for(const rate of ["ot125","ot150","ot175","ot200"])
      assert.ok(Number.isFinite(p[rate]),"missing "+rate+" on "+p.month);
    app.S.docs.push(p,a);
  }
  assert.equal(app.S.docs.length,6);
  const matched=app.pairs();
  assert.equal(matched.filter(x=>x.a&&x.p).length,3);
  assert.equal(matched.filter(x=>!x.a||!x.p).length,0);
  for(const pair of matched)
    assert.equal(monthIndex(pair.p.month)-monthIndex(pair.a.month),1);
});
test("on-call quantity is NOT confused with tariff when separate hourly value is unavailable",()=>{
  const p=app.S.docs.find(x=>x.kind==="payslip"&&x.month==="07/2026");
  assert.equal(p.oncall,24);
  assert.equal(p.tariffs.oncall,40);
  assert.equal(p.variableComponents.oncall.state,"paid");
  assert.equal(p.variableComponents.oncall.quantity,24);
});
test("missing September on-call produces a cross-slip alert even without attendance on-call data",()=>{
  const pays=app.S.docs.filter(x=>x.kind==="payslip");
  const findings=detectVariablePayTrends(pays.map(d=>({month:d.month,
    components:d.variableComponents})));
  assert.equal(findings.filter(f=>f.id==="oncall"&&f.kind==="missing"&&f.month==="09/2026").length,1);
  app.S.issues=[];app.S.questions=[];
  app.renderPayrollGuard(pays);
  assert.ok(app.S.variableFindings.some(f=>f.id==="oncall"&&f.month==="09/2026"));
  assert.ok(elements.get("payrollGuard").innerHTML.includes("כוננות חול"));
});
test("attendance vs next-month payslip hours reconcile for all three pairs",()=>{
  for(const pair of app.pairs()){
    assert.equal(app.assessHourDifferences(pair.a,pair.p).status,"exact");
  }
});
