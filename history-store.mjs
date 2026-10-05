// Local-only IndexedDB archive: parsed data, not uploaded PDFs or OCR text.
// IndexedDB can be cleared by the browser; do not present it as a cloud backup.
const DB="paycheck-audit-history-v1",STORE="documents";
function database(){
 return new Promise((resolve,reject)=>{
  if(!("indexedDB" in window))return reject(new Error("INDEXEDDB_UNAVAILABLE"));
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:"id"});
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
function transact(db,mode,work){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);
  const request=work(tx.objectStore(STORE));
  let result;
  if(request){request.onsuccess=()=>{result=request.result};}
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error||new Error("ARCHIVE_ABORT"));
 });
}
let pending=Promise.resolve();
function queued(fn){const next=pending.catch(()=>{}).then(fn);pending=next;return next}
export async function fingerprint(file){
 const bytes=await file.arrayBuffer();
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export async function savedDocuments(){
 const db=await database();
 try{return await transact(db,"readonly",s=>s.getAll())}
 finally{db.close()}
}
export function archivedDocument(entry){
 const d=entry?.doc;
 if(!d||!["payslip","attendance"].includes(d.kind)||! /^(0[1-9]|1[0-2])\/20\d{2}$/.test(d.month||""))return null;
 const restored={...d,sourceHash:entry.hash||null,archiveKey:entry.id};
 // Old parsed payroll code/amount tokens were split into three-digit chunks.
 // Raw files are not retained, so these records must be read from source again.
 if(d.kind==="payslip"&&(![2,3].includes(d.parserVersion)||
    (d.parserVersion===2&&!d.payrollCodesVerified))&&!String(d.fileName||"").startsWith("ייבוא פרטי")){
  Object.assign(restored,{needsReparse:true,payrollCodesVerified:false,guard:null,
    variableComponents:{},hourly:null,hourlySource:null,oncall:null,oncallPaidAmount:null,
    ot125:null,ot150:null,ot175:null,ot200:null,otTotal:null,tariffs:{},
    marginalTax:null,taxGrossYtd:null,incomeTaxPeriod:null});
 }
 return restored;
}
// A stored fingerprint proves identity, not successful extraction. Partial
// reads must remain retryable after OCR/parser improvements or manual review.
export function canReuseParsedDocument(doc){
 if(!doc||doc.needsReparse||doc.parserVersion!==3||
    !/^(0[1-9]|1[0-2])\/20\d{2}$/.test(doc.month||""))return false;
 if(!["ot125","ot150","ot175","ot200"].every(k=>
    Number.isFinite(doc[k])&&doc[k]>=0))return false;
 if(doc.kind==="payslip")return doc.payrollCodesVerified===true&&
    Number.isFinite(doc.hourly)&&doc.hourly>0;
 return doc.kind==="attendance"&&doc.verifiedAttendanceSummary===true&&
    Number.isFinite(doc.confidence)&&doc.confidence>=90;
}
export function saveDocument(id,doc,{previousKey=null}={}){
 // Keep parsed fields only. Raw employee names/PDF text never enter this archive.
 const {rawText,archiveKey, ...safeDoc}=doc;
 return queued(async()=>{
  const db=await database(),monthlyId=doc.kind+":"+doc.month;
  try{
    // One authoritative record per work month and document kind.
    const previous=await transact(db,"readonly",s=>s.get(monthlyId));
    await transact(db,"readwrite",s=>{
      if(previousKey&&previousKey!==monthlyId)s.delete(previousKey);
      return s.put({id:monthlyId,hash:id,doc:safeDoc});
    });
    return previous?.hash||null;
  }finally{db.close()}
 });
}
export function clearSavedDocuments(){
 return queued(async()=>{const db=await database();
  try{await transact(db,"readwrite",s=>s.clear())}
  finally{db.close()}
 });
}
export function saveReviewedDocuments(docs){
 const records=docs.filter(d=>d.sourceHash&&["payslip","attendance"].includes(d.kind)&&
   /^(0[1-9]|1[0-2])\/20\d{2}$/.test(d.month||"")&&!d.needsReparse);
 const keys=records.map(d=>d.kind+":"+d.month);
 if(new Set(keys).size!==keys.length)return Promise.reject(new Error("ARCHIVE_DUPLICATE_MONTH"));
 return queued(async()=>{
  const db=await database();
  try{
   // Delete every old key BEFORE inserting new records: two corrected months
   // may swap places, and sequential delete/put would erase the first record.
   await transact(db,"readwrite",store=>{
    for(const d of records)if(d.archiveKey)store.delete(d.archiveKey);
    for(const d of records){
     const {rawText,archiveKey,...safeDoc}=d;
     store.put({id:d.kind+":"+d.month,hash:d.sourceHash,doc:safeDoc});
    }
   });
  }finally{db.close()}
 });
}
