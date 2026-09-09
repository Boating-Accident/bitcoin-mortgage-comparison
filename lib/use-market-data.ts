"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { defaults, DEFAULT_BTC_VALUE, roundBitcoinQuantityUp, incomeForTargetDti, defaultMonthlyPropertyCosts, type Inputs } from "./mortgage-model";
import { RequestGate, type MarketSource } from "./market-data";
import { stateTaxRules, TAX_REVIEWED_AT, type StateTaxRule } from "./state-taxes";

type Status = { state:"loading"|"live"|"verified"|"unavailable"; asOf?:string; checkedAt?:string; value?:number };
type Rates = Record<15|30,{rate:number;asOf:string}>;
type Envelope<T> = {data:T;checkedAt:string};
const sources: MarketSource[]=["bitcoin","mortgage","taxes"];

export function useMarketData(setInputs:Dispatch<SetStateAction<Inputs>>) {
  const gate=useRef(new RequestGate());
  const controllers=useRef<Partial<Record<MarketSource,AbortController>>>({});
  const last=useRef<{bitcoin?:{price:number;asOf:string};rates?:Rates}>({});
  const activeTerm=useRef<15|30>(30);
  const cryptoCustom=useRef(false);
  const propertyCostsCustom=useRef(false);
  const [custom,setCustom]=useState<Record<string,boolean>>({});
  const [status,setStatus]=useState<Record<MarketSource,Status>>({bitcoin:{state:"loading"},mortgage:{state:"loading"},taxes:{state:"loading"}});
  const [taxRules,setTaxRules]=useState<StateTaxRule[]>(stateTaxRules);
  const [taxReviewedAt,setTaxReviewedAt]=useState(TAX_REVIEWED_AT);

  const edit=useCallback((field:string) => {gate.current.edit(field);setCustom(c=>({...c,[field]:true}));},[]);
  const setField=useCallback(<K extends keyof Inputs>(field:K,value:Inputs[K]) => {
    edit(field);
    if(field==="monthlyPropertyCosts") propertyCostsCustom.current=true;
    if(field==="homePrice") {
      setInputs(c=>({...c,homePrice:value as number,monthlyPropertyCosts:propertyCostsCustom.current?c.monthlyPropertyCosts:defaultMonthlyPropertyCosts(value as number)}));
      return;
    }
    if(field==="cryptoRate") cryptoCustom.current=true;
    if(field==="baseMortgageRate") {
      edit("cryptoRate");
      setInputs(c=>({...c,baseMortgageRate:value as number,cryptoRate:cryptoCustom.current?c.cryptoRate:(value as number)+1.5}));
    } else setInputs(c=>({...c,[field]:value}));
  },[edit,setInputs]);

  const request=useCallback(async <T,>(source:MarketSource,fields:string[],apply:(data:T,ticket:ReturnType<RequestGate["begin"]>)=>void) => {
    controllers.current[source]?.abort();
    const controller=new AbortController();controllers.current[source]=controller;
    const ticket=gate.current.begin(source,fields);
    setStatus(c=>({...c,[source]:{...c[source],state:"loading"}}));
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(`/api/market-data?source=${source}&refresh=${Date.now()}`,{cache:"no-store",signal:controller.signal});
      if(!response.ok) throw new Error("Unavailable");
      const data=await response.json() as Envelope<T>;
      if(!gate.current.current(ticket)) return;
      apply(data.data,ticket);
      setStatus(c=>({...c,[source]:{...c[source],state:source==="taxes"?"verified":"live",checkedAt:data.checkedAt}}));
    } catch {
      if(gate.current.current(ticket)) setStatus(c=>({...c,[source]:{...c[source],state:"unavailable",checkedAt:new Date().toISOString()}}));
    } finally {clearTimeout(timeout);}
  },[]);

  const loadMortgage=useCallback((term:15|30,initializeIncome=false) => request<Rates>("mortgage",["baseMortgageRate","cryptoRate","grossMonthlyIncome"],(data,ticket)=>{
    if(activeTerm.current!==term) return;
    if(!data?.[term]||!Number.isFinite(data[term].rate)) throw new Error("Invalid rate");
    last.current.rates=data;
    setStatus(c=>({...c,mortgage:{...c.mortgage,asOf:data[term].asOf,value:data[term].rate}}));
    setInputs(c=>{
      if(c.termYears!==term) return c;
      const baseMortgageRate=gate.current.accepts(ticket,"baseMortgageRate")?data[term].rate:c.baseMortgageRate;
      const next={...c,baseMortgageRate,cryptoRate:!cryptoCustom.current&&gate.current.accepts(ticket,"cryptoRate")?baseMortgageRate+1.5:c.cryptoRate};
      if(initializeIncome&&gate.current.accepts(ticket,"grossMonthlyIncome")) next.grossMonthlyIncome=incomeForTargetDti(next);
      return next;
    });
  }),[request,setInputs]);

  const loadAll=useCallback((initializeHoldings:boolean) => {
    void loadMortgage(activeTerm.current,initializeHoldings);
    void request<{price:number;asOf:string}>("bitcoin",["btcPrice","btcQuantity"],(data,ticket)=>{
      if(!Number.isFinite(data?.price)||data.price<=0) throw new Error("Invalid price");
      last.current.bitcoin=data;
      setStatus(c=>({...c,bitcoin:{...c.bitcoin,asOf:data.asOf,value:data.price}}));
      setInputs(c=>{
        if(!gate.current.accepts(ticket,"btcPrice")) return c;
        return {...c,btcPrice:data.price,btcQuantity:initializeHoldings&&gate.current.accepts(ticket,"btcQuantity")?roundBitcoinQuantityUp(DEFAULT_BTC_VALUE/data.price):c.btcQuantity};
      });
    });
    void request<{rules:StateTaxRule[];reviewedAt:string}>("taxes",[],(data)=>{
      if(!Array.isArray(data?.rules)||data.rules.length!==51||new Set(data.rules.map(r=>r.name)).size!==51) throw new Error("Invalid tax table");
      setTaxRules(data.rules);setTaxReviewedAt(data.reviewedAt);
    });
  },[loadMortgage,request,setInputs]);

  const reset=useCallback(()=>{
    for(const source of sources) {controllers.current[source]?.abort();gate.current.invalidate(source);}
    cryptoCustom.current=false;propertyCostsCustom.current=false;activeTerm.current=30;setCustom({});
    const btcPrice=last.current.bitcoin?.price??defaults.btcPrice;
    const baseMortgageRate=last.current.rates?.[30].rate??defaults.baseMortgageRate;
    const restored={...defaults,btcPrice,btcQuantity:roundBitcoinQuantityUp(DEFAULT_BTC_VALUE/btcPrice),baseMortgageRate,cryptoRate:baseMortgageRate+1.5};
    restored.grossMonthlyIncome=incomeForTargetDti(restored);
    setInputs(restored);
    loadAll(true);
  },[loadAll,setInputs]);

  const changeTerm=useCallback((term:15|30)=>{
    activeTerm.current=term;cryptoCustom.current=false;
    setCustom(c=>({...c,baseMortgageRate:false,traditionalRateOverride:false,cryptoRate:false}));
    const rate=last.current.rates?.[term].rate??(term===15?6.04:6.71);
    setInputs(c=>({...c,termYears:term,baseMortgageRate:rate,traditionalRateOverride:null,cryptoRate:rate+1.5}));
    setStatus(c=>({...c,mortgage:{state:"loading",asOf:last.current.rates?.[term].asOf,value:last.current.rates?.[term].rate}}));
    void loadMortgage(term);
  },[loadMortgage,setInputs]);

  useEffect(()=>{
    loadAll(true);
    return ()=>{for(const source of sources) {controllers.current[source]?.abort();gate.current.invalidate(source);}};
  },[loadAll]);
  return {status,custom,taxRules,taxReviewedAt,setField,edit,reset,changeTerm,refreshing:sources.some(s=>status[s].state==="loading")};
}
