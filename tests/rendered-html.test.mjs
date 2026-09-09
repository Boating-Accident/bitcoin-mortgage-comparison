import assert from "node:assert/strict";
import test from "node:test";

const workerUrl=new URL("../dist/server/index.js",import.meta.url);
workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);
const {default:worker}=await import(workerUrl.href);
const env={ASSETS:{fetch:async()=>new Response("Not found",{status:404})}};
const context={waitUntil(){},passThroughOnException(){}};
const request=(path)=>worker.fetch(new Request(`http://localhost${path}`,{headers:{accept:"text/html"}}),env,context);

test("renders the calculator and its revised defaults",async()=>{
  const response=await request("/");assert.equal(response.status,200);
  assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);
  const html=await response.text();
  for(const label of ["Mortgage Lens","Bitcoin Cost Basis","Starting Bitcoin Quantity","County / Local Capital Gains Tax Rate","Total Up Front Cost","Available Cash","Apply Extra Cash to:","Extra Down Payment","One-time BTC Buy","Custody Outcomes","Print Comparison"]) assert.ok(html.includes(label),label);
  const downField=html.match(/Down Payment %<\/span>.*?<\/label>/)?.[0]??"";
  assert.match(downField,/min="5"/);assert.match(downField,/value="5"/);assert.ok(downField.includes("Traditional only"));
  assert.ok(html.includes("Bitcoin Collateralized never incurs PMI"));
  assert.match(html,/value="60,000.00"/);assert.match(html,/value="23.8"/);
  assert.ok(!html.includes("Cash Down Payment"));
  assert.ok(html.includes("155,000.00"));assert.ok(html.includes("maximum adds 20% of Home Price"));
  assert.match(html,/Available Cash<\/span>.*?value="5,000.00"/);
  assert.match(html,/aria-checked="true"[^>]*value="bitcoin"|value="bitcoin"[^>]*aria-checked="true"/);
  assert.ok(!html.includes("BTC Unrealized % Gain Today"));assert.ok(!html.includes("Expected Theft-Loss Tax Benefit"));
  assert.ok(!html.includes("Bitcoin-Backed"));
  assert.ok(!html.includes("Invested Cash Savings"));
  assert.ok(!html.includes("After-Tax Annual Return on Cash Savings"));
  assert.ok(html.includes("45.000%"));
  assert.ok(!html.includes("DTI Planning Limit"));assert.ok(!html.includes("Incremental Lender Credit"));assert.ok(!html.includes('class="zero-line"'));
  assert.ok(html.includes("Coinbase Rug or 6102 Attack Probability %"));
  assert.ok(html.includes('value="750,000.00"'));assert.ok(html.includes("Select Location"));
  assert.ok(html.indexOf('Projected After-Tax Wealth')<html.indexOf('Cash Required Today'));
  for(const year of [2,4,6,8,10]) assert.ok(html.includes(`Year ${year}`));
  const state=html.indexOf('>State Long-Term Capital Gains Tax Rate</span>'),location=html.indexOf('>Location</span>'),county=html.indexOf('>County / Local Capital Gains Tax Rate</span>'),income=html.indexOf('>Gross Monthly Income</span>');
  assert.ok(state<location&&location<county&&county<income);
  assert.match(html,/Bitcoin Annualized Volatility %<\/span>.*?value="15"/);
  assert.ok(html.includes("0% uses a linear path"));assert.ok(!html.includes("0% keeps the linear path"));
  assert.ok(html.includes("Tax Filing Status"));assert.ok(!html.includes("Filing Status for State Surtaxes"));
  assert.ok(!html.includes("Three-Month Coinbase One Expense"));
  assert.ok(!html.includes("Coinbase One Monthly Fee"));
  assert.ok(html.includes("BTC Purchase Price Path"));
  assert.match(html,/Traditional Rate<\/span>.*?value="6.63"/);
  assert.match(html,/Bitcoin Collateralized Rate<\/span>.*?value="8.21"/);
  assert.ok(html.includes('unadjusted 20%-down PMMS + 1.50 percentage points'));
  assert.ok(html.includes('href="/methodology#ltv-pricing"'));
  assert.ok(html.includes('Automatic PMMS + LTV estimate'));
  const plain=html.replace(/<!--.*?-->/g,'');
  assert.ok(plain.includes('20% down base: 6.71%'));
  assert.ok(plain.includes('Estimated LTV adjustment: -8 bp at 95%'));
  assert.match(plain,/Traditional Rate Used<\/th><td>6.63%<\/td>/);

  const normalized=html.replace(/&amp;/g,"&");
  assert.match(normalized,/Monthly Principal & Interest<\/th>.*?<\/tr><tr[^>]*><th[^>]*>Initial Monthly PMI<\/th>.*?<\/tr><tr[^>]*><th[^>]*>Total Monthly Payment<\/th>/);
  const outside=normalized.indexOf('>Initial Cold Storage BTC</th>'),purchased=normalized.indexOf('>BTC Purchased During Loan</th>');
  const quantity=normalized.indexOf("BTC After Fees & Taxes, Expected"),value=normalized.indexOf("BTC Value After Fees & Taxes, Expected");
  assert.ok(outside>=0&&purchased>outside);
  assert.ok(!normalized.includes('BTC Pledged Today'));assert.ok(!normalized.includes('BTC Held Outside Loan Structure'));
  assert.match(normalized,/BTC Purchased During Loan<\/th>.*?<\/tr><tr[^>]*><th[^>]*>Total Pre-Tax Bitcoin<\/th>/);
  const row=label=>normalized.match(new RegExp(label+'</th>(.*?)</tr>'))?.[1]??'';
  for(const cell of row('Pledged BTC').matchAll(/<td[^>]*>(.*?)<\/td>/g)) {
    assert.ok(cell[1].indexOf(' BTC')>=0&&cell[1].indexOf(' BTC')<cell[1].indexOf('<small>'));
    assert.match(cell[1],/<small>\$[\d,.]+<\/small>/);
  }
  const quantities=label=>[...row(label).matchAll(/(\d+\.\d{8}) BTC/g)].map(m=>BigInt(m[1].replace('.','')));
  const pledged=quantities('Pledged BTC'),cold=quantities('Initial Cold Storage BTC'),buys=quantities('BTC Purchased During Loan'),totals=quantities('Total Pre-Tax Bitcoin');
  assert.equal(totals.length,2);assert.equal(pledged.length,2);
  for(const side of [0,1])assert.equal(totals[side],pledged[side]+cold[side]+buys[side]);
  assert.ok(quantity>=0&&value>quantity);
});
test("renders the complete state source register and model documentation",async()=>{
  const response=await request("/methodology");assert.equal(response.status,200);const html=(await response.text()).replace(/<!--.*?-->/g,'');
  for(const text of ["State Source Register","District of Columbia","Washington","West Virginia","Reset &amp; Refresh","No loss-related tax benefit","id=\"ltv-pricing\"","not measured historical average mortgage spreads","3.25","+0.04 Percentage Points (","-0.04 Percentage Points (","-0.08 Percentage Points ("]) assert.ok(html.includes(text),text);
});
test("market endpoints bypass caches and return source-specific results",async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/prices/')) return Response.json({data:{amount:'70000',currency:'USD',base:'BTC'}});
    if(String(url).includes('freddiemac')) return new Response('U.S. weekly mortgage rate averages as of 09/03/2026 30-year Fixed-Rate Mortgage 6.71% 15-year Fixed-Rate Mortgage 6.04%');
    return new Response('Basic Monthly price $4.99 • $49.99/year');
  };
  try {
    const price=await request('/api/market-data?source=bitcoin');assert.equal(price.status,200);assert.match(price.headers.get('cache-control'),/no-store/);assert.equal((await price.json()).data.price,70000);
    const rates=await request('/api/market-data?source=mortgage');const data=await rates.json();assert.equal(data.data[15].rate,6.04);assert.equal(data.data[30].rate,6.71);
    const count=calls.length;const taxes=await request('/api/market-data?source=taxes');assert.equal((await taxes.json()).data.rules.length,51);assert.equal(calls.length,count);
    for(const call of calls){assert.equal(call.options.cache,'no-store');assert.ok(call.options.signal);}
    globalThis.fetch=async()=>new Response('Unavailable',{status:503});
    const failed=await request('/api/market-data?source=mortgage');assert.equal(failed.status,502);const failure=await failed.json();assert.equal(failure.status,'unavailable');assert.equal(failure.data,undefined);
    globalThis.fetch=async()=>Response.json({data:{amount:'70000',currency:'EUR',base:'BTC'}});
    assert.equal((await request('/api/market-data?source=bitcoin')).status,502);
  } finally {globalThis.fetch=original;}
});
