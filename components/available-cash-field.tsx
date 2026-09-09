"use client";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { availableCashError } from "@/lib/mortgage-model";
import { dollarNumber, formatDollarDraft } from "@/lib/presentation";

export function AvailableCashField({value,minimum,maximum,onChange}:{value:number;minimum:number;maximum:number;onChange:(value:number)=>void}) {
  const id=useId();
  const [draft,setDraft]=useState<{text:string;value:number;original:number}|null>(null);
  const [rejected,setRejected]=useState("");
  const current=draft?.original===value?draft:null;
  const warning=current?availableCashError(current.value,minimum,maximum):rejected;
  const display=current?.text??(Number.isFinite(value)?dollarNumber.format(value):"");
  const commit=()=>{
    if(!current)return;
    const error=availableCashError(current.value,minimum,maximum);
    setRejected(error);setDraft(null);
    if(!error)onChange(current.value);
  };
  return <label className="field available-cash-field" htmlFor={id}>
    <span className="field-label">Available Cash</span>
    <span className="input-shell"><span className="input-affix input-prefix">$</span>
      <Input id={id} aria-label="Available Cash" className="has-prefix" type="text" inputMode="decimal" value={display}
        aria-invalid={!!warning} aria-describedby={`${id}-hint${warning?` ${id}-warning`:""}`}
        onChange={e=>{const next=formatDollarDraft(e.target.value);if(next){setDraft({...next,original:value});setRejected("");}}}
        onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();}if(e.key==="Escape"){setDraft(null);setRejected("");}}}/>
    </span>
    <span className="field-hint" id={`${id}-hint`}>Minimum ${Number.isFinite(minimum)?dollarNumber.format(minimum):"—"}; maximum ${Number.isFinite(maximum)?dollarNumber.format(maximum):"—"}. The maximum adds 20% of Home Price to the minimum. Changes apply when you leave the field or press Enter.</span>
    {warning&&<span className="cash-warning" id={`${id}-warning`} role="alert">{warning}</span>}
  </label>;
}
