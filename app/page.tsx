"use client";
import { useEffect, useId, useMemo, useState, type ReactNode, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AvailableCashField } from "@/components/available-cash-field";
import { AlertTriangle, Bitcoin, ChevronDown, ExternalLink, Landmark, Printer, RefreshCw } from "lucide-react";
import { breakEvenReturns, calculate, defaults, roundBitcoinQuantityUp, interestDeductionAssumption, availableCashBounds, traditionalRateAssumption, FEDERAL_BRACKET_YEAR, FEDERAL_BRACKET_SOURCE, type Inputs } from "@/lib/mortgage-model";
import { useMarketData } from "@/lib/use-market-data";
import { stateDefaults } from "@/lib/state-taxes";
import { dollarNumber, formatDollarDraft, chartYearTicks, chartMonthAtPosition, bitcoinPosition } from "@/lib/presentation";

const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
const cents=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const pct=(v:number)=>`${Number(v.toFixed(4))}%`;
const btc=(v:number)=>`${v.toFixed(8)} BTC`;
const btcFloor=(value:number)=>{
  const [coefficient,exponent="0"]=String(Math.max(0,value)).split("e");
  return btc(Number(`${Math.floor(Number(`${coefficient}e${Number(exponent)+8}`))}e-8`));
};
const time=(v?:string)=>v?new Date(v).toLocaleString():"No Successful Observation Yet";
function DollarInput({value,onChange,...props}:{value:number;onChange:(v:number)=>void}&Omit<ComponentProps<typeof Input>,"value"|"onChange">) {
  const [draft,setDraft]=useState<{text:string;value:number}|null>(null);
  const display=draft&&Object.is(draft.value,value)?draft.text:Number.isFinite(value)?dollarNumber.format(value):"";
  return <Input {...props} type="text" inputMode="decimal" value={display} onBlur={()=>setDraft(null)} onChange={e=>{
    const input=e.currentTarget, next=formatDollarDraft(input.value);
    if(!next) {input.value=display;return;}
    const characters=input.value.slice(0,input.selectionStart??input.value.length).replace(/[$,\s]/g,"").length;
    let caret=0,count=0;
    while(caret<next.text.length&&count<characters) {if(next.text[caret]!==",")count++;caret++;}
    setDraft(next);onChange(next.value);
    requestAnimationFrame(()=>{if(document.activeElement===input)input.setSelectionRange(caret,caret);});
  }}/>;
}
function Field({label,value,onChange,prefix,suffix,min=0,max,step=1,hint,maxDecimals,readOnly=false}:{label:string;value:number;onChange:(v:number)=>void;prefix?:string;suffix?:string;min?:number;max?:number;step?:number;hint?:ReactNode;maxDecimals?:number;readOnly?:boolean}) {
  const id=useId();
  const displayValue=Number.isFinite(value)?maxDecimals===undefined?value:value.toFixed(maxDecimals).replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,""):"";
  const common={id,readOnly,"aria-describedby":hint?`${id}-hint`:undefined,className:`${prefix?"has-prefix":""} ${suffix?"has-suffix":""}`};
  return <label className="field" htmlFor={id}><span className="field-label">{label}</span><span className="input-shell">{prefix&&<span className="input-affix input-prefix">{prefix}</span>}{prefix==="$"?<DollarInput {...common} value={value} onChange={onChange}/>:<Input {...common} type="number" value={displayValue} min={min} max={max} step={step} onChange={e=>{
    const next=e.target.value===""?NaN:Number(e.target.value);
    if(maxDecimals!==undefined&&Number.isFinite(next)&&((e.target.value.split(".")[1]?.split(/[eE]/)[0].length??0)>maxDecimals||Number(next.toFixed(maxDecimals))!==next)) {e.target.value=String(displayValue);return;}
    onChange(next);
  }}/>}{suffix&&<span className="input-affix input-suffix">{suffix}</span>}</span>{hint&&<span className="field-hint" id={`${id}-hint`}>{hint}</span>}</label>;
}
function Choice({label,value,onChange,options,hint}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];hint?:ReactNode}) {
  return <div className="field"><span className="field-label">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>{hint&&<span className="field-hint">{hint}</span>}</div>;
}
function Toggle({label,checked,onChange,hint}:{label:string;checked:boolean;onChange:(v:boolean)=>void;hint?:string}) {return <label className="toggle-field"><span><strong>{label}</strong>{hint&&<small>{hint}</small>}</span><Switch checked={checked} onCheckedChange={onChange} aria-label={label} /></label>;}
function Advanced({title,children}:{title:string;children:ReactNode}) {return <details className="advanced"><summary>{title}<ChevronDown size={16}/></summary><div className="field-grid advanced-grid">{children}</div></details>;}
function Metric({label,value,hint}:{label:string;value:string;hint:string}) {return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;}
function Row({label,a,b,total=false}:{label:string;a:ReactNode;b:ReactNode;total?:boolean}) {return <tr className={total?"total-row":""}><th scope="row">{label}</th><td>{a}</td><td>{b}</td></tr>;}
function WealthChart({a,b}:{a:number;b:number}) {
  const low=Math.min(0,a,b),high=Math.max(0,a,b),span=Math.max(1,high-low);
  return <div className="wealth-chart">{[{label:"Traditional",value:a,tone:"trad-bar"},{label:"Bitcoin Collateralized",value:b,tone:"btc-bar"}].map(item=><div key={item.label} className="wealth-bar"><div className="wealth-bar-label"><span>{item.label}</span><strong>{money.format(item.value)}</strong></div><div className="signed-track" role="img" aria-label={`${item.label}: ${money.format(item.value)} projected wealth`}><span className={`signed-bar ${item.value<0?"negative-bar":item.tone}`} style={{left:`${(Math.min(0,item.value)-low)/span*100}%`,width:`${Math.abs(item.value)/span*100}%`}}/></div></div>)}<p className="field-hint">Bars extend from zero. Negative wealth is shown in red.</p></div>;
}

function PricePathChart({baseline,prices,years,volatility}:{baseline:number[];prices:number[];years:number;volatility:number}) {
  const [hoverMonth,setHoverMonth]=useState<number|null>(null);
  const ticks=chartYearTicks(years),width=Math.max(620,100+years*(years%2?48:26)),height=240,left=88,right=width-20,axis=202;
  const high=Math.max(...baseline,...prices),months=prices.length-1;
  const x=(m:number)=>left+m/months*(right-left),y=(v:number)=>20+(1-v/high)*(axis-20);
  const points=(values:number[])=>values.map((v,m)=>`${x(m)},${y(v)}`).join(" ");
  const month=hoverMonth===null?null:Math.min(months,hoverMonth);
  const label=month===null?"":month===0?"Today":`Year ${Math.floor(month/12)}${month%12?`, Month ${month%12}`:""}`;
  const tooltipX=month===null?0:Math.max(left,Math.min(right-172,x(month)-86));
  const tooltipY=month===null?0:Math.max(3,y(prices[month])-54);
  return <div className="snapshot price-path-card"><div className="position-top"><h2>BTC Purchase Price Path</h2><span className="year-chip">{volatility}% Volatility</span></div><p className="field-hint">The ending price stays the same. Move across the chart to inspect monthly purchase prices.</p><div className="price-path-scroll"><svg style={{minWidth:width}} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label={`Linear baseline and selected BTC purchase price path; both end at ${money.format(baseline.at(-1)!)} in year ${years}. Use left and right arrow keys to inspect monthly prices.`}
    onPointerMove={e=>{const bounds=e.currentTarget.getBoundingClientRect();setHoverMonth(chartMonthAtPosition((e.clientX-bounds.left)/bounds.width*width,left,right,months));}}
    onPointerLeave={()=>setHoverMonth(null)} onFocus={()=>setHoverMonth(0)} onBlur={()=>setHoverMonth(null)}
    onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();setHoverMonth(e.key==="Home"?0:e.key==="End"?months:Math.max(0,Math.min(months,(hoverMonth??0)+(e.key==="ArrowRight"?1:-1))));}}}>
    <line x1={left} x2={right} y1={axis} y2={axis} stroke="#64748b" opacity=".5"/><text x="0" y="20">{money.format(high)}</text><text x="0" y={axis}>$0.00</text>
    <polyline points={points(baseline)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4"/><polyline points={points(prices)} fill="none" stroke="#f7931a" strokeWidth="2.5"/>
    {ticks.map(year=><g key={year}><line x1={x(year*12)} x2={x(year*12)} y1={axis} y2={axis+5} stroke="#64748b"/><text x={x(year*12)} y={axis+23} textAnchor={year===0?"start":year===years?"end":"middle"}>{year===0?"Today":`Year ${year}`}</text></g>)}
    {month!==null&&<g className="price-chart-hover" pointerEvents="none"><line x1={x(month)} x2={x(month)} y1={y(prices[month])} y2={axis} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2 4"/><circle cx={x(month)} cy={y(prices[month])} r="5" fill="#f7931a" stroke="#0b1727" strokeWidth="2"/><rect x={tooltipX} y={tooltipY} width="172" height="45" rx="7" fill="#15273a" stroke="#64748b"/><text className="price-tooltip-text" x={tooltipX+10} y={tooltipY+17}>{label}</text><text className="price-tooltip-text" x={tooltipX+10} y={tooltipY+34}>{money.format(prices[month])}</text></g>}
    </svg></div><span className="sr-only" role="status">{month===null?"":`${label}: ${money.format(prices[month])}`}</span><div className="price-path-legend"><span>— Selected Purchase Path</span><span>┄ Linear Baseline</span><strong>Final Price: {money.format(baseline.at(-1)!)}</strong></div><p className="field-hint">One illustrative path, not an average forecast. Upfront holdings, loan terms, and the final valuation price are unchanged by volatility. <a href="/methodology#volatility">Read the Volatility Method</a></p></div>;
}

export default function Home() {
  const [inputs,setInputs]=useState<Inputs>(defaults);
  const [resetKey,setResetKey]=useState(0);
  const market=useMarketData(setInputs);
  const n=(key:{[K in keyof Inputs]:Inputs[K] extends number?K:never}[keyof Inputs])=>(value:number)=>market.setField(key,value as never);
  const resultSet=useMemo(()=>calculate(inputs),[inputs]);
  const result=resultSet.result;
  const traditionalPricing=result?.traditionalPricing??traditionalRateAssumption(inputs);
  const tradBitcoin=result?bitcoinPosition(inputs.btcQuantity,result.btcSoldQuantity,0,result.tradPurchasedBtc):null;
  const cryptoBitcoin=result?bitcoinPosition(inputs.btcQuantity,0,result.pledged/inputs.btcPrice,result.cryptoPurchasedBtc):null;
  const {minimumCash,maximumCash}=useMemo(()=>availableCashBounds(inputs),[inputs]);
  const availableCash=inputs.availableCash??minimumCash;
  useEffect(()=>{
    if(inputs.availableCash===null||!Number.isFinite(minimumCash)||!Number.isFinite(maximumCash)||minimumCash>maximumCash)return;
    const bounded=Math.max(minimumCash,Math.min(inputs.availableCash,maximumCash));
    if(bounded!==inputs.availableCash)setInputs(c=>({...c,availableCash:bounded}));
  },[inputs.availableCash,minimumCash,maximumCash]);
  const deductionAssumption=interestDeductionAssumption(inputs);
  const roots=useMemo(()=>breakEvenReturns(inputs),[inputs]);
  const scenarios=useMemo(()=>[-10,0,5,10,15,20].map(growth=>({growth,result:calculate(inputs,growth).result})),[inputs]);
  const rule=market.taxRules.find(r=>r.name===inputs.location);
  const holdingsValue=inputs.btcPrice*inputs.btcQuantity;
  const stateDescription=inputs.stateRules?(rule?.note??"Choose a location for a documented default, or enter a custom rate."):"Custom flat state rate; automatic allowances and surtaxes are disabled.";
  const changeLocation=(value:string)=>{
    const location=value==="__none"?"":value;
    const selected=market.taxRules.find(r=>r.name===location);
    market.edit("stateRate");market.edit("stateAllowance");
    setInputs(c=>({...c,location,stateRate:location==="Arizona"&&!c.azEligible?2.5:selected?.rate??0,stateAllowance:selected?.allowance??0,stateRules:true}));
  };
  const priceHint=market.custom.btcPrice?"Custom Bitcoin Price Assumption. Quantity stays fixed.":market.status.bitcoin.state==="loading"?"Loading Live Coinbase BTC-USD Spot Price…":market.status.bitcoin.state==="live"?"Live Coinbase BTC-USD spot price loaded. Editable.":"Coinbase unavailable; retaining the last known price or reference assumption. Editable.";
  const benchmarkHint=market.status.mortgage.state==="loading"?`Loading Freddie Mac ${inputs.termYears}-Year PMMS…`:market.status.mortgage.state==="live"?`Freddie Mac ${inputs.termYears}-Year PMMS as of ${market.status.mortgage.asOf}.`:`PMMS unavailable; using ${market.status.mortgage.value?"the last successful observation":"the September 3, 2026 reference rate"}.`;
  const spreadLabel=`${traditionalPricing.basisPoints>0?"+":""}${traditionalPricing.basisPoints} bp`;
  const rateHint=<>{inputs.traditionalRateOverride!==null?"Custom final quote; automatic LTV adjustment is not added again. ":"Automatic PMMS + LTV estimate. "}{benchmarkHint} 20% down base: {pct(inputs.baseMortgageRate)}. Estimated LTV adjustment: {spreadLabel} at {pct(traditionalPricing.oltv)} original LTV and {inputs.creditScore} Credit Score. {inputs.termYears===15?"15-year terms have no credit-score/LTV adjustment. ":"PMI is separate; adjustments can be negative. "}Editable for a final lender quote. <a href="/methodology#ltv-pricing">Rate Method</a></>;

  const safeWinner=result?.feasible&&!result.eligibilityUnconfirmed;
  const print=()=>window.print();
  return <main>
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><Bitcoin size={20}/></span>Mortgage Lens</a><div className="top-actions"><button onClick={print} className="action-button"><Printer size={16}/><span>Print Comparison</span></button><button onClick={()=>{setResetKey(k=>k+1);market.reset();}} className="action-button primary-action" aria-busy={market.refreshing}><RefreshCw size={16} className={market.refreshing?"refresh-spin":""}/><span>Reset & Refresh</span></button></div></header>
    <div className="page-shell">
      <section className="intro"><div><p className="eyebrow">Traditional vs. Bitcoin Collateralized</p><h1>Compare the Cost of Keeping Your Bitcoin</h1></div><p className="lede">The same starting assets and cash budget. Compare loan costs, taxes, Bitcoin purchases, and custody outcomes.</p></section>
      <details className="data-status"><summary>Data Sources & Refresh Status <span>{market.refreshing?"Refreshing…":"View Timestamps"}</span></summary><div className="source-status-grid">
        <div><strong>Coinbase BTC-USD</strong><span>{market.status.bitcoin.state==="live"?`${cents.format(market.status.bitcoin.value!)} · ${time(market.status.bitcoin.asOf)}`:market.status.bitcoin.state==="loading"?"Loading…":"Unavailable — retained value is an assumption."}</span></div>
        <div><strong>Freddie Mac PMMS</strong><span>{market.status.mortgage.state==="live"?`${pct(market.status.mortgage.value!)} · Survey ${market.status.mortgage.asOf}`:market.status.mortgage.state==="loading"?"Loading…":"Unavailable — retained/reference rate is not a fresh observation."}</span></div>
        <div><strong>State Tax Table</strong><span>{market.status.taxes.state==="loading"?"Loading Latest Maintained Table…":`2026 Planning Rules · Reviewed ${market.taxReviewedAt}${market.status.taxes.state==="unavailable"?" · Using Bundled Copy":""}`}</span></div>
      </div><p>Reset restores defaults and requests fresh market data and the latest maintained tax table. Tax laws and program eligibility require reviewed updates; they are not interpreted automatically from live webpages. Program assumptions reviewed September 7, 2026.</p></details>
      <div className="workspace">
        <aside className="inputs-panel">
          <div className="panel-heading"><div><span className="step">01</span><h2>Purchase & Assets</h2></div></div>
          <div className="field-grid">
            <Field label="Home Price" value={inputs.homePrice} onChange={n("homePrice")} prefix="$" step={1000}/>
            <Field label="Down Payment %" value={inputs.downPct} onChange={n("downPct")} suffix="%" min={5} max={100} hint="Traditional only; minimum 5%. Bitcoin Collateralized starts with an 80% first mortgage and 20% BTC-backed second loan, with no PMI."/>
            <AvailableCashField key={`${resetKey}-${inputs.availableCash===null?"automatic":"custom"}`} value={availableCash} minimum={minimumCash} maximum={maximumCash} onChange={v=>market.setField("availableCash",v)}/>
            <fieldset className="extra-cash-options market-field"><legend className="field-label">Apply Extra Cash to:</legend><RadioGroup aria-label="Apply Extra Cash to:" value={inputs.extraCashUse} onValueChange={v=>market.setField("extraCashUse",v as Inputs["extraCashUse"])} className="extra-cash-radio">
              <label data-selected={inputs.extraCashUse==="down-payment"}><RadioGroupItem value="down-payment"/>Extra Down Payment</label>
              <label data-selected={inputs.extraCashUse==="bitcoin"}><RadioGroupItem value="bitcoin"/>One-time BTC Buy</label>
            </RadioGroup><p className="field-hint">Apply each option’s cash remaining after closing costs and tax reserves.</p></fieldset>
            <Field label="Bitcoin Holdings Value" value={Math.round(holdingsValue*100)/100} onChange={v=>market.setField("btcQuantity",roundBitcoinQuantityUp(v/inputs.btcPrice))} prefix="$" step={1000} hint="Editing value updates BTC quantity at the entered price, rounded up to the nearest satoshi."/>
            <Field label="Starting Bitcoin Quantity" value={inputs.btcQuantity} onChange={n("btcQuantity")} suffix="BTC" step={0.00000001} maxDecimals={8} hint="Up to 8 decimal places. Automatically calculated quantities round up to the nearest satoshi."/>
            <Field label="Bitcoin Cost Basis" value={inputs.btcCostBasis} onChange={n("btcCostBasis")} prefix="$" step={500} hint="Total adjusted basis of your holdings. Does not change when price changes."/>
            <div className="market-field"><Field label="Current Bitcoin Price" value={inputs.btcPrice} onChange={n("btcPrice")} prefix="$" step={100} hint={priceHint}/></div>
          </div>
          <div className="section-rule"/><div className="panel-heading"><div><span className="step">02</span><h2>Loan Assumptions</h2></div></div>
          <div className="field-grid">
            <div><Field label="Traditional Rate" value={traditionalPricing.rate} onChange={v=>market.setField("traditionalRateOverride",v)} suffix="%" step={0.01} hint={rateHint}/>{inputs.traditionalRateOverride!==null&&<button type="button" className="action-button" onClick={()=>market.setField("traditionalRateOverride",null)}>Use PMMS + LTV Adjustment</button>}</div>
            <Field label="Bitcoin Collateralized Rate" value={inputs.cryptoRate} onChange={n("cryptoRate")} suffix="%" step={0.01} hint="Default: unadjusted 20%-down PMMS + 1.50 percentage points. Traditional LTV adjustments and quote edits never change this rate. Editable for a quote."/>
            <Choice label="Loan Term" value={String(inputs.termYears)} onChange={v=>market.changeTerm(Number(v) as 15|30)} options={[{value:"15",label:"15 Years"},{value:"30",label:"30 Years"}]}/>
            <Field label="Comparison Period" value={inputs.horizonYears} onChange={n("horizonYears")} suffix="Years" min={1} max={50}/>
          </div>
          <div className="section-rule"/><div className="panel-heading"><div><span className="step">03</span><h2>Growth & Tax</h2></div></div>
          <div className="field-grid">
            <Field label="Bitcoin Annual Return %" value={inputs.btcGrowth} onChange={n("btcGrowth")} suffix="%" min={-99}/>
            <Field label="Bitcoin Annualized Volatility %" value={inputs.btcVolatility} onChange={n("btcVolatility")} suffix="%" max={200} step={5} hint="0% uses a linear path. Higher values vary monthly purchase prices; the final price stays fixed."/>
            <div className="market-field volatility-actions"><span>Illustrative Path {inputs.btcPathSeed}</span><button type="button" className="action-button" disabled={inputs.btcVolatility===0} onClick={()=>market.setField("btcPathSeed",inputs.btcPathSeed===2147483647?1:inputs.btcPathSeed+1)}>Try Another Price Path</button></div>
            <Field label="Home Appreciation %" value={inputs.homeGrowth} onChange={n("homeGrowth")} suffix="%" min={-99} step={0.5}/>
            <Field label="Federal Long-Term Capital Gains Tax Rate" value={inputs.federalRate} onChange={n("federalRate")} suffix="%" step={0.1} hint="Default 23.8% = 20% long-term gains + 3.8% NIIT. Applied to all positive modeled gains; editable."/>
            <Field label="State Long-Term Capital Gains Tax Rate" value={inputs.stateRate} onChange={n("stateRate")} suffix="%" step={0.01} hint="Editable top base planning rate, after broad percentage exclusions. Special rules are shown below."/>
            <Choice label="Location" value={inputs.location||"__none"} onChange={changeLocation} options={[{value:"__none",label:"Select Location"},...market.taxRules.map(r=>({value:r.name,label:r.name}))]}/>
            <Field label="County / Local Capital Gains Tax Rate" value={inputs.countyRate} onChange={n("countyRate")} suffix="%" step={0.01} hint="Default 0%. Enter only a local rate that applies to your investment gains."/>
            <Field label="Gross Monthly Income" value={inputs.grossMonthlyIncome} onChange={n("grossMonthlyIncome")} prefix="$" step={1000} hint="Zero leaves the DTI estimate unset."/>
            <div className="market-field tax-note">{stateDescription}{rule&&<a href={rule.source} target="_blank" rel="noreferrer">State Source <ExternalLink size={12}/></a>}</div>
            <div className="market-field"><Field label="Coinbase Rug or 6102 Attack Probability %" value={inputs.rugProbability} onChange={n("rugProbability")} suffix="%" max={100} step={0.1} hint="Probability of complete loss of the pledged BTC over the entire comparison period, while pledged. Not an annual probability. Loans remain payable in this scenario."/></div>
          </div>
          <Advanced title="Lender Credits & Closing Costs">
            <Toggle label="Apply Coinbase One Lender Credit" checked={inputs.coinbaseOne} onChange={v=>market.setField("coinbaseOne",v)} hint="On: apply eligible lender credits. Off: no Coinbase promotional credit. Membership expenses are excluded."/>
            <Toggle label="Traditional Mortgage Qualifies for the Promotion" checked={inputs.traditionalPromo} onChange={v=>market.setField("traditionalPromo",v)} hint="Default on for an eligible mortgage through the participating lender and Coinbase application path. Turn off for another lender."/>
            <Field label="Promotional Credit Rate" value={inputs.creditPct} onChange={n("creditPct")} suffix="%" step={0.25}/>
            <Field label="Credit Cap per Alternative" value={inputs.creditCap} onChange={n("creditCap")} prefix="$" step={500}/>
            <Field label="Other Traditional Lender Credit" value={inputs.traditionalOtherCredit} onChange={n("traditionalOtherCredit")} prefix="$" step={100} hint="Used only when the traditional Coinbase promotion is not applied; offers are not stacked."/>
            <Field label="Traditional Closing Costs" value={inputs.traditionalClosing} onChange={n("traditionalClosing")} prefix="$" step={500} hint="Before points, credits, and BTC taxes."/>
            <Field label="Traditional Eligible Credit Costs" value={inputs.traditionalEligibleCosts} onChange={n("traditionalEligibleCosts")} prefix="$" step={100}/>
            <Field label="Bitcoin First-Loan Closing Costs" value={inputs.cryptoFirstClosing} onChange={n("cryptoFirstClosing")} prefix="$" step={500}/>
            <Field label="Bitcoin First-Loan Eligible Credit Costs" value={inputs.cryptoFirstEligibleCosts} onChange={n("cryptoFirstEligibleCosts")} prefix="$" step={100}/>
            <Field label="Down-Payment Loan Closing Costs" value={inputs.cryptoSecondClosing} onChange={n("cryptoSecondClosing")} prefix="$" step={100}/>
            <Field label="Down-Payment Loan Eligible Credit Costs" value={inputs.cryptoSecondEligibleCosts} onChange={n("cryptoSecondEligibleCosts")} prefix="$" step={100}/>
            <Field label="Traditional Points" value={inputs.traditionalPoints} onChange={n("traditionalPoints")} suffix="%" step={0.125}/>
            <Field label="Bitcoin First-Loan Points" value={inputs.cryptoFirstPoints} onChange={n("cryptoFirstPoints")} suffix="%" step={0.125}/>
            <Field label="Down-Payment Loan Points" value={inputs.cryptoSecondPoints} onChange={n("cryptoSecondPoints")} suffix="%" step={0.125}/>
            <p className="field-hint market-field">Each loan's promotional credit is capped by its own eligible costs. Prepaids, taxes, insurance, and some non-lender charges may not qualify. Replace estimates with your Loan Estimates.</p>
          </Advanced>
          <Advanced title="State Rules & Future Taxes">
            <Toggle label="Apply State Exclusions & Surtaxes" checked={inputs.stateRules} onChange={v=>market.setField("stateRules",v)} hint="Adds the documented dollar exclusions, annual caps, and surtaxes to the entered base rate. Turn off to use a custom flat rate alone."/>
            <Field label="Annual State Gain Exclusion" value={inputs.stateAllowance} onChange={n("stateAllowance")} prefix="$" step={500} hint="Total annual allowance before other capital gains. Does not include ordinary personal deductions."/>
            <Choice label="Tax Filing Status" value={inputs.filingStatus} onChange={v=>market.setField("filingStatus",v as Inputs["filingStatus"])} options={[{value:"single",label:"Single"},{value:"joint",label:"Married Filing Jointly"},{value:"head",label:"Head of Household"},{value:"separate",label:"Married Filing Separately"}]}/>
            <Field label="Other Annual Income" value={inputs.otherIncome} onChange={n("otherIncome")} prefix="$" step={10000} hint="Additional annual income excluding capital gains and income already entered as Gross Monthly Income. Used for state surtaxes and the interest-deduction rate; held fixed over the projection."/>
            <Field label="Other Annual Realized Capital Gains" value={inputs.otherCapitalGains} onChange={n("otherCapitalGains")} prefix="$" step={1000} hint="Consumes annual exclusions and contributes to surtax thresholds."/>
            {inputs.location==="Minnesota"&&<Field label="Other Annual Net Investment Income" value={inputs.otherInvestmentIncome} onChange={n("otherInvestmentIncome")} prefix="$" step={1000} hint="For Minnesota NIIT, excluding the capital gains entered separately."/>}
            {inputs.location==="Arizona"&&<Toggle label="BTC Acquired After December 31, 2011" checked={inputs.azEligible} onChange={v=>{market.setField("azEligible",v);market.setField("stateRate",stateDefaults("Arizona",v).stateRate);}} hint="Controls the default 25% long-term-gain subtraction."/>}
            <Toggle label="Use Different Tax Rates at Exit" checked={inputs.exitTaxOverride} onChange={v=>market.setField("exitTaxOverride",v)} hint="For a future tax law or location assumption. Overrides use flat effective rates without today's state rules."/>
            {inputs.exitTaxOverride&&<><Field label="Exit Federal Long-Term Rate" value={inputs.exitFederalRate} onChange={n("exitFederalRate")} suffix="%" step={0.1}/><Field label="Exit State Long-Term Rate" value={inputs.exitStateRate} onChange={n("exitStateRate")} suffix="%" step={0.01}/><Field label="Exit County / Local Rate" value={inputs.exitCountyRate} onChange={n("exitCountyRate")} suffix="%" step={0.01}/></>}
            <p className="field-hint market-field">All modeled gains are long term. Rate defaults are planning assumptions, not a progressive tax-return calculation. Current rules and dollar thresholds stay fixed into the future unless you override them.</p>
          </Advanced>
          <Advanced title="BTC Sale, Fees & Tax Funding">
            <Field label="BTC Sale Fee %" value={inputs.btcSaleFee} onChange={n("btcSaleFee")} suffix="%" step={0.1} hint="Applied to today's sale and hypothetical terminal BTC liquidation. Includes your assumed spread."/>
            <Field label="BTC Advance Rate" value={inputs.advanceRate} onChange={n("advanceRate")} suffix="%" max={100} hint="Published BTC program assumption: 40%."/>
            <Toggle label="Sell Additional BTC to Fund Sale Taxes" checked={inputs.fundTaxFromBtc} onChange={v=>market.setField("fundTaxFromBtc",v)} hint="Off: taxes use outside cash. On: gross up the BTC sale to cover the down payment, fees, and taxes."/>
            <Toggle label="Specify Cost Basis of the BTC Sold" checked={inputs.customSaleBasis} onChange={v=>market.setField("customSaleBasis",v)} hint="Off: allocate total basis proportionally. On: enter the actual basis of selected tax lots."/>
            {inputs.customSaleBasis&&<Field label="Cost Basis Allocated to BTC Sold" value={inputs.saleBasis} onChange={n("saleBasis")} prefix="$" step={500} hint="Enter basis for the full gross sale, including extra BTC sold for fees or taxes."/>}
          </Advanced>
          <Advanced title="Affordability & Mortgage Insurance">
            <Field label="Annual PMI Rate" value={inputs.pmiRate} onChange={n("pmiRate")} suffix="%" step={0.05} hint="Traditional only: annual rate × beginning-of-month balance ÷ 12. PMI declines with the balance and stops at 78% of original home value. Bitcoin Collateralized never incurs PMI."/>
            <Field label="Other Monthly Debt Payments" value={inputs.monthlyOtherDebt} onChange={n("monthlyOtherDebt")} prefix="$" step={100}/>
            <Field label="Monthly Property Tax, Insurance & HOA" value={inputs.monthlyPropertyCosts} onChange={n("monthlyPropertyCosts")} prefix="$" step={100} hint="Default: 0.084% of Home Price per month. Updates with Home Price until edited. Included in DTI and the common budget."/>
            <Field label="Credit Score" value={inputs.creditScore} onChange={n("creditScore")} min={300} max={850} hint="Selects the relative Traditional LTV rate adjustment and checks the Bitcoin program minimum. Does not fully price credit risk."/>
            <Field label="Applicable Conforming Loan Limit" value={inputs.conformingLimit} onChange={n("conformingLimit")} prefix="$" step={1000} hint="2026 baseline for one unit: $832,750. Edit for an eligible high-cost area."/>
          </Advanced>
          <Advanced title="Interest Deduction & Dollar Values">
            <Toggle label="Model Incremental Qualified Mortgage Interest Deduction" checked={inputs.interestDeduction} onChange={v=>market.setField("interestDeduction",v)} hint="Use only when you itemize, the debt qualifies, and this deduction adds tax savings. Both alternatives use the same criteria."/>
            {inputs.interestDeduction&&<><Field label="Marginal Tax Rate on Interest Deduction" value={deductionAssumption.rate} onChange={()=>{}} readOnly suffix="%" hint={<>Automatic {FEDERAL_BRACKET_YEAR} federal rate for {Number.isFinite(deductionAssumption.annualIncome)?money.format(deductionAssumption.annualIncome):"—"} annual income (Gross Monthly Income × 12 + Other Annual Income) and Tax Filing Status. Uses income before deductions as a bracket estimate. <a href={FEDERAL_BRACKET_SOURCE} target="_blank" rel="noreferrer">IRS Brackets</a></>}/><Field label="Available Acquisition-Debt Deduction Limit" value={inputs.acquisitionDebtLimit} onChange={n("acquisitionDebtLimit")} prefix="$" step={1000} hint="Approximation using outstanding debt; adjust for filing status and other home debt."/></>}
            <Field label="Annual Inflation Assumption" value={inputs.inflation} onChange={n("inflation")} suffix="%" min={-99} step={0.5}/>
            <Field label="Discount Rate for Wealth Difference" value={inputs.discountRate} onChange={n("discountRate")} suffix="%" min={-99} step={0.5}/>
          </Advanced>
          <Advanced title="Payoff, Sale & Refinance">
            <Field label="Early Payoff Year" value={inputs.earlyPayoffYear} onChange={n("earlyPayoffYear")} suffix="Years" hint="Zero keeps scheduled payments. Otherwise both alternatives repay all debt at this year-end."/>
            <Choice label="Action at Comparison End" value={inputs.exitAction} onChange={v=>market.setField("exitAction",v as Inputs["exitAction"])} options={[{value:"hold",label:"Keep Home & Loans"},{value:"sell",label:"Sell Home"},{value:"refinance",label:"Refinance Remaining Debt"},{value:"payoff",label:"Repay Remaining Debt"}]}/>
            {inputs.exitAction==="sell"&&<><Field label="Home Sale Costs %" value={inputs.homeSaleCost} onChange={n("homeSaleCost")} suffix="%" step={0.5}/><Field label="Available Home Sale Gain Exclusion" value={inputs.homeSaleExclusion} onChange={n("homeSaleExclusion")} prefix="$" step={1000} hint="Enter only the exclusion you qualify for; zero if none."/><Field label="Effective Tax Rate on Taxable Home Gain" value={inputs.homeSaleTaxRate} onChange={n("homeSaleTaxRate")} suffix="%" step={0.1} hint="Combined long-term federal, state, and local assumption after the entered exclusion."/></>}
            {inputs.exitAction==="refinance"&&<Field label="Refinance Costs %" value={inputs.refinanceCost} onChange={n("refinanceCost")} suffix="%" step={0.25} hint="Charged on the balance refinanced at the horizon. Later payments are outside this comparison."/>}
            <p className="field-hint market-field">Collateral is assumed released once the down-payment loan is fully repaid. Confirm release terms in the executed agreements. The entered custody probability covers the pledged portion of the comparison period and does not accrue annually.</p>
          </Advanced>
        </aside>
        <section className="results-panel" aria-label="Comparison Results">
          {resultSet.errors.length>0&&<div className="warning error-message" role="alert"><AlertTriangle size={20}/><div><strong>Correct These Inputs Before Comparing</strong><ul>{resultSet.errors.map(e=><li key={e}>{e}</li>)}</ul></div></div>}
          {result&&<>
            <div className={`verdict ${result.advantage>=0?"verdict-orange":"verdict-blue"}`}><div><span className="verdict-label">At Year {inputs.horizonYears} · Equal Cash Budget</span><h2>{!result.feasible?"Comparison Is Not Fundable":result.eligibilityUnconfirmed?"Check Loan Eligibility":Math.abs(result.advantage)<1?"The Outcomes Are Approximately Equal":`${result.advantage>=0?"Bitcoin Collateralized":"Traditional"} Comes Out Ahead`}</h2>{safeWinner&&Math.abs(result.advantage)>=1&&<p>by <strong>{money.format(Math.abs(result.advantage))}</strong> in modeled expected after-tax wealth</p>}{!safeWinner&&<p>Results below are illustrative; no preferred option is selected.</p>}</div></div>
            {resultSet.warnings.length>0&&<details className="assumption-notices"><summary>{resultSet.warnings.length} Assumption {resultSet.warnings.length===1?"Note":"Notes"}</summary><ul>{resultSet.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
            <div className="insights-grid">
              <Metric label="Monthly Payment Difference" value={result.feasible?`${result.monthlyDifference>=0?"+":"−"}${money.format(Math.abs(result.monthlyDifference))}`:"—"} hint="Bitcoin Collateralized minus Traditional, including PMI."/>
              <Metric label="Break-Even BTC Return" value={!result.feasible?"—":roots.length?roots.map(pct).join(" / "):"No Verified Crossover"} hint="Sampled range −99% to +200% annually; all other assumptions fixed."/>
            </div>
            <div className="position-card"><div className="position-top"><h2>Projected After-Tax Wealth</h2><span className="year-chip">Year {inputs.horizonYears}</span></div>{result.feasible&&<WealthChart a={result.tradWealth} b={result.cryptoWealth}/>}<div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable Comparison Table"><table className="comparison-table"><thead><tr><th>Component</th><th>Traditional</th><th>Bitcoin Collateralized</th></tr></thead><tbody>
              <Row label="Home Equity After Exit Costs" a={money.format(result.tradEquity)} b={money.format(result.cryptoEquity)}/>
              <Row label="BTC Exit Tax If Custody Survives" a={money.format(result.tradExitTax)} b={money.format(result.cryptoExitTax)}/>
              <Row label="BTC After Fees & Taxes, Expected" a={btcFloor(result.tradAfterTaxBtcQuantity)} b={btcFloor(result.cryptoAfterTaxBtcQuantity)}/>
              <Row label="BTC Value After Fees & Taxes, Expected" a={money.format(result.tradBtcAfterTax)} b={money.format(result.cryptoBtcExpected)}/>
              {(result.tradUnspentCash>=.005||result.cryptoUnspentCash>=.005)&&<Row label="Cash Remaining After Loan Paydown" a={money.format(result.tradUnspentCash)} b={money.format(result.cryptoUnspentCash)}/>}
              <Row label="Expected After-Tax Wealth" a={money.format(result.tradWealth)} b={money.format(result.cryptoWealth)} total/>
              <Row label="In Today's Purchasing Power" a={money.format(result.realTradWealth)} b={money.format(result.realCryptoWealth)}/>
            </tbody></table></div><p className="position-note">Both alternatives start with {money.format(result.btcValue)} of BTC and {money.format(result.sharedStartingCash)} of outside cash. Each month, the option with the lower principal, interest, and PMI payment buys BTC with the difference at that month’s modeled price. The baseline grows linearly within each year to reach {pct(inputs.btcGrowth)} annually. The {pct(inputs.btcVolatility)} volatility assumption changes only monthly purchase prices, with the same final BTC price. {inputs.extraCashUse==="bitcoin"?"Upfront cash savings buy BTC at today’s price and are included in BTC Purchased During Loan.":"Cash remaining after closing costs and tax reserves reduces Traditional’s first mortgage, then its BTC sale once the loan reaches zero. Bitcoin Collateralized applies extra cash only to its BTC-backed second loan and pledge; the first mortgage stays at 80% of Home Price. Cash left after the permitted paydown remains uninvested and is included in wealth. No upfront BTC is purchased."} Other unused budget dollars also buy BTC; no invested cash balance remains. Initial common housing budget: {money.format(Math.max(result.tradSchedule.rows[0].outflow,result.cryptoSchedule.rows[0].outflow)+inputs.monthlyPropertyCosts)} per month. {inputs.earlyPayoffYear>0?`Peak financing budget, including payoff: ${money.format(result.peakBudget)}. `:""}Purchased BTC stays outside the loan structure, with its purchase dollars added to cost basis. Expected after-tax BTC is the remaining liquidation value divided by the modeled year-end BTC price; only pledged BTC is weighted by custody risk. All gains retain the long-term tax assumption. The home is taxed only in the Sell Home scenario.</p><p className="position-note">Present value of the Bitcoin Collateralized wealth difference: <strong>{money.format(result.presentValueDifference)}</strong> at a {pct(inputs.discountRate)} discount rate. This discounts the terminal difference, not a separate loan APR calculation.</p></div>
            <div className="snapshot"><h2>Cash Required Today</h2><div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable Comparison Table"><table className="comparison-table"><thead><tr><th scope="col">Metric</th><th scope="col"><Landmark size={15}/> Traditional</th><th scope="col"><Bitcoin size={15}/> Bitcoin Collateralized</th></tr></thead><tbody>
              <Row label="Available Cash" a={money.format(result.sharedStartingCash)} b={money.format(result.sharedStartingCash)}/>
              {inputs.extraCashUse==="down-payment"&&<Row label="Extra Down Payment" a={money.format(result.tradCashDown)} b={money.format(result.cryptoCashDown)}/>}
              <Row label="BTC Sold (Gross)" a={<>{money.format(result.btcSold)}<small>{btc(result.btcSoldQuantity)}</small></>} b="$0.00"/>
              <Row label="BTC Sale Fees" a={money.format(result.saleFees)} b="$0.00"/>
              <Row label="Net BTC Proceeds for Down Payment" a={money.format(result.tradBtcDownPayment)} b="$0.00"/>
              <Row label="Tax Reserve on BTC Sale" a={<>{money.format(result.saleTax)}<small>{inputs.fundTaxFromBtc?"Funded by Additional BTC Sale":"Funded by Outside Cash"}</small></>} b="$0.00"/>
              <Row label="Gross Lender Credit" a={cents.format(result.tradCredit)} b={<>{cents.format(result.cryptoCredit)}<small>First {cents.format(result.cryptoCreditParts.first)} + Second {cents.format(result.cryptoCreditParts.second)}</small></>}/>
              <Row label="Additional Cash Required, Excluding Tax Reserve" a={money.format(result.tradAdditionalCash)} b={money.format(result.cryptoAdditionalCash)}/>
              <Row label="Total Up Front Cost" a={money.format(result.tradUpfront)} b={money.format(result.cryptoUpfront)} total/>
              {(result.tradUnspentCash>=.005||result.cryptoUnspentCash>=.005)&&<Row label="Cash Remaining After Loan Paydown" a={money.format(result.tradUnspentCash)} b={money.format(result.cryptoUnspentCash)}/>}
            </tbody></table></div><p className="position-note">Additional cash includes any Extra Down Payment, closing costs and points after credits. Available Cash starts at the larger required upfront cost before optional extra down payments; custom cash above that minimum is applied using the selected option. BTC sale proceeds are shown separately. Tax reserves are set aside today for comparison; actual tax-payment dates can differ.</p></div>
            <PricePathChart baseline={result.purchasePath.baseline} prices={result.purchasePath.prices} years={inputs.horizonYears} volatility={inputs.btcVolatility}/>
            <div className="snapshot"><h2>Loans & Cash Flow</h2><div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable Comparison Table"><table className="comparison-table"><thead><tr><th>Metric</th><th>Traditional</th><th>Bitcoin Collateralized</th></tr></thead><tbody>
              <Row label="Loan Structure" a={`${money.format(result.firstPrincipal)} First`} b={`${money.format(result.cryptoFirstPrincipal)} First + ${money.format(result.financedDown)} Second`}/>
              <Row label="Monthly Principal & Interest" a={money.format(result.tradSchedule.firstMonthly)} b={money.format(result.cryptoSchedule.firstMonthly)}/>
              <Row label="Initial Monthly PMI" a={money.format(result.tradSchedule.rows[0].pmi)} b={money.format(result.cryptoSchedule.rows[0].pmi)}/>
              <Row label="Total Monthly Payment" a={money.format(result.tradTotalMonthlyPayment)} b={money.format(result.cryptoTotalMonthlyPayment)}/>
              <Row label="Interest Through Comparison End" a={money.format(result.tradSchedule.interest)} b={money.format(result.cryptoSchedule.interest)}/>
              <Row label="Remaining Debt" a={money.format(result.tradSchedule.balance)} b={money.format(result.cryptoSchedule.balance)}/>
              <Row label="Pledged BTC" a={<>{btc(tradBitcoin!.pledged)}<small>{money.format(0)}</small></>} b={<>{btc(cryptoBitcoin!.pledged)}<small>{money.format(result.pledged)}</small></>}/>
              <Row label="Initial Cold Storage BTC" a={btc(tradBitcoin!.coldStorage)} b={btc(cryptoBitcoin!.coldStorage)}/>
              <Row label="BTC Purchased During Loan" a={btc(tradBitcoin!.purchased)} b={btc(cryptoBitcoin!.purchased)}/>
              <Row label="Total Pre-Tax Bitcoin" a={btc(tradBitcoin!.total)} b={btc(cryptoBitcoin!.total)} total/>
              <Row label="Estimated Debt-to-Income Ratio" a={result.tradDti===null?"Income Not Entered":`${result.tradDti.toFixed(3)}%`} b={result.cryptoDti===null?"Income Not Entered":`${result.cryptoDti.toFixed(3)}%`}/>
              {inputs.interestDeduction&&<Row label="Modeled Interest-Deduction Savings" a={money.format(result.tradSchedule.deduction)} b={money.format(result.cryptoSchedule.deduction)}/>}
              {inputs.earlyPayoffYear>0&&<Row label={`Lump-Sum Payoff at Year ${inputs.earlyPayoffYear}`} a={money.format(result.tradSchedule.payoff)} b={money.format(result.cryptoSchedule.payoff)}/>}
              {inputs.exitAction!=="hold"&&<Row label="Debt to Settle or Refinance at Exit" a={money.format(result.tradSchedule.balance)} b={money.format(result.cryptoSchedule.balance)}/>}
            </tbody></table></div></div>
            <div className="snapshot"><h2>Custody Outcomes</h2><div className="outcomes-grid"><Metric label="No Custody Loss" value={money.format(result.cryptoWealthSurvival)} hint={`Bitcoin Collateralized wealth · ${pct(100-result.probability*100)} scenario weight.`}/><Metric label="All Pledged BTC Lost" value={money.format(result.cryptoWealthFailure)} hint={`Bitcoin Collateralized wealth · ${pct(result.probability*100)} scenario weight. Debt remains payable.`}/></div><p className="position-note">Expected custody-related reduction: {money.format(result.expectedCustodyLoss)}. Unpledged BTC remains in both scenarios. Expected wealth weights these two custody outcomes for the selected price path; it is not the probability that one mortgage is better. Scheduled collateral release is modeled at year {result.collateralReleaseYear}{inputs.exitAction!=="hold"?`, or at the earlier terminal transaction in year ${inputs.horizonYears}`:""}.</p></div>
            <div className="snapshot"><h2>Bitcoin Return Scenarios</h2><div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable Comparison Table"><table className="comparison-table"><thead><tr><th>Annual BTC Return</th><th>Traditional Wealth</th><th>Bitcoin Collateralized Wealth</th><th>Difference</th></tr></thead><tbody>{scenarios.map(s=><tr key={s.growth}><th scope="row">{pct(s.growth)}</th><td>{s.result?.feasible?money.format(s.result.tradWealth):"Not Fundable"}</td><td>{s.result?.feasible?money.format(s.result.cryptoWealth):"Not Fundable"}</td><td>{s.result?.feasible?money.format(s.result.advantage):"—"}</td></tr>)}</tbody></table></div><p className="position-note">Difference = Bitcoin Collateralized minus Traditional. These use the selected price path and entered custody risk. They are illustrative scenarios, not forecasts or averages across possible price paths.</p></div>
          </>}
          <div className="program-card"><h2>How to Use This Comparison</h2><p>Replace benchmark rates, costs, and eligible credits with written quotes. The Bitcoin collateralized structure models a first mortgage plus a down-payment loan with the same rate and term, and a 40% BTC advance by default. Published terms say price declines alone do not trigger margin calls.</p><p>Approval, state availability, collateral release, and recovery rights require the actual loan and custody agreements. Common maintenance and living expenses are excluded. Optional tax and mortgage-insurance calculations are planning estimates.</p><a href="/methodology">Methodology, Sources & Assumptions <ExternalLink size={14}/></a></div>
          <div className="print-assumptions"><h2>Complete Input Assumptions</h2><p>Printed {new Date().toISOString().slice(0,10)} · Tax rules reviewed {market.taxReviewedAt}</p><table>{Object.entries(inputs).map(([key,value])=><tr key={key}><th>{key==="baseMortgageRate"?"20% Down Base Rate":key==="traditionalRateOverride"?"Traditional Quote Override":key.replace(/([A-Z])/g," $1")}</th><td>{key==="availableCash"?money.format(availableCash):key==="traditionalRateOverride"&&value===null?"Automatic":String(value)}</td></tr>)}<tr><th>Traditional Rate Used</th><td>{pct(traditionalPricing.rate)}</td></tr><tr><th>Traditional Original LTV</th><td>{pct(traditionalPricing.oltv)}</td></tr><tr><th>Estimated LTV Rate Adjustment</th><td>{spreadLabel}{traditionalPricing.overridden?" (Not Applied; Quote Override)":""}</td></tr>{inputs.interestDeduction&&<><tr><th>Interest Deduction Annual Income</th><td>{money.format(deductionAssumption.annualIncome)}</td></tr><tr><th>Federal Marginal Rate ({FEDERAL_BRACKET_YEAR})</th><td>{pct(deductionAssumption.rate)}</td></tr></>}</table></div>
          <footer><p>Educational planning estimate. All gains are modeled as long term. State defaults use the documented top base rates and selected special rules; income brackets, all deductions, tax-lot eligibility, and future law changes are not fully calculated.</p><div><a href="https://www.freddiemac.com/pmms" target="_blank" rel="noreferrer">Freddie Mac PMMS</a><a href="https://help.coinbase.com/en/coinbase/mortgages/crypto-backed-mortgages" target="_blank" rel="noreferrer">Mortgage & Credit Guidance</a><a href="https://better.com/b/coinbase-offer-terms-and-conditions" target="_blank" rel="noreferrer">Credit Terms</a><a href="/methodology">All Sources</a></div></footer>
        </section>
      </div>
    </div>
  </main>;
}
