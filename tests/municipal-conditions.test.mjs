import test from 'node:test';
import assert from 'node:assert/strict';
import {municipalCheckpoints} from '../municipal-conditions.mjs';
test('municipal research requires explicit employer and department scope',()=>{
 for(const p of [{},{employer:'other',department:'municipal-inspection'},
 {employer:'tel-aviv-yafo',department:'construction'}])assert.deepEqual(municipalCheckpoints(p),[]);
});
test('historical municipal audits never authorize automatic entitlement arithmetic',()=>{
 const rules=municipalCheckpoints({employer:'tel-aviv-yafo',department:'municipal-inspection'});
 assert.equal(rules.length,4);
 for(const r of rules){
  assert.equal(r.automaticEntitlement,false);assert.equal(r.status,'requires-current-applicability');
  assert.ok(r.required.length);assert.equal(new URL(r.source).hostname,'www.tel-aviv.gov.il');
 }
});
