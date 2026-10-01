// Pure cross-month trend analysis. No personal data or documents are persisted.
export const VARIABLE_PAY_COMPONENTS = Object.freeze([
  {id:"oncall",code:"4392",label:"כוננות חול",minimumPrior:2,compareQuantity:true},
  {id:"premium",code:"4511",label:"שעות פרמיה",minimumPrior:3,compareQuantity:false},
  {id:"mileage",code:"1034",label:"ק״מ משתנות",minimumPrior:3,compareQuantity:false},
  {id:"mealShift",code:"1476",label:"כלכלה משמרת",minimumPrior:3,compareQuantity:false},
  {id:"mealAllowance",code:"1700",label:"דמי כלכלה",minimumPrior:3,compareQuantity:false}
]);
export function monthIndex(month){
  const m=/^(0[1-9]|1[0-2])\/(20\d{2})$/.exec(month||"");
  return m?Number(m[2])*12+Number(m[1]):-1;
}
const median=values=>{
  const x=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return x.length?(x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2):null;
};
/**
 * A missing or lower VARIABLE component is a question for payroll, never
 * proof of underpayment. Only compare unique, confidently read slip months;
 * unreadable zeroes are UNKNOWN, not absence. Require adjacent prior history.
 * Input: [{month,components:{oncall:{state:"paid"|"absent"|"unknown",quantity:null|number}}}]
 */
export function detectVariablePayTrends(docs,definitions=VARIABLE_PAY_COMPONENTS){
  const counts=new Map();
  for(const d of docs)if(monthIndex(d?.month)>0)
    counts.set(d.month,(counts.get(d.month)||0)+1);
  const unique=docs.filter(d=>monthIndex(d?.month)>0&&counts.get(d.month)===1)
    .sort((a,b)=>monthIndex(a.month)-monthIndex(b.month));
  const findings=[];
  for(const current of unique){
    const now=monthIndex(current.month);
    const prior=unique.filter(d=>{
      const lag=now-monthIndex(d.month);return lag>=1&&lag<=3;
    }).reverse();
    for(const def of definitions){
      const observed=current.components?.[def.id];
      if(!observed||observed.state==="unknown")continue;
      // Recent proven history is required; gaps and isolated allowances are not a baseline.
      const paid=prior.filter(d=>d.components?.[def.id]?.state==="paid");
      const known=prior.filter(d=>["paid","absent"].includes(d.components?.[def.id]?.state));
      if(!prior.length||now-monthIndex(prior[0].month)!==1)continue;
      if(prior[0].components?.[def.id]?.state!=="paid")continue;
      if(paid.length<(def.minimumPrior??2)||known.length<paid.length||
         paid.length/known.length<.67)continue;
      const quantities=paid.map(d=>d.components?.[def.id]?.quantity).filter(x=>Number.isFinite(x)&&x>0);
      const typical=median(quantities);
      const currentQuantity=observed.quantity;
      if(observed.state==="absent"){
        findings.push({month:current.month,id:def.id,label:def.label,kind:"missing",
          historyMonths:paid.map(d=>d.month),typicalQuantity:quantities.length>=2?typical:null,
          currentQuantity:0});
      }else if(def.compareQuantity&&observed.state==="paid"&&Number.isFinite(currentQuantity)&&
        quantities.length>=2&&typical>0&&
        (Math.max(...quantities)-Math.min(...quantities))/typical<=.15&&
        currentQuantity/typical<=.80){
        findings.push({month:current.month,id:def.id,label:def.label,kind:"drop",
          historyMonths:paid.map(d=>d.month),typicalQuantity:typical,
          currentQuantity});
      }
    }
  }
  return findings;
}

/**
 * Infer a printed zero only when the digital payslip is sufficiently complete:
 * three OTHER overtime code rows verified, a reconciled summary, and the
 * target code entirely absent. OCR and partially read slips stay unknown.
 */
export function inferAbsentOvertimeZero({digitalPdfRows=false,reconciledSummary=false,
  verifiedOtherRateCodes=0,targetCodePresent=true}={}){
  return digitalPdfRows===true&&reconciledSummary===true&&
    verifiedOtherRateCodes===3&&targetCodePresent===false;
}
