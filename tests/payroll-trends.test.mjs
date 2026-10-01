import test from "node:test";
import assert from "node:assert/strict";
import {detectVariablePayTrends,monthIndex,inferAbsentOvertimeZero} from "../payroll-trends.mjs";
const slip=(month,state,quantity=null,extra={})=>({month,components:{
  oncall:{state,quantity},...extra
}});
const only=(docs)=>detectVariablePayTrends(docs).filter(f=>f.id==="oncall");
test("September missing on-call is visible even with payslips alone",()=>{
  const f=only([
    slip("07/2026","paid",21.32),
    slip("08/2026","paid",21.32),
    slip("09/2026","absent",0)
  ]);
  assert.equal(f.length,1);
  assert.equal(f[0].kind,"missing");
  assert.deepEqual(f[0].historyMonths,["08/2026","07/2026"]);
});
test("Unreadable screenshot does NOT mean absent pay",()=>{
  assert.deepEqual(only([
    slip("07/2026","paid",21.32),
    slip("08/2026","paid",21.32),
    slip("09/2026","unknown")
  ]),[]);
});
test("One previous month is insufficient for missing-pay alarm",()=>{
  assert.deepEqual(only([
    slip("08/2026","paid",21.32),slip("09/2026","absent",0)
  ]),[]);
});
test("Quantity decline on stable on-call quantity triggers investigation",()=>{
  const f=only([
    slip("07/2026","paid",21.32),
    slip("08/2026","paid",21.32),
    slip("09/2026","paid",16)
  ]);
  assert.equal(f.length,1);
  assert.equal(f[0].kind,"drop");
  assert.equal(f[0].currentQuantity,16);
});
test("Small quantity fluctuations are not findings",()=>{
  assert.deepEqual(only([
    slip("07/2026","paid",21.32),
    slip("08/2026","paid",21.32),
    slip("09/2026","paid",20)
  ]),[]);
});
test("Duplicate months do not create a trusted baseline",()=>{
  assert.deepEqual(only([
    slip("07/2026","paid",21.32),
    slip("08/2026","paid",21.32),
    slip("08/2026","paid",21.32),
    slip("09/2026","absent",0)
  ]),[]);
});
test("Non-adjacent old payment history does not create a false alarm",()=>{
  assert.deepEqual(only([
    slip("03/2026","paid",21.32),
    slip("06/2026","paid",21.32),
    slip("09/2026","absent",0)
  ]),[]);
});
test("A three-month history also audits generic variable payment components",()=>{
  const premium=(month,state)=>slip(month,"unknown",null,{premium:{state,quantity:null}});
  const f=detectVariablePayTrends([
    premium("06/2026","paid"),
    premium("07/2026","paid"),
    premium("08/2026","paid"),
    premium("09/2026","absent")
  ]);
  assert.ok(f.some(x=>x.id==="premium"&&x.kind==="missing"));
});
test("Month calculation crosses the year boundary",()=>{
  assert.equal(monthIndex("01/2027")-monthIndex("12/2026"),1);
});

test("Absent 150% is a verified zero only with full independent PDF evidence",()=>{
  assert.equal(inferAbsentOvertimeZero({digitalPdfRows:true,reconciledSummary:true,
    verifiedOtherRateCodes:3,targetCodePresent:false}),true);
});
test("Unreadable screenshots never become verified zero",()=>{
  assert.equal(inferAbsentOvertimeZero({digitalPdfRows:false,reconciledSummary:true,
    verifiedOtherRateCodes:3,targetCodePresent:false}),false);
});
test("Partial PDF or unverified summary stays unknown",()=>{
  for(const fields of [
    {digitalPdfRows:true,reconciledSummary:false,verifiedOtherRateCodes:3,targetCodePresent:false},
    {digitalPdfRows:true,reconciledSummary:true,verifiedOtherRateCodes:2,targetCodePresent:false},
    {digitalPdfRows:true,reconciledSummary:true,verifiedOtherRateCodes:3,targetCodePresent:true}
  ])assert.equal(inferAbsentOvertimeZero(fields),false);
});
