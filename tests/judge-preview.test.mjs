import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, available, reserve, restore, validateState } from '../judge-preview/state.js';

test('sample reservation updates exact available/project coverage and retries save once',()=>{
  const before=initialState();
  const request={id:'motor',quantity:1,expectedAvailable:1,actionId:'review-1'};
  const result=reserve(before,request);
  assert.equal(result.ok,true);assert.equal(available(result.state,'motor'),0);assert.equal(result.state.reserved.motor,3);
  assert.equal(before.reserved.motor,2);
  const repeat=reserve(result.state,request);
  assert.equal(repeat.ok,true);assert.equal(repeat.repeated,true);assert.equal(repeat.state.receipts.length,1);assert.equal(repeat.state.reserved.motor,3);
  assert.equal(reserve(result.state,{...request,actionId:'review-2',expectedAvailable:0}).ok,false);
});
test('stale forms, fractional units, donors and tools cannot change sample stock',()=>{
  const s=initialState();
  for(const req of [
    {id:'motor',quantity:1,expectedAvailable:2},
    {id:'motor',quantity:2,expectedAvailable:1},
    {id:'motor',quantity:.5,expectedAvailable:1},
    {id:'motor',quantity:-1,expectedAvailable:1},
    {id:'motor',quantity:NaN,expectedAvailable:1},
    {id:'donor',quantity:1,expectedAvailable:1},
    {id:'iron',quantity:1,expectedAvailable:1},
    {id:'mapped-component-1',quantity:1,expectedAvailable:1},
    {id:'__proto__',quantity:1,expectedAvailable:1},
    {id:'toString',quantity:1,expectedAvailable:1},
  ])assert.equal(reserve(s,{...req,actionId:'invalid'}).ok,false);
  assert.deepEqual(s,initialState());
});
test('malformed persisted sample state resets instead of accepting invented quantities',()=>{
  assert.equal(validateState(initialState()),true);
  assert.deepEqual(restore('bad json'),initialState());
  assert.deepEqual(restore(JSON.stringify({...initialState(),reserved:{motor:4,buzzer:0}})),initialState());
  assert.deepEqual(restore(JSON.stringify({...initialState(),reserved:{motor:2,buzzer:-1}})),initialState());
  const valid={...initialState(),planSaved:true};
  assert.deepEqual(restore(JSON.stringify(valid)),valid);
  assert.equal(available(valid,'donor'),0);
  assert.equal(available(valid,'iron'),0);
});
