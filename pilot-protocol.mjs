// Shared privacy-preserving pilot telemetry schema. No personal text or amounts.
export const COMPONENT_IDS=Object.freeze(["oncall","premium","mileage","mealShift","mealAllowance"]);
export const HOUR_RATES=Object.freeze(["125","150","175","200"]);
const KINDS=new Set(["component-missing","component-drop","hour-difference","ocr-incomplete","month-unmatched"]);
const EVIDENCE=new Set(["verified","needs-review"]);
const STATES=new Set(["attendance-higher","payslip-higher","redistribution","missing","drop","unknown"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[0-9a-f]{64}$/i;
const PERIOD=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const allowed=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
  Object.keys(obj).every(key=>keys.includes(key));
export function normalizePilotReport(report){
  if(!allowed(report,["version","reportId","participantId","deleteToken","period","events"])||
     report.version!==1||!UUID.test(report.reportId)||!UUID.test(report.participantId)||
     !TOKEN.test(report.deleteToken)||!PERIOD.test(report.period)||
     !Array.isArray(report.events)||report.events.length>60)
    throw Error("INVALID_REPORT");
  const events=report.events.map(event=>{
    if(!allowed(event,["kind","component","rate","state","evidence","bucket"])||
       !KINDS.has(event.kind)||!EVIDENCE.has(event.evidence))
      throw Error("INVALID_EVENT");
    const {kind,component=null,rate=null,state=null,bucket=null,evidence}=event;
    if(kind==="component-missing"||kind==="component-drop"){
      if(!COMPONENT_IDS.includes(component)||rate!==null||bucket!==null||
        state!==(kind==="component-missing"?"missing":"drop"))throw Error("INVALID_COMPONENT");
    }else if(kind==="hour-difference"){
      if(component!==null||!HOUR_RATES.includes(rate)||
        !["attendance-higher","payslip-higher","redistribution"].includes(state)||
        !["under-15m","15-60m","1-4h","over-4h"].includes(bucket))
        throw Error("INVALID_HOURS");
    }else if(component!==null||rate!==null||state!=="unknown"||bucket!==null){
      throw Error("INVALID_QUALITY");
    }
    return {kind,component,rate,state,evidence,bucket};
  });
  // Strict field allowlist: no document names, raw OCR, names, employee IDs,
  // bank details, monetary amounts or arbitrary descriptions can leave device.
  return {version:1,reportId:report.reportId,participantId:report.participantId,
    deleteToken:report.deleteToken,period:report.period,events};
}
export function minuteBucket(minutes){
  const x=Math.abs(minutes);
  return x<15?"under-15m":x<60?"15-60m":x<240?"1-4h":"over-4h";
}
export function buildPilotEvents({findings=[],pairs=[],assess,unknown=0,unpaired=0}){
  const events=[];
  for(const finding of findings){
    if(!COMPONENT_IDS.includes(finding.id)||!["missing","drop"].includes(finding.kind))continue;
    events.push({kind:finding.kind==="missing"?"component-missing":"component-drop",
      component:finding.id,state:finding.kind,evidence:"needs-review"});
  }
  for(const pair of pairs){
    if(!pair.a||!pair.p||!pair.a.verifiedAttendanceSummary||!pair.p.payrollCodesVerified)continue;
    const diff=assess(pair.a,pair.p);
    for(const d of diff.diffs||[]){
      if(d.minutes===null||Math.abs(d.minutes)<=15)continue;
      const rate={ot125:"125",ot150:"150",ot175:"175",ot200:"200"}[d.k];
      if(!rate)continue;
      events.push({kind:"hour-difference",rate,
        state:d.minutes>0?"attendance-higher":"payslip-higher",
        evidence:"needs-review",bucket:minuteBucket(d.minutes)});
    }
  }
  if(unknown>0)events.push({kind:"ocr-incomplete",state:"unknown",evidence:"needs-review"});
  if(unpaired>0)events.push({kind:"month-unmatched",state:"unknown",evidence:"needs-review"});
  return events.slice(0,60);
}
