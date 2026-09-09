import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Execute the actual market hook with a minimal deterministic hook scheduler.
// No network or browser is required; delayed upstream responses are controlled.
const temp=await mkdtemp(join(tmpdir(),'mortgage-refresh-'));
after(()=>rm(temp,{recursive:true,force:true}));
await writeFile(join(temp,'react.mjs'),`
let active;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
export function scheduler(){
 const slots=[];let cursor=0,pending=[];
 const h={slots,next:()=>cursor++,render(fn){active=h;cursor=0;const value=fn();for(const run of pending.splice(0))run();return value;},effect(fn){pending.push(fn);},dispose(){for(const s of slots)s?.cleanup?.();}};return h;
}
export function useRef(value){const h=active,n=h.next();return h.slots[n]??=( {current:value} );}
export function useState(value){const h=active,n=h.next();if(!h.slots[n])h.slots[n]={value:typeof value==='function'?value():value};return [h.slots[n].value,v=>{h.slots[n].value=typeof v==='function'?v(h.slots[n].value):v;}];}
export function useCallback(fn,deps){const h=active,n=h.next();if(!same(h.slots[n]?.deps,deps))h.slots[n]={value:fn,deps};return h.slots[n].value;}
export function useEffect(fn,deps){const h=active,n=h.next();if(!same(h.slots[n]?.deps,deps)){const old=h.slots[n];h.slots[n]={deps};h.effect(()=>{old?.cleanup?.();h.slots[n].cleanup=fn();});}}
`);
for(const name of ['state-taxes','mortgage-pricing','mortgage-model','market-data','use-market-data']) {
 const source=await readFile(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replace(/from "react"/g,'from "./react.mjs"').replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"');
 await writeFile(join(temp,name+'.mjs'),js);
}
const {scheduler}=await import(pathToFileURL(join(temp,'react.mjs')));
const {useMarketData}=await import(pathToFileURL(join(temp,'use-market-data.mjs')));
const {defaults,calculate}=await import(pathToFileURL(join(temp,'mortgage-model.mjs')));
const {stateTaxRules}=await import(pathToFileURL(join(temp,'state-taxes.mjs')));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const rates=(thirty=6,fifteen=5.5)=>({30:{rate:thirty,asOf:'2026-09-03'},15:{rate:fifteen,asOf:'2026-09-03'}});

async function withMarket(run){
 const original=globalThis.fetch,h=scheduler(),calls=[],pending=[];
 let inputs={...defaults},bitcoinRequests=0;
 globalThis.fetch=(url,options)=>{
  const source=new URL(String(url),'http://localhost').searchParams.get('source');calls.push({source,options});
  if(source==='mortgage')return new Promise(resolve=>pending.push(resolve));
  const data=source==='bitcoin'?{price:++bitcoinRequests===1?80000:90000,asOf:'2026-09-07T00:00:00Z'}:{rules:stateTaxRules,reviewedAt:'2026-09-07'};
  return Promise.resolve(Response.json({data,checkedAt:'2026-09-07T00:00:00Z'}));
 };
 const setInputs=next=>{inputs=typeof next==='function'?next(inputs):next;};
 const render=()=>h.render(()=>useMarketData(setInputs));
 const observe=async(data=rates())=>{assert.ok(pending.length);pending.shift()(Response.json({data,checkedAt:'2026-09-07T00:00:00Z'}));await flush();};
 try{await run({render,observe,calls,pending,get inputs(){return inputs;},get result(){return calculate(inputs).result;}});}
 finally{h.dispose();for(const resolve of pending)resolve(new Response('Unavailable',{status:503}));await flush();globalThis.fetch=original;}
}

test('live PMMS stays unadjusted while down-payment changes automatically reprice only Traditional',async()=>{
 await withMarket(async m=>{
  let market=m.render();market.setField('downPct',15);await m.observe();market=m.render();
  assert.equal(m.inputs.baseMortgageRate,6);assert.equal(m.result.traditionalPricing.rate,6.04);assert.equal(m.inputs.cryptoRate,7.5);
  assert.equal(market.status.mortgage.value,6);assert.equal(market.status.mortgage.state,'live');
  for(const [downPct,rate] of [[5,5.92],[10,5.96],[15,6.04],[20,6],[5,5.92]]){
   market.setField('downPct',downPct);market=m.render();assert.equal(m.result.traditionalPricing.rate,rate);assert.equal(m.inputs.cryptoRate,7.5);
  }
  assert.equal(m.calls.filter(c=>c.source==='mortgage').length,1);
  for(const {options} of m.calls)assert.equal(options.cache,'no-store');
 });
});
test('15/30 switching retrieves the right benchmark and late responses cannot compound or overwrite spreads',async()=>{
 await withMarket(async m=>{
  let market=m.render();await m.observe();market=m.render();
  market.changeTerm(15);market=m.render();assert.equal(m.result.traditionalPricing.rate,5.5);
  market.changeTerm(30);market=m.render();assert.equal(m.result.traditionalPricing.rate,5.92);
  // The older 15-year response arrives after the 30-year selection.
  await m.observe(rates(9,8));assert.equal(m.inputs.baseMortgageRate,6);assert.equal(m.inputs.termYears,30);
  await m.observe(rates(6.2,5.7));market=m.render();
  assert.equal(m.result.traditionalPricing.rate,6.12);assert.equal(m.inputs.cryptoRate,7.7);
  market.changeTerm(15);await m.observe(rates(6.3,5.8));
  assert.equal(m.inputs.baseMortgageRate,5.8);assert.equal(m.result.traditionalPricing.rate,5.8);assert.equal(m.inputs.cryptoRate,7.3);
  assert.equal(m.calls.filter(c=>c.source==='mortgage').length,4);
 });
});
test('quote edits survive in-flight PMMS loads without contaminating Bitcoin pricing',async()=>{
 await withMarket(async m=>{
  let market=m.render();market.setField('traditionalRateOverride',6.125);market.setField('cryptoRate',8.875);
  await m.observe();market=m.render();assert.equal(m.result.traditionalPricing.rate,6.125);assert.equal(m.inputs.baseMortgageRate,6);assert.equal(m.inputs.cryptoRate,8.875);
  market.setField('downPct',15);market=m.render();assert.equal(m.result.traditionalPricing.rate,6.125);
  market.setField('traditionalRateOverride',null);market=m.render();assert.equal(m.result.traditionalPricing.rate,6.04);assert.equal(m.inputs.cryptoRate,8.875);
  market.changeTerm(15);market=m.render();market.setField('traditionalRateOverride',5.25);await m.observe(rates(6.1,5.6));
  assert.equal(m.result.traditionalPricing.rate,5.25);assert.equal(m.inputs.cryptoRate,7.1);
 });
});
test('reset refreshes every source, clears quotes and restores exactly one spread; failures retain the baseline',async()=>{
 await withMarket(async m=>{
  let market=m.render();await m.observe();market=m.render();
  market.setField('downPct',20);market.setField('traditionalRateOverride',4);market.setField('cryptoRate',5);
  market.reset();market=m.render();
  assert.equal(m.inputs.downPct,5);assert.equal(m.inputs.traditionalRateOverride,null);assert.equal(m.inputs.baseMortgageRate,6);assert.equal(m.result.traditionalPricing.rate,5.92);assert.equal(m.inputs.cryptoRate,7.5);
  await m.observe(rates(6.5,6));market=m.render();
  assert.equal(m.inputs.btcPrice,90000);assert.equal(m.result.traditionalPricing.rate,6.42);assert.equal(m.inputs.cryptoRate,8);
  for(const source of ['bitcoin','mortgage','taxes'])assert.equal(m.calls.filter(c=>c.source===source).length,2);
  market.reset();m.pending.shift()(new Response('Unavailable',{status:503}));await flush();market=m.render();
  assert.equal(market.status.mortgage.state,'unavailable');assert.equal(m.inputs.baseMortgageRate,6.5);assert.equal(m.result.traditionalPricing.rate,6.42);assert.equal(m.inputs.cryptoRate,8);
 });
});
