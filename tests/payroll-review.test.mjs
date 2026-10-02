import test from "node:test";
import assert from "node:assert/strict";
import {buildPayrollInquiry,coverageByPayslip,shiftMonth} from "../payroll-review.mjs";
const verified=month=>({month,verifiedAttendanceSummary:true,confidence:96});
test("Coverage of eight payslips and five reports identifies the exact unmatched periods",()=>{
  const pays=["02","03","04","05","06","07","08","09"].map(m=>({month:m+"/2026"}));
  const attendance=["01","02","03","04","05"].map(m=>verified(m+"/2026"));
  const result=coverageByPayslip(pays,attendance);
  assert.equal(result.rows.length,8);
  assert.equal(result.verified,5);
  assert.deepEqual(result.notPaired.map(x=>x.payMonth),["07/2026","08/2026","09/2026"]);
  assert.deepEqual(result.notPaired.map(x=>x.expectedWorkMonth),["06/2026","07/2026","08/2026"]);
});
test("Unconfirmed presence is not called a verified match",()=>{
  const x=coverageByPayslip([{month:"09/2026"}],
    [{month:"08/2026",verifiedAttendanceSummary:true,confidence:80}]);
  assert.equal(x.verified,0);
  assert.equal(x.needsVerification.length,1);
});
test("Duplicate slip month stays ambiguous rather than generating inferred debt",()=>{
  const x=coverageByPayslip([{month:"09/2026"},{month:"09/2026"}],[verified("08/2026")]);
  assert.equal(x.verified,0);
  assert.equal(x.ambiguous.length,1);
});
test("Cross-year month pairing is correct",()=>{
  assert.equal(shiftMonth("01/2026",-1),"12/2025");
  assert.equal(shiftMonth("12/2026",1),"01/2027");
});
test("September on-call, separate meals and monthly hour question are grouped in one letter",()=>{
  const letter=buildPayrollInquiry([
    {month:"09/2026",text:"09/2026: רכיב כוננות חול לא הופיע."},
    {month:"09/2026",text:"09/2026: רכיב דמי כלכלה לא הופיע."}
  ],[{month:"08/2026",pay:"09/2026",text:"פער בשעות 125% דורש בירור."}],false);
  assert.equal((letter.match(/תלוש 09\/2026:/g)||[]).length,1);
  assert.equal(letter.includes("09/2026: 09/2026"),false);
  assert.match(letter,/כוננות חול/);
  assert.match(letter,/דמי כלכלה/);
  assert.match(letter,/חודש עבודה 08\/2026/);
  assert.match(letter,/אין בממצאים משום קביעה על חוסר בתשלום/);
});
test("No source findings must not fabricate wage recovery",()=>{
  const letter=buildPayrollInquiry([],[],true);
  assert.match(letter,/אינה מלאה/);
  assert.equal(letter.includes("₪"),false);
});
