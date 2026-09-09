import { parsePmms } from "@/lib/market-data";
import { stateTaxRules, TAX_REVIEWED_AT, TAX_YEAR } from "@/lib/state-taxes";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control":"no-store, no-cache, must-revalidate, max-age=0", "CDN-Cache-Control":"no-store", "Pragma":"no-cache" };

async function upstream(url:string,accept="text/html") {
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(8000),headers:{Accept:accept,"Accept-Language":"en-US,en;q=0.9","User-Agent":"Mortgage-Lens/2.0"}});
  if (!response.ok) throw new Error("Source unavailable");
  return response;
}
export async function GET(request:Request) {
  const source=new URL(request.url).searchParams.get("source")??"mortgage";
  try {
    if(source==="taxes") return Response.json({source,status:"verified",data:{rules:stateTaxRules,taxYear:TAX_YEAR,reviewedAt:TAX_REVIEWED_AT},checkedAt:new Date().toISOString()}, {headers});
    if(source==="bitcoin") {
      const response=await upstream("https://api.coinbase.com/v2/prices/BTC-USD/spot","application/json");
      const body=await response.json() as {data?:{amount?:string;currency?:string;base?:string}};
      const price=Number(body.data?.amount);
      if(!Number.isFinite(price)||price<=0||body.data?.currency!=="USD"||body.data?.base!=="BTC") throw new Error("Invalid price");
      const checkedAt=new Date().toISOString();
      return Response.json({source,status:"live",data:{price,asOf:checkedAt},checkedAt},{headers});
    }
    if(source==="mortgage") {
      const response=await upstream("https://www.freddiemac.com/pmms");
      const rates=parsePmms(await response.text());
      return Response.json({source,status:"live",data:rates,checkedAt:new Date().toISOString()},{headers});
    }
    return Response.json({error:"Unknown source"},{status:400,headers});
  } catch {
    return Response.json({source,status:"unavailable",error:"The source did not provide a valid observation. Your last known value remains editable.",checkedAt:new Date().toISOString()},{status:502,headers});
  }
}
