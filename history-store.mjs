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
export function saveDocument(id,doc){
 // Keep parsed fields only. Raw employee names/PDF text never enter this archive.
 const {rawText, ...safeDoc}=doc;
 return queued(async()=>{
  const db=await database(),monthlyId=doc.kind+":"+doc.month;
  try{
    // One authoritative record per work month and document kind.
    const previous=await transact(db,"readonly",s=>s.get(monthlyId));
    await transact(db,"readwrite",s=>s.put({id:monthlyId,hash:id,doc:safeDoc}));
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
