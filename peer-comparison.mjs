// Voluntary local peer comparison. No uploads, names, identity fields or raw documents.
// With a cohort of three identifiable coworkers, this is NOT anonymous.
const NUMERIC=["hourly","gross","baseSalary","extraWork","additions","oncallPaidAmount","ot125","ot150","ot175","ot200"];
const monthRx=/^(0[1-9]|1[0-2])\/(20\d{2})$/;
const monthNumber=m=>{const x=monthRx.exec(m||"");return x?Number(x[2])*12+Number(x[1]):null};
const safeNumber=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=1_000_000?x:null;
const selectedScope=s=>s==="all"?"all":"latest12";
const contextValues=["similar","different","unknown"];
export function createPeerExport(docs,{scope="latest12",role="unknown"}={}){
 if(!contextValues.includes(role))throw Error("INVALID_ROLE");
 const byMonth=new Map();
 for(const d of docs){
  if(d?.kind!=="payslip"||monthNumber(d.month)===null)continue;
  const row={month:d.month};
  for(const key of NUMERIC){
   const source=key==="gross"?d.guard?.summary?.grossCurrent:
     ["baseSalary","extraWork","additions"].includes(key)?d.guard?.summary?.[key]:d[key];
   row[key]=safeNumber(source);
  }
  if(row.hourly===null&&row.gross===null)continue;
  byMonth.set(d.month,row);
 }
 const all=[...byMonth.values()].sort((a,b)=>monthNumber(a.month)-monthNumber(b.month));
 const months=selectedScope(scope)==="all"?all:all.slice(-12);
 if(!months.length)throw Error("NO_VERIFIED_PAYSLIPS");
 return {format:"paycheck-comparison-v1",version:1,scope:selectedScope(scope),
  comparability:{role},months};
}
export function parsePeerExport(payload){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
   payload.format!=="paycheck-comparison-v1"||payload.version!==1||
   !["latest12","all"].includes(payload.scope)||
   !payload.comparability||Object.keys(payload.comparability).some(k=>k!=="role")||
   !contextValues.includes(payload.comparability.role)||
   !Array.isArray(payload.months)||payload.months.length<1||payload.months.length>120||
   Object.keys(payload).some(k=>!["format","version","scope","comparability","months"].includes(k)))
  throw Error("INVALID_COMPARISON_FILE");
 const seen=new Set();
 const months=payload.months.map(row=>{
  if(!row||typeof row!=="object"||Array.isArray(row)||
    monthNumber(row.month)===null||seen.has(row.month)||
    Object.keys(row).some(k=>k!=="month"&&!NUMERIC.includes(k)))
   throw Error("INVALID_MONTH");
  seen.add(row.month);
  const sanitized={month:row.month};
  for(const key of NUMERIC){
   if(row[key]!==null&&row[key]!==undefined&&safeNumber(row[key])===null)
    throw Error("INVALID_AMOUNT");
   sanitized[key]=safeNumber(row[key]);
  }
  if(sanitized.gross===null&&sanitized.hourly===null)throw Error("EMPTY_MONTH");
  return sanitized;
 });
 return {role:payload.comparability.role,months:months.sort((a,b)=>monthNumber(a.month)-monthNumber(b.month))};
}
export function comparableMonths(self,peers){
 const others=peers.map(p=>new Map(p.months.map(m=>[m.month,m])));
 const all=new Map(self.months.map(m=>[m.month,m]));
 return [...all.entries()].filter(([m])=>others.every(map=>map.has(m)))
  .map(([month,mine])=>({month,mine,others:others.map(map=>map.get(month))}))
  .sort((a,b)=>monthNumber(b.month)-monthNumber(a.month));
}
export function difference(a,b){
 return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)*100)/100:null;
}
