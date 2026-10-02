// Pure reporting helpers: no storage and no monetary entitlement assumptions.
export function monthOrdinal(month){
  const m=/^(0[1-9]|1[0-2])\/(20\d{2})$/.exec(String(month||""));
  return m?Number(m[2])*12+Number(m[1]):-1;
}
export function shiftMonth(month,by){
  const n=monthOrdinal(month);
  if(n<0)return null;
  const v=n+by,y=Math.floor((v-1)/12),m=v-y*12;
  return String(m).padStart(2,"0")+"/"+y;
}
export function coverageByPayslip(payDocs,attendanceDocs){
  const pCounts=new Map(),aCounts=new Map();
  for(const p of payDocs)if(monthOrdinal(p.month)>0)
    pCounts.set(p.month,(pCounts.get(p.month)||0)+1);
  for(const a of attendanceDocs)if(monthOrdinal(a.month)>0)
    aCounts.set(a.month,(aCounts.get(a.month)||0)+1);
  const months=[...pCounts.keys()].sort((a,b)=>monthOrdinal(a)-monthOrdinal(b));
  const rows=months.map(payMonth=>{
    const expectedWorkMonth=shiftMonth(payMonth,-1),p=pCounts.get(payMonth)||0,a=aCounts.get(expectedWorkMonth)||0;
    const matching=attendanceDocs.filter(d=>d.month===expectedWorkMonth);
    const fullyVerified=a===1&&matching[0]?.verifiedAttendanceSummary===true&&
      Number(matching[0]?.confidence)>=90;
    return {payMonth,expectedWorkMonth,
      status:p!==1||a>1?"ambiguous":a===0?"not-paired":fullyVerified?"verified":"needs-verification"};
  });
  return {rows,verified:rows.filter(x=>x.status==="verified").length,
    notPaired:rows.filter(x=>x.status==="not-paired"),
    needsVerification:rows.filter(x=>x.status==="needs-verification"),
    ambiguous:rows.filter(x=>x.status==="ambiguous"),
    unidentifiedPayDocs:payDocs.filter(x=>monthOrdinal(x.month)<0).length,
    unidentifiedAttendanceDocs:attendanceDocs.filter(x=>monthOrdinal(x.month)<0).length};
}
export function buildPayrollInquiry(issues=[],hourQuestions=[],insufficient=false){
  const grouped=new Map();
  const push=(payMonth,detail)=>{
    const key=monthOrdinal(payMonth)>0?payMonth:"חודש שלא זוהה";
    if(!grouped.has(key))grouped.set(key,new Set());
    if(detail)grouped.get(key).add(String(detail).trim());
  };
  for(const issue of issues){
    if(!issue||!issue.text)continue;
    const month=String(issue.month||"");
    // The existing guard records often embed the MONTH at the start of text.
    const clean=String(issue.text).replace(new RegExp("^(?:חודש\\s*)?"+month.replace("/","\\/")+"\\s*:\\s*"),"").trim();
    push(month,clean);
  }
  for(const q of hourQuestions){
    if(!q||!q.text)continue;
    const period=q.month&&q.pay?"חודש עבודה "+q.month+": ":"";
    push(q.pay||q.month,period+q.text);
  }
  if(!grouped.size){
    return insufficient?"שלום,\n\nחלק מהמסמכים לא נקראו או לא שויכו בוודאות ולכן בדיקת השכר אינה מלאה. אבקש עזרה בהשלמת דוחות הנוכחות ופירוט רכיבי התשלום.\n\nתודה.":
      "שלום,\n\nבבדיקת הנתונים שנקראו לא נמצא ממצא שמצדיק פנייה ממוקדת בשלב זה.\n\nתודה.";
  }
  const body=[...grouped.entries()].sort((a,b)=>monthOrdinal(a[0])-monthOrdinal(b[0]))
    .map(([month,descriptions])=>"תלוש "+month+":\n"+[...descriptions].map(x=>"• "+x).join("\n")).join("\n\n");
  return "שלום,\n\nבבדיקה השוואתית של תלושי השכר ודוחות הנוכחות עלו מספר נקודות לבירור. אין בממצאים משום קביעה על חוסר בתשלום:\n\n"+
    body+"\n\nאבקש לבדוק לגבי כל רכיב את חודש העבודה הרלוונטי, הזכאות בפועל, שינויי שיבוץ וחופשה ותשלומים או תיקונים בחודשים סמוכים.\n\nתודה.";
}


/**
 * Exports ONLY explicitly selected fields, never raw OCR/PDF text, document
 * filenames, person/bank identifiers, or addresses. Salary amounts remain
 * sensitive financial information; the user must choose to download/share.
 */
export function redactedAuditExport({docs=[],findings=[],coverage=null}={}){
  const numeric=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
  const pickSummary=s=>s?Object.fromEntries(
    ["baseSalary","grossCurrent","net","extraWork","additions","differences"]
      .map(k=>[k,numeric(s[k])])):null;
  const takeVariable=c=>Object.fromEntries(
    ["oncall","premium","mileage","mealShift","mealAllowance"].map(k=>
      [k,{state:["paid","absent","unknown"].includes(c?.[k]?.state)?
        c[k].state:"unknown",quantity:numeric(c?.[k]?.quantity)}]));
  return {
    format:"paycheck-audit-review-v1",
    warning:"Contains sensitive wage and work-hour amounts; share only if you choose.",
    docs:docs.map(d=>({
      kind:["payslip","attendance"].includes(d.kind)?d.kind:"unknown",
      month:/^(0[1-9]|1[0-2])\\/20\\d{2}$/.test(d.month||"")?d.month:null,
      monthSource:["visual+calendar","user-confirmed","visual-only","calendar-unique",
        "calendar+unique-payslip","conflicting-evidence"].includes(d.monthSource)?
        d.monthSource:null,
      confidence:numeric(d.confidence),
      verifiedAttendanceSummary:d.verifiedAttendanceSummary===true,
      payrollCodesVerified:d.payrollCodesVerified===true,
      hourly:numeric(d.hourly),
      ot:Object.fromEntries(["ot125","ot150","ot175","ot200"].map(k=>[k,numeric(d[k])])),
      oncall:numeric(d.oncall),
      variableComponents:takeVariable(d.variableComponents),
      totals:pickSummary(d.guard?.summary)
    })),
    findings:findings.filter(f=>f&&/^(0[1-9]|1[0-2])\\/20\\d{2}$/.test(f.month||""))
      .map(f=>({
        month:f.month,
        id:["oncall","premium","mileage","mealShift","mealAllowance"].includes(f.id)?f.id:null,
        kind:["missing","drop"].includes(f.kind)?f.kind:null,
        typicalQuantity:numeric(f.typicalQuantity),
        currentQuantity:numeric(f.currentQuantity)
      })),
    coverage:Array.isArray(coverage?.rows)?coverage.rows.map(c=>({
      payMonth:c.payMonth,expectedWorkMonth:c.expectedWorkMonth,status:c.status
    })):[]
  };
}
