export const dollarNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sum whole satoshis so the total reconciles exactly with the displayed rows.
// Round pledged BTC up to cover the pledge; round storage and purchases down.
export function bitcoinPosition(holdings: number, sold: number, pledged: number, purchased: number) {
  const scaled = (value: number) => {
    const [coefficient, exponent = "0"] = String(Math.max(0,value)).split("e");
    return Number(`${coefficient}e${Number(exponent)+8}`);
  };
  const pledgedSats = Math.ceil(scaled(pledged));
  const coldSats = Math.max(0,Math.round(scaled(holdings))-Math.ceil(scaled(sold))-pledgedSats);
  const purchasedSats = Math.floor(scaled(purchased));
  return {
    pledged: pledgedSats/1e8,
    coldStorage: coldSats/1e8,
    purchased: purchasedSats/1e8,
    total: (pledgedSats+coldSats+purchasedSats)/1e8,
  };
}

// Keep a typed decimal point and fractional zeros while grouping the integer.
export function formatDollarDraft(raw: string) {
  const clean = raw.replace(/[$,\s]/g, "");
  if (!/^-?\d*(?:\.\d{0,2})?$/.test(clean)) return null;
  const [integer, fraction] = clean.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return { text: grouped + (fraction === undefined ? "" : `.${fraction}`), value: clean === "" ? NaN : Number(clean) };
}

export function chartYearTicks(years: number) {
  const ticks = Array.from({length: Math.floor(years / 2) + 1}, (_,n) => n * 2);
  if (ticks.at(-1) !== years) ticks.push(years);
  return ticks;
}

export function chartMonthAtPosition(position: number, left: number, right: number, months: number) {
  return Math.max(0, Math.min(months, Math.round((position-left)/(right-left)*months)));
}
