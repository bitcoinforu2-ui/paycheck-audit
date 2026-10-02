import test from "node:test";
import assert from "node:assert/strict";
import {createPeerExport,parsePeerExport,comparableMonths,difference} from "../peer-comparison.mjs";
const one=(month,i=0)=>({kind:"payslip",month,hourly:50+i,oncallPaidAmount:500,
 ot125:4,ot150:2,ot175:3,ot200:2,name:"DO NOT SHARE",rawText:"SECRET",
 guard:{summary:{grossCurrent:17000+i*300,baseSalary:7000,extraWork:3500,additions:4000,net:10000,bank:9000}}});
test("export requires only known comparison fields and excludes identifying/payroll raw data",()=>{
 const packet=createPeerExport([one("08/2026"),one("09/2026",1)],{role:"similar"});
 const str=JSON.stringify(packet);
 for(const secret of ["DO NOT SHARE","SECRET","net","bank","rawText","name","employeeId","address"])assert.ok(!str.includes(secret),"never export "+secret);
 assert.equal(packet.months.length,2);
 assert.equal(packet.months[0].gross,17000);
 assert.equal(parsePeerExport(packet).months[1].hourly,51);
});
test("last 12 applies to most recent valid months, full supports up to 120",()=>{
 const data=Array.from({length:60},(_,i)=>{
  const x=new Date(Date.UTC(2021,i,1));
  return one(String(x.getUTCMonth()+1).padStart(2,"0")+"/"+x.getUTCFullYear(),i);
 });
 assert.equal(createPeerExport(data).months.length,12);
 assert.equal(createPeerExport(data,{scope:"all"}).months.length,60);
 assert.equal(createPeerExport(data).months[0].month,data[48].month);
});
test("matching compares same payslip month only and differences are not treated as debts",()=>{
 const self=parsePeerExport(createPeerExport([one("08/2026"),one("09/2026")]));
 const colleague=parsePeerExport(createPeerExport([one("09/2026",2),one("10/2026")]));
 const common=comparableMonths(self,[colleague]);
 assert.deepEqual(common.map(x=>x.month),["09/2026"]);
 assert.equal(difference(common[0].mine.hourly,common[0].others[0].hourly),-2);
 assert.equal(difference(null,50),null);
});
test("reject identities, malformed data and extra fields on import",()=>{
 const original=createPeerExport([one("09/2026")]);
 assert.throws(()=>parsePeerExport({...original,employeeName:"colleague"}));
 assert.throws(()=>parsePeerExport({...original,months:[{...original.months[0],rawText:"private"}]}));
 assert.throws(()=>parsePeerExport({...original,months:[{...original.months[0],hourly:"75"}]}));
 assert.throws(()=>parsePeerExport({...original,months:[original.months[0],original.months[0]]}));
 assert.throws(()=>createPeerExport([]));
});
