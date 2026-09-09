export type MarketSource = "bitcoin" | "mortgage" | "taxes";
export function cleanHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&reg;|&#174;/gi,"")
    .replace(/&#36;|&dollar;/gi,"$").replace(/\s+/g," ");
}
export function parsePmms(html: string) {
  const text=cleanHtml(html);
  const rateFor=(term:15|30) => {
    const m=text.match(new RegExp(`U\\.S\\. weekly mortgage rate averages as of\\s+([0-9/]+).*?${term}-year Fixed-Rate Mortgage\\s+([0-9.]+)%`,"i"));
    const alt=text.match(new RegExp(`${term}-year fixed-rate mortgage\\s+averaged\\s+([0-9.]+)%\\s+as of\\s+([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`,"i"));
    const rate=m?Number(m[2]):alt?Number(alt[1]):NaN;
    const asOf=m?.[1]??alt?.[2];
    if (!Number.isFinite(rate)||rate<=0||rate>30||!asOf||!Number.isFinite(Date.parse(asOf))) throw new Error(`No valid ${term}-year PMMS observation`);
    return {rate,asOf};
  };
  return {15:rateFor(15),30:rateFor(30)};
}
export class RequestGate {
  private ids: Record<string,number> = {};
  private edits: Record<string,number> = {};
  edit(field:string) { this.edits[field]=(this.edits[field]??0)+1; }
  begin(source:string, fields:string[]) {
    const id=(this.ids[source]??0)+1;this.ids[source]=id;
    return {source,id,edits:Object.fromEntries(fields.map(f=>[f,this.edits[f]??0]))};
  }
  current(ticket:ReturnType<RequestGate["begin"]>) {return this.ids[ticket.source]===ticket.id;}
  accepts(ticket:ReturnType<RequestGate["begin"]>,field:string) {return this.current(ticket)&&(this.edits[field]??0)===ticket.edits[field];}
  invalidate(source:string) {this.ids[source]=(this.ids[source]??0)+1;}
}
