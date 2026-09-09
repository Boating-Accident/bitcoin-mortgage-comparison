import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const temp=await mkdtemp(join(tmpdir(),'mortgage-model-'));
after(()=>rm(temp,{recursive:true,force:true}));
for(const name of ['state-taxes','mortgage-pricing','mortgage-model','market-data','presentation']) {
  const source=(await readFile(new URL(`../lib/${name}.ts`,import.meta.url),'utf8')).replace(/from "\.\/(state-taxes|mortgage-pricing)"/g,'from "./$1.mjs"');
  await writeFile(join(temp,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const {calculate,defaults,payment,balanceAfter,promotionalCredits,taxOnGain,validateInputs,roundBitcoinQuantityUp,incomeForTargetDti,bitcoinPriceAtMonth,bitcoinPurchasePricePath,defaultMonthlyPropertyCosts,federalMarginalRate,interestDeductionAssumption,FEDERAL_BRACKET_YEAR,fundingPlan,minimumAvailableCash,availableCashBounds,availableCashError,traditionalRateAssumption}=await import(pathToFileURL(join(temp,'mortgage-model.mjs')));
const {stateTaxRules,stateDefaults,estimateStateTax}=await import(pathToFileURL(join(temp,'state-taxes.mjs')));
const {formatDollarDraft,dollarNumber,chartYearTicks,chartMonthAtPosition,bitcoinPosition}=await import(pathToFileURL(join(temp,'presentation.mjs')));
const {RequestGate,parsePmms}=await import(pathToFileURL(join(temp,'market-data.mjs')));
const close=(a,b,tolerance=.001)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} ≠ ${b}`);
// Fixed financial fixtures stay independent of user-facing default changes.
const fixture={...defaults,downPct:20,homePrice:500000,btcQuantity:250000/defaults.btcPrice,btcCostBasis:37500,location:'',stateRate:0,btcSaleFee:0,fundTaxFromBtc:false,grossMonthlyIncome:0,btcVolatility:0};
const result=(overrides={})=>{const a=calculate({...fixture,...overrides});assert.ok(a.result,a.errors.join('; '));return a.result;};

test('automated Bitcoin quantities round upward to whole satoshis',()=>{
  for(const [input,expected] of [[0,0],[1e-9,1e-8],[1e-8,1e-8],[1.234567891,1.2345679],[1.00000001,1.00000001],[.00000007,.00000007],[21000000,21000000]]) assert.equal(roundBitcoinQuantityUp(input),expected);
  for(const price of [77368,90000,123456.78]) {
    const quantity=roundBitcoinQuantityUp(250000/price);
    assert.ok(quantity*price>=250000);
    assert.ok(quantity*price-250000<price/1e8);
    assert.equal(Number(quantity.toFixed(8)),quantity);
    assert.equal(roundBitcoinQuantityUp(quantity),quantity);
  }
});

test('requested defaults and 51 unique jurisdictions',()=>{
  assert.equal(defaults.federalRate,23.8);assert.equal(defaults.countyRate,0);assert.equal(defaults.btcCostBasis,60000);
  close(defaults.btcQuantity*defaults.btcPrice,400000);assert.equal(defaults.rugProbability,1);
  assert.equal(stateTaxRules.length,51);assert.equal(new Set(stateTaxRules.map(x=>x.name)).size,51);
  assert.equal(stateTaxRules.filter(x=>x.name==='District of Columbia').length,1);
  for(const x of stateTaxRules) {assert.ok(Number.isFinite(x.rate)&&x.rate>=0);assert.ok(x.source.startsWith('https://'));}
});
test('amortization agrees with independent monthly accumulation at both terms and zero interest',()=>{
  for(const years of [15,30]) for(const rate of [0,6.71,8.21]) for(const horizon of [0,5,10,years,40]) {
    const principal=400000,monthly=payment(principal,rate,years);let balance=principal,interest=0,paid=0;
    for(let month=0;month<Math.min(horizon,years)*12;month++){const interestDue=balance*rate/1200;const due=Math.min(monthly,balance+interestDue);interest+=interestDue;paid+=due;balance=Math.max(0,balance+interestDue-due);}
    close(balanceAfter(principal,rate,years,horizon*12),balance,.01);close(paid-(principal-balance),interest,.01);
  }
});
test('credit symmetry, no membership expense, and separate loan caps',()=>{
  const r=result();close(r.tradCredit,4000);close(r.cryptoCredit,5000);assert.equal('tradMembership' in r,false);assert.equal('membershipMonthly' in defaults,false);
  close(r.cryptoNetCredit-r.tradNetCredit,1000);
  const off=result({coinbaseOne:false});close(off.tradCredit,0);close(off.cryptoCredit,0);
  const other=result({traditionalPromo:false,traditionalOtherCredit:2000});close(other.tradCredit,2000);
  assert.deepEqual(promotionalCredits(400000,100000,10000,250,1,10000),{first:4000,second:250,total:4250});
  close(promotionalCredits(2000000,1000000,50000,50000,1,10000).total,10000);
});
test('separate cash, BTC proceeds and tax reserves reconcile',()=>{
  const r=result();close(r.btcSold,100000);close(r.saleBasis,15000);close(r.saleTax,85000*.238);
  close(r.tradAdditionalCash,6000);close(r.tradUpfront,r.tradAdditionalCash+r.saleTax);close(r.cryptoUpfront,7500);
});
test('a fully paid traditional home still leaves the fixed Bitcoin mortgage structure',()=>{
  const r=result({downPct:100,btcQuantity:20,fundTaxFromBtc:true,coinbaseOne:false});
  close(r.firstPrincipal,0);close(r.tradSchedule.firstMonthly,0);close(r.tradSchedule.interest,0);close(r.tradSchedule.pmi,0);
  close(r.cryptoFirstPrincipal,400000);close(r.financedDown,100000);close(r.pledged,250000);
});
test('monthly payment savings buy BTC at linear within-year prices and add purchase basis',()=>{
  const i={...fixture,horizonYears:2,btcPrice:100000,btcGrowth:12,pmiRate:0},r=result(i);
  const difference=r.monthlyDifference;
  let expected=0;
  for(let m=1;m<=24;m++) {
    const year=Math.floor((m-1)/12),within=(m-1)%12+1;
    const price=100000*1.12**year*(1+.12*within/12);
    expected+=difference/price;
  }
  close(r.tradPurchasedBtc,expected+r.tradUpfrontBtcBudget/i.btcPrice,1e-10);close(r.cryptoPurchasedBtc,r.cryptoUpfrontBtcBudget/i.btcPrice);
  close(r.tradPurchaseBasis,difference*24+r.tradUpfrontBtcBudget,.01);close(r.cryptoPurchaseBasis,r.cryptoUpfrontBtcBudget);
  close(r.terminalBtcPrice,125440,.01);
  close(r.tradAfterTaxBtcQuantity*r.terminalBtcPrice,r.tradBtcAfterTax,.01);
  close(r.cryptoAfterTaxBtcQuantity*r.terminalBtcPrice,r.cryptoBtcExpected,.01);
  close(r.tradWealth,r.tradEquity+r.tradBtcAfterTax,.01);
});
test('cheaper Bitcoin loan buys BTC and purchased holdings survive complete custody loss',()=>{
  const r=result({cryptoRate:1,baseMortgageRate:10,rugProbability:100,btcQuantity:2.5,btcPrice:100000});
  close(r.tradPurchasedBtc,r.tradUpfrontBtcBudget/100000);assert.ok(r.cryptoPurchasedBtc>0);
  const proceeds=r.cryptoPurchasedBtc*r.terminalBtcPrice;
  const tax=taxOnGain(Math.max(0,proceeds-r.cryptoPurchaseBasis),fixture,true);
  close(r.cryptoBtcExpected,proceeds-tax,.01);
});
test('purchases stop after payoff and price paths support zero or negative annual returns',()=>{
  const r=result({earlyPayoffYear:5,horizonYears:10});
  close(r.tradPurchaseBasis,r.monthlyDifference*60+r.tradUpfrontBtcBudget+Math.max(0,r.cryptoSchedule.payoff-r.tradSchedule.payoff),.01);
  for(const growth of [-99,-10,0,15]) {
    close(bitcoinPriceAtMonth(100000,growth,12),100000*(1+growth/100),1e-7);
    close(bitcoinPriceAtMonth(100000,growth,6),100000*(1+growth/200),1e-7);
  }
  const flat=result({btcGrowth:0});close(flat.tradPurchasedBtc,flat.tradPurchaseBasis/fixture.btcPrice,1e-8);
});
test('price changes revalue fixed BTC quantity without changing cost basis',()=>{
  const a=result(),b=result({btcPrice:defaults.btcPrice*2});close(b.btcValue,a.btcValue*2);assert.notEqual(a.advantage,b.advantage);
  close(b.saleBasis,a.saleBasis/2);
});
test('custody loss is a direct two-state expectation with no deduction even after a crash',()=>{
  const exactPledge={btcPrice:100000,btcQuantity:2.5};
  const none=result({...exactPledge,rugProbability:0}),full=result({...exactPledge,rugProbability:100}),p=result({...exactPledge,rugProbability:1});
  close(full.cryptoBtcExpected,full.cryptoBtcFailure);close(full.cryptoSchedule.balance,none.cryptoSchedule.balance);
  close(p.cryptoWealth,.99*none.cryptoWealth+.01*full.cryptoWealth,.01);
  const crash=result({...exactPledge,btcGrowth:-99,horizonYears:1,rugProbability:100});close(crash.cryptoBtcExpected,crash.cryptoPurchasedBtc*crash.terminalBtcPrice,.01);
  const unpledged=result({btcQuantity:defaults.btcQuantity*2,rugProbability:100});assert.ok(unpledged.cryptoBtcExpected>0);
});
test('losses do not create a modeled tax credit; county rate and future override work',()=>{
  const r=result({btcCostBasis:400000});close(r.saleTax,0);
  close(taxOnGain(-10000,defaults),0);
  close(taxOnGain(100000,{...fixture,countyRate:2}),25800);
  close(taxOnGain(100000,{...defaults,exitTaxOverride:true,exitFederalRate:15,exitStateRate:4,exitCountyRate:1},true),20000);
});
test('grossed-up BTC sale covers down payment, fees, and taxes, with correctly depleted basis',()=>{
  const r=result({fundTaxFromBtc:true,btcSaleFee:1});
  close(r.btcSold-r.saleFees-r.saleTax,r.financedDown,.01);close(r.tradOutsideTax,0);close(r.tradUpfront,r.tradAdditionalCash);
  assert.ok(r.btcSold>100000);close(r.saleBasis,r.btcSold*37500/250000);
});
test('selected lots use actual allocated basis',()=>{const r=result({customSaleBasis:true,saleBasis:30000});close(r.saleBasis,30000);close(r.saleTax,70000*.238);});
test('infeasible holdings and invalid inputs cannot produce a preferred scenario',()=>{
  assert.equal(result({btcQuantity:.1}).feasible,false);
  assert.ok(validateInputs({...defaults,downPct:150}).length);assert.ok(calculate({...defaults,advanceRate:0}).errors.length);
  assert.equal(calculate({...defaults,btcPrice:NaN}).result,null);
});
test('2026 rate corrections and percentage exclusions',()=>{
  for(const [location,rate] of [['Arkansas',1.85],['South Carolina',2.9176],['Utah',4.45],['West Virginia',4.58],['Georgia',4.99],['Missouri',0],['Montana',4.1],['Indiana',2.95],['North Carolina',3.99],['Wisconsin',5.355]]) close(stateDefaults(location).stateRate,rate);
  close(stateDefaults('Arizona',false).stateRate,2.5);close(stateDefaults('Arizona',true).stateRate,1.875);
});
test('annual state allowances and surtaxes apply only to the incremental gain',()=>{
  const ctx=(location,extra={})=>({...defaults,...stateDefaults(location),location,...extra});
  close(estimateStateTax(100000,ctx('Washington')),0);
  close(estimateStateTax(200000,ctx('Washington',{otherCapitalGains:278000})),14000);
  close(estimateStateTax(1278000,ctx('Washington')),70000);
  close(estimateStateTax(1378000,ctx('Washington')),79900);
  close(estimateStateTax(10000,ctx('New Mexico')),442.5);
  close(estimateStateTax(10000,ctx('Vermont')),437.5);
  close(estimateStateTax(200000,ctx('Minnesota',{otherInvestmentIncome:900000})),20700);
  close(estimateStateTax(200000,ctx('Maine',{otherIncome:900000})),16300);
  close(estimateStateTax(100000,ctx('Maryland',{otherIncome:300000})),8500);
  close(estimateStateTax(200000,ctx('California',{otherIncome:900000})),25600);
  close(estimateStateTax(10000,ctx('Massachusetts',{otherIncome:1107750})),900);
  close(estimateStateTax(20000000,ctx('Arkansas')),185000);
  close(estimateStateTax(10000,ctx('New Mexico',{stateRules:false})),590);
});
test('PMI terminates after scheduled 78% LTV and optional deduction reduces cash outflows',()=>{
  const r=result({downPct:10,cryptoRate:defaults.baseMortgageRate});assert.ok(r.tradSchedule.rows[0].pmi>0);assert.equal(r.tradSchedule.rows.at(-1).pmi,0);
  const deduction=result({interestDeduction:true,acquisitionDebtLimit:100000});assert.ok(deduction.tradSchedule.deduction>0);assert.ok(deduction.tradSchedule.deduction<deduction.tradSchedule.interest*.37);
});
test('payoff and terminal sale/refinance account for balances and costs',()=>{
  const early=result({earlyPayoffYear:5});close(early.tradSchedule.balance,0);close(early.cryptoSchedule.balance,0);assert.ok(early.tradSchedule.payoff>0);close(early.tradSchedule.rows[60].payment,0);
  const held=result(),sold=result({exitAction:'sell'}),refi=result({exitAction:'refinance'}),payoff=result({exitAction:'payoff'});
  close(held.tradWealth-sold.tradWealth,sold.homeSaleCosts+sold.homeSaleTax,.01);
  close(held.tradWealth-refi.tradWealth,held.tradSchedule.balance*.02,.01);close(held.tradWealth,payoff.tradWealth);
});
test('newer requests and manual edits reject stale responses',()=>{
  const gate=new RequestGate(),old=gate.begin('mortgage',['baseMortgageRate']),latest=gate.begin('mortgage',['baseMortgageRate']);
  assert.equal(gate.accepts(old,'baseMortgageRate'),false);assert.equal(gate.accepts(latest,'baseMortgageRate'),true);
  gate.edit('baseMortgageRate');assert.equal(gate.accepts(latest,'baseMortgageRate'),false);
  const btc=gate.begin('bitcoin',['btcPrice','btcQuantity']);gate.edit('btcPrice');assert.equal(gate.accepts(btc,'btcPrice'),false);assert.equal(gate.accepts(btc,'btcQuantity'),true);
  gate.invalidate('bitcoin');assert.equal(gate.current(btc),false);
});
test('PMMS parser returns both terms and rejects missing observations',()=>{
  const markup='<p>U.S. weekly mortgage rate averages as of 09/03/2026</p><b>30-year Fixed-Rate Mortgage</b> 6.71% <b>15-year Fixed-Rate Mortgage</b> 6.04%';
  const rates=parsePmms(markup);assert.equal(rates[15].rate,6.04);assert.equal(rates[30].rate,6.71);
  assert.throws(()=>parsePmms('Freddie Mac unavailable'));
});

 test('income default targets the closest 45 percent Bitcoin DTI at cent precision',()=>{
  assert.equal(defaults.homePrice,750000);assert.equal(defaults.location,'');assert.equal(defaults.stateRate,0);
  for(const cryptoRate of [0,6,8.21,10]) {
    const i={...defaults,cryptoRate};const income=incomeForTargetDti(i);
    assert.equal(Number(income.toFixed(2)),income);
    const debt=payment(i.homePrice,cryptoRate,i.termYears)+i.monthlyPropertyCosts;
    const error=Math.abs(debt/income-.45);
    for(const neighbor of [income-.01,income+.01]) assert.ok(error<=Math.abs(debt/neighbor-.45));
  }
 });

test('volatility bridge preserves endpoints, baseline at zero, and seed determinism',()=>{
  for(const years of [1,10,30]) for(const growth of [-50,0,15]) {
    const zero=bitcoinPurchasePricePath(70000,growth,years,0,42);
    const path=bitcoinPurchasePricePath(70000,growth,years,50,42);
    assert.deepEqual(zero.prices,zero.baseline);
    assert.equal(path.prices[0],70000);assert.equal(path.prices.at(-1),zero.prices.at(-1));
    assert.ok(path.prices.every(p=>Number.isFinite(p)&&p>0));
    assert.deepEqual(path,bitcoinPurchasePricePath(70000,growth,years,50,42));
    assert.notDeepEqual(path.prices,bitcoinPurchasePricePath(70000,growth,years,50,43).prices);
  }
});
test('volatility changes purchase quantity only, with cost basis and final price held fixed',()=>{
  const plain=result({btcVolatility:0}),volatile=result({btcVolatility:50});
  assert.notEqual(plain.tradPurchasedBtc,volatile.tradPurchasedBtc);
  for(const key of ['terminalBtcPrice','tradPurchaseBasis','cryptoPurchaseBasis','pledged','btcSold','saleBasis','saleTax']) close(plain[key],volatile[key],1e-7);
  close(plain.cryptoBtcExpected,volatile.cryptoBtcExpected,.01);
  close(plain.cryptoPurchasedBtc,plain.cryptoUpfrontBtcBudget/fixture.btcPrice);close(volatile.cryptoPurchasedBtc,plain.cryptoPurchasedBtc);
  assert.equal(defaults.homeGrowth,3);assert.equal(defaults.btcVolatility,15);
});

test('higher-payment option invests lower closing costs once, with full purchase basis',()=>{
  const i={...defaults,fundTaxFromBtc:true,traditionalClosing:20000,cryptoFirstClosing:5000,cryptoSecondClosing:1000,btcVolatility:50};
  const r=result(i);
  assert.ok(r.monthlyDifference>0);assert.ok(r.cryptoUpfrontBtcBudget>0);
  close(r.cryptoPurchasedBtc,r.cryptoUpfrontBtcBudget/i.btcPrice,1e-10);
  close(r.cryptoPurchaseBasis,r.cryptoUpfrontBtcBudget,.01);
  close(r.tradPurchaseBasis,r.tradUpfrontBtcBudget+r.tradSchedule.rows.reduce((total,row,index)=>total+r.cryptoSchedule.rows[index].outflow-row.outflow,0),.01);
  assert.equal('cashReturn' in defaults,false);assert.equal('tradSavings' in r,false);
  close(r.cryptoWealth,r.cryptoEquity+r.cryptoBtcExpected,.01);
});
test('DTI is informational and defaults include monthly property costs',()=>{
  assert.equal(defaults.monthlyPropertyCosts,630);assert.equal(defaultMonthlyPropertyCosts(1000000),840);
  assert.equal(defaultMonthlyPropertyCosts(750001),630);assert.equal('dtiLimit' in defaults,false);
  const r=result(defaults);assert.equal(r.cryptoDti,45);
  const high=calculate({...defaults,grossMonthlyIncome:1000});
  assert.ok(high.result.cryptoDti>100);assert.equal(high.result.eligibilityUnconfirmed,false);
  assert.ok(!high.warnings.some(x=>x.includes('DTI')));
});
test('dollar inputs preserve editable decimals and comma grouping',()=>{
  assert.equal(dollarNumber.format(1234567.8),'1,234,567.80');
  for(const [input,text,value] of [['1000','1,000',1000],['1234567.80','1,234,567.80',1234567.8],['$750,000.00','750,000.00',750000],['1000.','1,000.',1000],['.5','.5',.5],['-1000.25','-1,000.25',-1000.25]]) assert.deepEqual(formatDollarDraft(input),{text,value});
  assert.equal(formatDollarDraft('12.345'),null);assert.equal(formatDollarDraft('abc'),null);assert.ok(Number.isNaN(formatDollarDraft('').value));
});
test('chart ticks include every two years and hover selects nearest bounded month',()=>{
  assert.deepEqual(chartYearTicks(10),[0,2,4,6,8,10]);assert.deepEqual(chartYearTicks(5),[0,2,4,5]);assert.deepEqual(chartYearTicks(1),[0,1]);
  assert.equal(chartMonthAtPosition(50,0,100,120),60);assert.equal(chartMonthAtPosition(-1,0,100,120),0);assert.equal(chartMonthAtPosition(101,0,100,120),120);
});

test('2026 federal marginal brackets respect every filing-status boundary',()=>{
  assert.equal(FEDERAL_BRACKET_YEAR,2026);
  // IRS Rev. Proc. 2025-32 §4.01, tables 1–4; exact cutoffs stay in the lower bracket.
  const thresholds={
    single:[12400,50400,105700,201775,256225,640600],
    joint:[24800,100800,211400,403550,512450,768700],
    head:[17700,67450,105700,201750,256200,640600],
    separate:[12400,50400,105700,201775,256225,384350],
  };
  const rates=[10,12,22,24,32,35,37];
  for(const [status,bounds] of Object.entries(thresholds)) {
    assert.equal(federalMarginalRate(0,status),10);
    bounds.forEach((bound,index)=>{
      assert.equal(federalMarginalRate(bound-.01,status),rates[index]);
      assert.equal(federalMarginalRate(bound,status),rates[index]);
      assert.equal(federalMarginalRate(bound+.01,status),rates[index+1]);
    });
  }
  assert.ok(Number.isNaN(federalMarginalRate(NaN,'single')));
});
test('interest-deduction rate follows annualized income, other income, and filing status',()=>{
  const base={...defaults,grossMonthlyIncome:10000,otherIncome:0,filingStatus:'single'};
  assert.deepEqual(interestDeductionAssumption(base),{annualIncome:120000,rate:24});
  assert.deepEqual(interestDeductionAssumption({...base,filingStatus:'joint'}),{annualIncome:120000,rate:22});
  assert.deepEqual(interestDeductionAssumption({...base,otherIncome:100000}),{annualIncome:220000,rate:32});
  assert.deepEqual(interestDeductionAssumption({...base,grossMonthlyIncome:4000}),{annualIncome:48000,rate:12});
  assert.deepEqual(interestDeductionAssumption({...base,grossMonthlyIncome:12345.67,otherIncome:890.12}),{annualIncome:149038.16,rate:24});
  assert.equal(interestDeductionAssumption({...base,grossMonthlyIncome:0,otherIncome:50400}).rate,12);
  assert.equal(interestDeductionAssumption({...base,grossMonthlyIncome:0,otherIncome:50400.01}).rate,22);
});
test('both mortgage schedules apply the derived deduction rate only when enabled',()=>{
  for(const [filingStatus,otherIncome,rate] of [['single',0,24],['joint',0,22],['single',100000,32],['head',300000,35],['separate',300000,37]]) {
    const inputs={grossMonthlyIncome:10000,otherIncome,filingStatus,acquisitionDebtLimit:1000000};
    const off=result({...inputs,interestDeduction:false}),on=result({...inputs,interestDeduction:true});
    for(const key of ['tradSchedule','cryptoSchedule']) {
      close(off[key].deduction,0);
      close(on[key].deduction,on[key].interest*rate/100,.00001);
      on[key].rows.forEach((row,index)=>close(row.outflow,off[key].rows[index].outflow-row.interest*rate/100,.00001));
      close(on[key].balance,off[key].balance);
    }
    assert.ok(on.cryptoPurchasedBtc>off.cryptoPurchasedBtc);
    close(on.cryptoPurchaseBasis-off.cryptoPurchaseBasis,on.cryptoSchedule.deduction-on.tradSchedule.deduction,.00001);
  }
  const capped=result({grossMonthlyIncome:10000,interestDeduction:true,acquisitionDebtLimit:100000});
  close(capped.tradSchedule.rows[0].deduction,capped.tradSchedule.rows[0].interest*.24*100000/capped.firstPrincipal);
  close(capped.cryptoSchedule.rows[0].deduction,capped.cryptoSchedule.rows[0].interest*.24*100000/capped.cryptoPrincipal);
});
test('total monthly payments include principal, interest, property costs and PMI once',()=>{
  for(const termYears of [15,30]) for(const monthlyPropertyCosts of [0,630,1234.56]) {
    const r=result({termYears,monthlyPropertyCosts,downPct:10});
    close(r.tradTotalMonthlyPayment,r.tradSchedule.firstMonthly+monthlyPropertyCosts+r.tradSchedule.rows[0].pmi);
    close(r.cryptoTotalMonthlyPayment,r.cryptoSchedule.firstMonthly+monthlyPropertyCosts);
    assert.ok(r.tradSchedule.rows[0].pmi>0);
    close(r.cryptoSchedule.rows[0].pmi,0);
  }
});


test('available cash defaults dynamically to the higher required upfront cost',()=>{
  assert.equal(defaults.availableCash,null);assert.equal(defaults.extraCashUse,'bitcoin');
  for(const changes of [{},{coinbaseOne:false},{traditionalClosing:30000},{fundTaxFromBtc:false},{fundTaxFromBtc:false,btcPrice:100000}]) {
    const i={...defaults,...changes},r=calculate(i).result;
    assert.ok(r);assert.equal(r.sharedStartingCash,minimumAvailableCash(i));
    assert.ok(r.sharedStartingCash>=Math.max(r.tradUpfront,r.cryptoUpfront));
    assert.ok(r.sharedStartingCash-Math.max(r.tradUpfront,r.cryptoUpfront)<.010001);
  }
  assert.equal(minimumAvailableCash(defaults),5000);
  assert.equal(minimumAvailableCash({...defaults,cryptoSecondClosing:2500.01}),5000.01);
  assert.equal(minimumAvailableCash({...defaults,coinbaseOne:false}),12500);
});
test('available cash bounds are inclusive and invalid values cannot enter the model',()=>{
  const {minimumCash:min,maximumCash:max}=availableCashBounds(defaults);
  for(const value of [min,min+.01,100000,max-.01,max]) {
    assert.equal(availableCashError(value,min,max),'');
    assert.ok(calculate({...defaults,availableCash:value}).result);
  }
  for(const [value,message] of [[min-.01,'Available Cash cannot be below Total Up Front Cost'],[max+.01,'Available Cash cannot be above Total Up Front Cost plus 20% of Home Price']]) {
    assert.equal(availableCashError(value,min,max),message);
    const r=calculate({...defaults,availableCash:value});assert.equal(r.result,null);assert.ok(r.errors.includes(message));
  }
});
test('one-time BTC purchases use each option’s remaining available cash without changing loans',()=>{
  const i={...defaults,availableCash:100000},r=calculate(i).result,base=calculate(defaults).result;
  assert.ok(r);close(r.firstPrincipal,base.firstPrincipal);close(r.cryptoPrincipal,base.cryptoPrincipal);
  for(const side of ['trad','crypto']) {
    close(r[side+'UpfrontBtcBudget'],100000-r[side+'Upfront']);
    close(r[side+'PurchasedBtc']-base[side+'PurchasedBtc'],95000/i.btcPrice,1e-8);
    close(r[side+'PurchaseBasis']-base[side+'PurchaseBasis'],95000,.01);
    close(r[side+'CashDown'],0);
  }
});
test('extra down payments reduce borrowing and eliminate upfront BTC buys',()=>{
  const i={...defaults,downPct:20,coinbaseOne:false,availableCash:100000,extraCashUse:'down-payment'};
  const r=calculate(i).result,base=calculate({...i,extraCashUse:'bitcoin'}).result;
  close(r.tradCashDown,90000);close(r.cryptoCashDown,87500);
  close(r.firstPrincipal,510000);close(r.cryptoFirstPrincipal,600000);close(r.financedDown,62500);
  close(r.tradUpfront,100000,.01);close(r.cryptoUpfront,100000,.01);
  close(r.tradUpfrontBtcBudget,0);close(r.cryptoUpfrontBtcBudget,0);
  close(r.btcSold,base.btcSold);close(r.pledged,r.financedDown/.4);assert.ok(r.pledged<base.pledged);
  assert.ok(r.tradSchedule.firstMonthly<base.tradSchedule.firstMonthly);assert.ok(r.cryptoSchedule.firstMonthly<base.cryptoSchedule.firstMonthly);
  close(r.cryptoPurchasedBtc,0);close(r.tradPurchaseBasis,r.monthlyDifference*i.horizonYears*12,.01);
});
test('extra down payments reprice points and lender credits within the same cash budget',()=>{
  const i={...defaults,availableCash:100000,extraCashUse:'down-payment',traditionalPoints:1,cryptoFirstPoints:1.5,cryptoSecondPoints:.5};
  const r=calculate(i).result;
  close(r.tradClosing,i.traditionalClosing+r.firstPrincipal*.01);
  close(r.cryptoFirstClosing,i.cryptoFirstClosing+r.cryptoFirstPrincipal*.015);
  close(r.tradCredit,r.firstPrincipal*.01);close(r.cryptoCreditParts.first,r.cryptoFirstPrincipal*.01);
  close(r.tradUpfront,100000,.01);close(r.cryptoUpfront,100000,.01);
  close(r.firstPrincipal+r.tradBtcDownPayment+r.tradCashDown,i.homePrice,.01);
  close(r.cryptoPrincipal+r.cryptoCashDown,i.homePrice,.01);
  close(r.tradSchedule.firstMonthly,payment(r.firstPrincipal,r.traditionalPricing.rate,i.termYears));
  close(r.cryptoSchedule.firstMonthly,payment(r.cryptoPrincipal,i.cryptoRate,i.termYears));
  close(r.tradUpfrontBtcBudget,0);close(r.cryptoUpfrontBtcBudget,0);
});
test('extra down-payment mode accepts the full cash range without negative debt or unused cash',()=>{
  for(const changes of [{},{fundTaxFromBtc:false},{fundTaxFromBtc:false,...stateDefaults('Maryland'),location:'Maryland',otherIncome:200000},{traditionalPoints:2,cryptoFirstPoints:2,cryptoSecondPoints:1}]) {
    const i={...defaults,...changes,extraCashUse:'down-payment'};
    const {minimumCash:min,maximumCash:max}=availableCashBounds(i);
    for(const availableCash of [min,min+.01,Math.round((min+max)/2*100)/100,max-.01,max]) {
      const {result:r,errors}=calculate({...i,availableCash});assert.ok(r,errors.join('; '));assert.equal(r.feasible,true,errors.join('; '));
      assert.ok(r.firstPrincipal>=0&&r.cryptoFirstPrincipal>=0&&r.financedDown>=0);
      close(r.tradUpfront+r.tradUnspentCash,availableCash,.01);close(r.cryptoUpfront+r.cryptoUnspentCash,availableCash,.01);
      close(r.firstPrincipal+r.tradBtcDownPayment+r.tradCashDown,i.homePrice,.01);
      close(r.cryptoPrincipal+r.cryptoCashDown,i.homePrice,.01);
      close(r.tradUpfrontBtcBudget+r.cryptoUpfrontBtcBudget,0);
    }
  }
});
test('maximum cash repays only the Bitcoin second loan and preserves leftover cash in wealth',()=>{
  const {maximumCash}=availableCashBounds(defaults);
  const i={...defaults,availableCash:maximumCash,extraCashUse:'down-payment'};
  const r=calculate(i).result;
  close(maximumCash,155000);close(r.cryptoFirstPrincipal,600000);close(r.financedDown,0);close(r.pledged,0);
  close(r.cryptoCashDown,150000);close(r.cryptoUnspentCash,1000);close(r.cryptoUpfront,154000);
  close(r.cryptoUpfrontBtcBudget,0);close(r.cryptoWealth,r.cryptoEquity+r.cryptoBtcExpected+r.cryptoUnspentCash,.01);
  close(r.tradWealth,r.tradEquity+r.tradBtcAfterTax+r.tradUnspentCash,.01);
  const zeroAdvance=calculate({...i,advanceRate:0});assert.equal(zeroAdvance.errors.length,0);close(zeroAdvance.result.financedDown,0);close(zeroAdvance.result.cryptoFirstPrincipal,600000);
});

test('traditional down payment defaults to five percent and rejects values below five',()=>{
  assert.equal(defaults.downPct,5);
  for(const downPct of [0,4.99,-1,100.01]) assert.ok(validateInputs({...defaults,downPct}).some(e=>e.includes('Traditional Down Payment %')));
  for(const downPct of [5,10,20,100]) assert.ok(!validateInputs({...defaults,downPct}).some(e=>e.includes('Traditional Down Payment %')));
  const r=calculate(defaults).result;
  close(r.firstPrincipal,712500);close(r.tradBtcDownPayment,37500);
  close(r.cryptoFirstPrincipal,600000);close(r.financedDown,150000);close(r.pledged,375000);
  close(r.tradSchedule.rows[0].pmi,712500*.005/12);close(r.cryptoSchedule.pmi,0);
  close(r.monthlyDifference,r.cryptoSchedule.firstMonthly-r.tradSchedule.firstMonthly-r.tradSchedule.rows[0].pmi);
});
test('traditional down payment cannot change the Bitcoin mortgage split or pledge',()=>{
  for(const termYears of [15,30]) for(const downPct of [5,10,20,50,100]) {
    const i={...defaults,termYears,downPct,btcQuantity:20,availableCash:100000,pmiRate:10};
    const {result:r,errors}=calculate(i);assert.ok(r?.feasible,errors.join('; '));
    close(r.firstPrincipal,i.homePrice*(1-downPct/100));
    close(r.cryptoFirstPrincipal,i.homePrice*.8);close(r.financedDown,i.homePrice*.2);
    close(r.pledged,i.homePrice*.2/.4);
    assert.ok(r.cryptoSchedule.rows.every(row=>row.pmi===0));close(r.cryptoSchedule.pmi,0);
    close(r.cryptoSchedule.rows[0].outflow,payment(i.homePrice,i.cryptoRate,termYears));
  }
});
test('Bitcoin loans remain independent of traditional down payment when applying extra cash',()=>{
  const common={...defaults,btcQuantity:20,availableCash:100000,extraCashUse:'down-payment'};
  const original=calculate({...common,downPct:5}).result;
  for(const downPct of [10,20,50,100]) {
    const r=calculate({...common,downPct}).result;
    for(const key of ['cryptoFirstPrincipal','financedDown','cryptoPrincipal','pledged','cryptoCashDown','cryptoCredit']) close(r[key],original[key]);
    close(r.cryptoUpfront,100000,.01);close(r.cryptoFirstPrincipal,common.homePrice*.8);close(r.financedDown,common.homePrice*.2-r.cryptoCashDown);assert.ok(r.cryptoSchedule.rows.every(row=>row.pmi===0));
  }
});
test('PMI affects only Traditional while Bitcoin DTI and its income target exclude PMI',()=>{
  for(const extraCashUse of ['bitcoin','down-payment']) {
    const i={...defaults,availableCash:100000,extraCashUse};
    const noPmi=calculate({...i,pmiRate:0}).result,highPmi=calculate({...i,pmiRate:10}).result;
    assert.ok(highPmi.tradSchedule.pmi>0);close(noPmi.tradSchedule.pmi,0);
    assert.deepEqual(highPmi.cryptoSchedule,noPmi.cryptoSchedule);
    close(highPmi.cryptoDti,noPmi.cryptoDti);
    close(incomeForTargetDti({...i,pmiRate:0}),incomeForTargetDti({...i,pmiRate:10}));
    close(highPmi.monthlyDifference,noPmi.monthlyDifference-highPmi.tradSchedule.rows[0].pmi);
  }
});


test('available cash ceiling follows required upfront costs plus twenty percent of home price',()=>{
  for(const changes of [{},{homePrice:1000000},{coinbaseOne:false},{fundTaxFromBtc:false},{traditionalClosing:40000}]) {
    const i={...defaults,btcQuantity:20,...changes},bounds=availableCashBounds(i);
    close(bounds.maximumCash,bounds.minimumCash+i.homePrice*.2,.005);
    for(const extraCashUse of ['bitcoin','down-payment']) {
      const {result:r,errors}=calculate({...i,extraCashUse,availableCash:bounds.maximumCash});assert.ok(r?.feasible,errors.join('; '));
      assert.deepEqual(availableCashBounds({...i,availableCash:bounds.maximumCash,extraCashUse}),bounds);
      const rejected=calculate({...i,extraCashUse,availableCash:bounds.maximumCash+.01});assert.equal(rejected.result,null);assert.ok(rejected.errors.some(e=>e.includes('plus 20% of Home Price')));
    }
  }
});


test('PMI declines with the opening balance and stops at the cancellation threshold',()=>{
  for(const termYears of [15,30]) {
    const i={...defaults,termYears,horizonYears:30,btcVolatility:0};
    const r=calculate(i).result;
    let balance=r.firstPrincipal,previous=Infinity,positiveMonths=0;
    for(const row of r.tradSchedule.rows) {
      const expected=balance>i.homePrice*.78+.01?balance*i.pmiRate/1200:0;
      close(row.pmi,expected,1e-7);assert.ok(row.pmi<=previous);previous=row.pmi;
      if(row.pmi>0)positiveMonths++;
      balance=Math.max(0,balance+row.interest-row.payment);
    }
    assert.ok(positiveMonths>1&&positiveMonths<termYears*12);
    assert.ok(r.tradSchedule.rows[1].pmi<r.tradSchedule.rows[0].pmi);
    assert.equal(r.tradSchedule.rows.at(-1).pmi,0);
  }
});
test('monthly PMI dollars cannot also fund BTC purchases',()=>{
  for(const pmiRate of [.5,10]) {
    const i={...defaults,pmiRate,btcVolatility:0,horizonYears:30};
    const r=calculate(i).result;
    let tradQty=r.tradUpfrontBtcBudget/i.btcPrice,cryptoQty=r.cryptoUpfrontBtcBudget/i.btcPrice;
    let tradBasis=r.tradUpfrontBtcBudget,cryptoBasis=r.cryptoUpfrontBtcBudget,totalBudget=0;
    r.tradSchedule.rows.forEach((a,index)=>{
      const b=r.cryptoSchedule.rows[index];
      const tradDue=a.payment+a.pmi,cryptoDue=b.payment;
      const budget=Math.max(tradDue,cryptoDue);
      close(a.outflow,tradDue);close(b.outflow,cryptoDue);
      const tradBuy=budget-tradDue,cryptoBuy=budget-cryptoDue;
      close(tradBuy+tradDue,budget);close(cryptoBuy+cryptoDue,budget);
      const price=r.purchasePath.prices[index+1];
      tradQty+=tradBuy/price;cryptoQty+=cryptoBuy/price;
      tradBasis+=tradBuy;cryptoBasis+=cryptoBuy;totalBudget+=budget;
    });
    close(r.tradPurchasedBtc,tradQty,1e-8);close(r.cryptoPurchasedBtc,cryptoQty,1e-8);
    close(r.tradPurchaseBasis,tradBasis,.01);close(r.cryptoPurchaseBasis,cryptoBasis,.01);
    close(r.commonBudgetTotal,totalBudget,.01);
  }
});


test('cash invested in BTC never curtails scheduled mortgage balances',()=>{
  const i={...defaults,extraCashUse:'bitcoin',earlyPayoffYear:0};
  const original=calculate(i).result;
  const moreBtc=calculate({...i,availableCash:100000,btcGrowth:30,btcVolatility:50}).result;
  assert.notEqual(original.tradPurchasedBtc,moreBtc.tradPurchasedBtc);
  for(const side of ['trad','crypto']) {
    assert.deepEqual(moreBtc[side+'Schedule'],original[side+'Schedule']);
    const principal=side==='trad'?original.firstPrincipal:original.cryptoPrincipal;
    const rate=side==='trad'?original.traditionalPricing.rate:i.cryptoRate;
    close(original[side+'Schedule'].balance,balanceAfter(principal,rate,i.termYears,i.horizonYears*12),.01);
  }
  original.tradSchedule.rows.forEach((row,index)=>{
    const scheduled=balanceAfter(original.firstPrincipal,original.traditionalPricing.rate,i.termYears,index);
    close(row.pmi,scheduled>i.homePrice*.78+.01?scheduled*i.pmiRate/1200:0,1e-7);
  });
});


test('pre-tax Bitcoin totals reconcile pledged, cold-storage, and purchased satoshis',()=>{
  assert.deepEqual(bitcoinPosition(5,0,2,1.25),{pledged:2,coldStorage:3,purchased:1.25,total:6.25});
  assert.deepEqual(bitcoinPosition(5,1.000000001,0,.500000009),{pledged:0,coldStorage:3.99999999,purchased:.5,total:4.49999999});
  assert.deepEqual(bitcoinPosition(1,0,.000000001,.000000019),{pledged:.00000001,coldStorage:.99999999,purchased:.00000001,total:1.00000001});
  for(const extraCashUse of ['bitcoin','down-payment']) for(const rugProbability of [0,100]) {
    const i={...defaults,extraCashUse,rugProbability,availableCash:100000},r=calculate(i).result;
    for(const position of [bitcoinPosition(i.btcQuantity,r.btcSoldQuantity,0,r.tradPurchasedBtc),bitcoinPosition(i.btcQuantity,0,r.pledged/i.btcPrice,r.cryptoPurchasedBtc)]) {
      const sats=v=>BigInt(v.toFixed(8).replace('.',''));
      assert.equal(sats(position.total),sats(position.pledged)+sats(position.coldStorage)+sats(position.purchased));
      assert.ok(position.coldStorage>=0);
    }
  }
});

const {ltvRateAdjustment}=await import(pathToFileURL(join(temp,'mortgage-pricing.mjs')));

test('historical LTV calibration matches the sourced 740-score fee differences',()=>{
  // Fannie Mae: 80% = .875 points; 85% = 1; 90% = .75; 95% = .625.
  // Convert the difference at 3.25 price points per percentage point of rate.
  for(const [ltv,fee,bps] of [[80,0,0],[85,.125,4],[90,-.125,-4],[95,-.25,-8]]) {
    const a=ltvRateAdjustment(ltv,30,740);
    assert.equal(a.pricePoints,fee);assert.equal(a.basisPoints,bps);
    close(a.percentagePoints,bps/100,1e-12);
  }
});
test('OLTV bands cover fractional values and include the correct boundary',()=>{
  for(const [downPct,bps] of [[100,0],[25,0],[20,0],[19.9999,4],[19,4],[15,4],[14.9999,-4],[14,-4],[10,-4],[9.9999,-8],[9,-8],[5,-8]]) {
    const r=calculate({...defaults,downPct}).result;
    assert.equal(r.traditionalPricing.basisPoints,bps,`Down payment ${downPct}`);
    close(r.traditionalPricing.rate,6.71+bps/100,1e-10);
    close(r.traditionalPricing.oltv,100-downPct,1e-10);
  }
});
test('same-score LTV differences use each sourced credit-score row',()=>{
  for(const [score,expected] of [[780,[0,-4,-4]],[760,[0,-4,-4]],[740,[4,-4,-8]],[720,[0,-8,-12]],[700,[4,-4,-8]],[680,[4,-8,-12]],[660,[8,-4,-8]],[640,[8,-8,-12]],[639,[4,-4,-15]]]) {
    assert.deepEqual([85,90,95].map(ltv=>ltvRateAdjustment(ltv,30,score).basisPoints),expected);
  }
  for(const [a,b] of [[740,759],[760,779],[780,850],[300,639]]) {
    assert.deepEqual(ltvRateAdjustment(95,30,a),ltvRateAdjustment(95,30,b));
  }
});
test('15-year pricing uses its PMMS benchmark with no inapplicable LLPA spread',()=>{
  for(const downPct of [5,10,15,20,50]) {
    const r=calculate({...defaults,downPct,termYears:15,baseMortgageRate:6.04,cryptoRate:7.54}).result;
    assert.equal(r.traditionalPricing.rate,6.04);assert.equal(r.traditionalPricing.basisPoints,0);
    close(r.tradSchedule.firstMonthly,payment(r.firstPrincipal,6.04,15));
    close(r.cryptoSchedule.firstMonthly,payment(750000,7.54,15));
  }
});
test('extra down payment selects the actual original LTV and monthly amortization never reprices it',()=>{
  const i={...defaults,coinbaseOne:false,traditionalClosing:0,cryptoFirstClosing:0,cryptoSecondClosing:0,extraCashUse:'down-payment',horizonYears:30};
  for(const [availableCash,ltv,rate] of [[0,95,6.63],[37500,90,6.67],[75000,85,6.75],[112500,80,6.71]]) {
    const r=calculate({...i,availableCash}).result;
    close(r.traditionalPricing.oltv,ltv);close(r.traditionalPricing.rate,rate);
    // Same fixed coupon through payoff, including crossing every LTV band.
    let balance=r.firstPrincipal;
    for(const row of r.tradSchedule.rows) {
      close(row.interest,balance*rate/1200,1e-6);
      balance=Math.max(0,balance+row.interest-row.payment);
    }
    close(balance,0,.01);
  }
});
test('LTV-adjusted rate flows through payment, PMI, DTI, deductions and BTC cash budget once',()=>{
  const i={...defaults,interestDeduction:true,horizonYears:10};
  const r=calculate(i).result;
  const quoted=calculate({...i,traditionalRateOverride:6.63}).result;
  assert.deepEqual(r.tradSchedule,quoted.tradSchedule);
  close(r.tradTotalMonthlyPayment,payment(712500,6.63,30)+712500*.005/12+630);
  close(r.tradDti,Number((r.tradTotalMonthlyPayment/i.grossMonthlyIncome*100).toFixed(3)),1e-10);
  close(r.tradPurchasedBtc,quoted.tradPurchasedBtc,1e-10);
  close(r.tradWealth,quoted.tradWealth,1e-6);
  // The LLPA is reflected in the rate, never added a second time as points.
  close(r.tradClosing,i.traditionalClosing);
  const unadjusted=calculate({...i,traditionalRateOverride:6.71}).result;
  assert.ok(r.tradSchedule.firstMonthly<unadjusted.tradSchedule.firstMonthly);
  assert.ok(r.tradPurchasedBtc>unadjusted.tradPurchasedBtc);
  assert.deepEqual(r.cryptoSchedule,unadjusted.cryptoSchedule);
});
test('LTV and traditional quote overrides never change Bitcoin rate, split, pledge, PMI or DTI',()=>{
  const original=calculate(defaults).result;
  for(const changes of [{downPct:10},{downPct:15},{downPct:20},{creditScore:780},{traditionalRateOverride:9}]) {
    const r=calculate({...defaults,...changes}).result;
    assert.deepEqual(r.cryptoSchedule,original.cryptoSchedule);
    close(r.cryptoFirstPrincipal,600000);close(r.financedDown,150000);close(r.pledged,375000);
    assert.equal(r.cryptoSchedule.pmi,0);assert.equal(r.cryptoDti,original.cryptoDti);
  }
});
test('final traditional quotes bypass the spread and automatic pricing can be restored',()=>{
  for(const downPct of [5,10,15,20]) {
    const r=calculate({...defaults,downPct,traditionalRateOverride:6.25}).result;
    assert.equal(r.traditionalPricing.rate,6.25);assert.equal(r.traditionalPricing.overridden,true);
    close(r.tradSchedule.firstMonthly,payment(r.firstPrincipal,6.25,30));
  }
  assert.equal(traditionalRateAssumption({...defaults,traditionalRateOverride:null}).rate,6.63);
  for(const traditionalRateOverride of [NaN,Infinity,-1,51]) assert.ok(validateInputs({...defaults,traditionalRateOverride}).length);
  for(const value of [NaN,Infinity,-1,96]) assert.ok(Number.isNaN(ltvRateAdjustment(value,30,740).basisPoints));
  assert.equal(traditionalRateAssumption({...defaults,baseMortgageRate:0}).rate,0);
});
