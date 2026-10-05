import test from 'node:test';
import assert from 'node:assert/strict';
import {canReuseParsedDocument} from '../history-store.mjs';
const complete=()=>({kind:'payslip',month:'09/2026',parserVersion:3,
 ot125:4,ot150:0,ot175:6,ot200:5,payrollCodesVerified:true,hourly:50});
test('fully read current slips can be deduplicated, including verified zero hours',()=>{
 assert.equal(canReuseParsedDocument(complete()),true);
});
test('partial, legacy, and invalid payslips remain retryable',()=>{
 for(const patch of [{ot150:null},{payrollCodesVerified:false},{hourly:null},
  {parserVersion:2},{needsReparse:true},{month:'לא זוהה'},{ot125:-1}])
  assert.equal(canReuseParsedDocument({...complete(),...patch}),false,JSON.stringify(patch));
});
test('attendance requires verified totals and a confirmed work month before deduplication',()=>{
 const report={...complete(),kind:'attendance',verifiedAttendanceSummary:true,confidence:96};
 assert.equal(canReuseParsedDocument(report),true);
 for(const patch of [{verifiedAttendanceSummary:false},{confidence:80},{ot200:null}])
  assert.equal(canReuseParsedDocument({...report,...patch}),false);
});
