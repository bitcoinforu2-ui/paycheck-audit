// Public-client conversion for explicitly consented, rounded research samples.
// Never include identity, raw docs, exact wages or free-text in API payload.
const bucket=(v,step,max)=>{
 if(typeof v!=="number"||!Number.isFinite(v)||v<0||v>max)return null;
 return Math.round(v/step)*step;
};
const validMonth=m=>/^(0[1-9]|1[0-2])\/(20\d{2})$/.test(m||"");
export function toRoundedSample(peer){
 if(!peer||peer.format!=="paycheck-comparison-v1"||!Array.isArray(peer.months))
  throw Error("INVALID_PEER_PACKET");
 const allowed=["similar","different","unknown"];
 if(!allowed.includes(peer.comparability?.role))throw Error("INVALID_ROLE");
 const months=peer.months.filter(x=>validMonth(x.month)).slice(-60).map(x=>({
  month:x.month,
  hourlyBucket:bucket(x.hourly,5,250),
  grossBucket:bucket(x.gross,500,100000),
  baseBucket:bucket(x.baseSalary,500,100000),
  extraBucket:bucket(x.extraWork,500,100000),
  additionBucket:bucket(x.additions,500,100000),
  oncallBucket:bucket(x.oncallPaidAmount,500,100000)
 })).filter(x=>x.hourlyBucket!==null||x.grossBucket!==null);
 if(!months.length)throw Error("NO_SHAREABLE_MONTHS");
 return {version:1,role:peer.comparability.role,months};
}
export function researchReady(url,key){
 try{
  const u=new URL(url);
  return u.protocol==="https:"&&u.hostname!=="bitcoinforu2-ui.github.io"&&
   typeof key==="string"&&key.length>=10;
 }catch{return false}
}
