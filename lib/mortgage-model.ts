import { ltvRateAdjustment } from "./mortgage-pricing";
import { estimateStateTax, type TaxContext } from "./state-taxes";

export type Inputs = {
  homePrice: number; downPct: number; availableCash: number | null; extraCashUse: "down-payment" | "bitcoin";
  btcPrice: number; btcQuantity: number; btcCostBasis: number;
  baseMortgageRate: number; traditionalRateOverride: number | null; cryptoRate: number; termYears: 15 | 30; horizonYears: number;
  btcGrowth: number; btcVolatility: number; btcPathSeed: number; homeGrowth: number; federalRate: number; stateRate: number; countyRate: number;
  location: string; stateRules: boolean; otherIncome: number; otherCapitalGains: number; azEligible: boolean;
  otherInvestmentIncome: number; stateAllowance: number; filingStatus: TaxContext["filingStatus"];
  rugProbability: number; inflation: number; discountRate: number;
  traditionalClosing: number; cryptoFirstClosing: number; cryptoSecondClosing: number;
  traditionalEligibleCosts: number; cryptoFirstEligibleCosts: number; cryptoSecondEligibleCosts: number;
  traditionalPoints: number; cryptoFirstPoints: number; cryptoSecondPoints: number;
  coinbaseOne: boolean; traditionalPromo: boolean; creditPct: number; creditCap: number; traditionalOtherCredit: number;
  advanceRate: number; btcSaleFee: number; fundTaxFromBtc: boolean; customSaleBasis: boolean; saleBasis: number;
  exitTaxOverride: boolean; exitFederalRate: number; exitStateRate: number; exitCountyRate: number;
  pmiRate: number; grossMonthlyIncome: number; monthlyOtherDebt: number; monthlyPropertyCosts: number;
  creditScore: number; conformingLimit: number;
  interestDeduction: boolean; acquisitionDebtLimit: number;
  earlyPayoffYear: number; exitAction: "hold" | "sell" | "refinance" | "payoff";
  homeSaleCost: number; homeSaleExclusion: number; homeSaleTaxRate: number; refinanceCost: number;
};

export const DEFAULT_BTC_VALUE = 400000;
// Shift decimal notation rather than multiply: exact satoshi values must not
// acquire an extra satoshi from floating-point multiplication noise.
export function roundBitcoinQuantityUp(value: number) {
  if (!Number.isFinite(value)) return value;
  const [coefficient, exponent = "0"] = String(value).split("e");
  const satoshis = Math.ceil(Number(`${coefficient}e${Number(exponent) + 8}`));
  return Number(`${satoshis}e-8`);
}
export const defaults: Inputs = {
  homePrice: 750000, downPct: 5, availableCash: null, extraCashUse: "bitcoin",
  btcPrice: 77368, btcQuantity: roundBitcoinQuantityUp(DEFAULT_BTC_VALUE / 77368), btcCostBasis: 60000,
  baseMortgageRate: 6.71, traditionalRateOverride: null, cryptoRate: 8.21, termYears: 30, horizonYears: 10,
  btcGrowth: 15, btcVolatility: 15, btcPathSeed: 42, homeGrowth: 3, federalRate: 23.8, stateRate: 0, countyRate: 0,
  location: "", stateRules: true, otherIncome: 0, otherCapitalGains: 0, azEligible: true,
  otherInvestmentIncome: 0, stateAllowance: 0, filingStatus: "single",
  rugProbability: 1, inflation: 3, discountRate: 3,
  traditionalClosing: 10000, cryptoFirstClosing: 10000, cryptoSecondClosing: 2500,
  traditionalEligibleCosts: 10000, cryptoFirstEligibleCosts: 10000, cryptoSecondEligibleCosts: 2500,
  traditionalPoints: 0, cryptoFirstPoints: 0, cryptoSecondPoints: 0,
  coinbaseOne: true, traditionalPromo: true, creditPct: 1, creditCap: 10000, traditionalOtherCredit: 0,
  advanceRate: 40, btcSaleFee: 1, fundTaxFromBtc: true, customSaleBasis: false, saleBasis: 15000,
  exitTaxOverride: false, exitFederalRate: 23.8, exitStateRate: 0, exitCountyRate: 0,
  pmiRate: 0.5, grossMonthlyIncome: 0, monthlyOtherDebt: 0, monthlyPropertyCosts: 0,
  creditScore: 740, conformingLimit: 832750,
  interestDeduction: false, acquisitionDebtLimit: 750000,
  earlyPayoffYear: 0, exitAction: "hold", homeSaleCost: 6, homeSaleExclusion: 250000, homeSaleTaxRate: 23.8, refinanceCost: 2,
};

export function defaultMonthlyPropertyCosts(homePrice: number) {
  return Math.round(homePrice * 0.00084 * 100) / 100;
}

export const FEDERAL_BRACKET_YEAR = 2026;
export const FEDERAL_BRACKET_SOURCE = "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf";
// IRS Revenue Procedure 2025-32, section 4.01. Upper bounds are inclusive.
const federalBracketBounds: Record<Inputs["filingStatus"], readonly number[]> = {
  single: [12400, 50400, 105700, 201775, 256225, 640600],
  joint: [24800, 100800, 211400, 403550, 512450, 768700],
  head: [17700, 67450, 105700, 201750, 256200, 640600],
  separate: [12400, 50400, 105700, 201775, 256225, 384350],
};
export function federalMarginalRate(annualIncome: number, filingStatus: Inputs["filingStatus"]) {
  if (!Number.isFinite(annualIncome)) return NaN;
  const bracket = federalBracketBounds[filingStatus].findIndex(upper => annualIncome <= upper);
  return bracket === -1 ? 37 : [10, 12, 22, 24, 32, 35][bracket];
}
export function interestDeductionAssumption(i: Pick<Inputs, "grossMonthlyIncome" | "otherIncome" | "filingStatus">) {
  // User-selected gross annual income proxy; no standard/itemized deduction is
  // subtracted when choosing the bracket. Keep income and brackets fixed over time.
  const annualIncome = Math.round((i.grossMonthlyIncome * 12 + i.otherIncome) * 100) / 100;
  return { annualIncome, rate: federalMarginalRate(annualIncome, i.filingStatus) };
}

export function incomeForTargetDti(i: Inputs) {
  const funding = fundingPlan(i);
  const first = funding.crypto.firstPrincipal;
  const debt = payment(first + funding.crypto.secondPrincipal, i.cryptoRate, i.termYears) + i.monthlyOtherDebt + i.monthlyPropertyCosts;
  const exact = debt / 0.45;
  const lower = Math.floor(exact * 100) / 100, upper = Math.ceil(exact * 100) / 100;
  return lower > 0 && Math.abs(debt / lower - 0.45) < Math.abs(debt / upper - 0.45) ? lower : upper;
}
defaults.monthlyPropertyCosts = defaultMonthlyPropertyCosts(defaults.homePrice);
defaults.grossMonthlyIncome = incomeForTargetDti(defaults);

export function payment(principal: number, annualRate: number, years: number) {
  if (principal <= 0) return 0;
  const months = years * 12;
  const rate = annualRate / 1200;
  return rate === 0 ? principal / months : principal * rate / (1 - (1 + rate) ** -months);
}

// Prices move linearly within each year, reaching the entered annual return
// at year-end. Each following year starts from the prior year-end price.
export function bitcoinPriceAtMonth(spot: number, annualReturn: number, month: number) {
  const years = Math.floor(month / 12), fraction = (month % 12) / 12;
  return spot * (1 + annualReturn / 100) ** years * (1 + annualReturn / 100 * fraction);
}

// A mean-corrected log Brownian bridge changes purchase prices only. A fixed
// seed keeps comparisons reproducible; both endpoint prices are copied exactly.
export function bitcoinPurchasePricePath(spot: number, growth: number, years: number, volatility: number, seed: number) {
  const months = years * 12;
  const baseline = Array.from({length: months + 1}, (_,m) => bitcoinPriceAtMonth(spot,growth,m));
  if (volatility === 0) return { baseline, prices: [...baseline] };
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return (((x ^ (x >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
  const walk = [0];
  for (let m=1;m<=months;m++) {
    const z = Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
    walk.push(walk[m-1]+z/Math.sqrt(12));
  }
  const sigma = volatility / 100;
  const prices = baseline.map((price,m) => {
    if (m===0 || m===months) return price;
    const time = m/12, bridge = walk[m] - m/months*walk[months];
    const variance = time*(1-time/years);
    return price*Math.exp(sigma*bridge-0.5*sigma*sigma*variance);
  });
  return { baseline, prices };
}

export function balanceAfter(principal: number, annualRate: number, years: number, elapsedMonths: number) {
  if (principal <= 0 || elapsedMonths >= years * 12) return 0;
  const months = Math.max(0, elapsedMonths);
  const rate = annualRate / 1200;
  return rate === 0 ? principal * (1 - months / (years * 12)) : Math.max(0,
    principal * (1 + rate) ** months - payment(principal, annualRate, years) * ((1 + rate) ** months - 1) / rate);
}

export function taxOnGain(gain: number, i: Inputs, atExit = false) {
  if (gain <= 0) return 0;
  if (atExit && i.exitTaxOverride) return gain * (i.exitFederalRate + i.exitStateRate + i.exitCountyRate) / 100;
  return gain * (i.federalRate + i.countyRate) / 100 + estimateStateTax(gain, i);
}

export function validateInputs(i: Inputs) {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(i)) {
    if (typeof value === "number" && !Number.isFinite(value)) errors.push(`Enter a finite number for ${key}.`);
  }
  const range = (value: number, low: number, high: number, label: string) => {
    if (value < low || value > high) errors.push(`${label} must be between ${low.toLocaleString()} and ${high.toLocaleString()}.`);
  };
  range(i.homePrice, 1, 100000000, "Home Price");
  range(i.downPct, 5, 100, "Traditional Down Payment %");
  if (!["down-payment", "bitcoin"].includes(i.extraCashUse)) errors.push("Choose how to apply extra cash.");
  range(i.btcPrice, 0.01, 1000000000, "Current Bitcoin Price");
  range(i.btcQuantity, 0, 21000000, "Starting Bitcoin Quantity");
  range(i.btcCostBasis, 0, 1e12, "Bitcoin Cost Basis");
  range(i.baseMortgageRate, 0, 50, "20% Down Base Rate");
  if (i.traditionalRateOverride !== null) range(i.traditionalRateOverride, 0, 50, "Traditional Rate");
  range(i.cryptoRate, 0, 50, "Bitcoin Collateralized Rate");
  if (![15, 30].includes(i.termYears)) errors.push("Choose a 15- or 30-year loan term.");
  range(i.horizonYears, 1, 50, "Comparison Period");
  if (!Number.isInteger(i.horizonYears)) errors.push("Comparison Period must be a whole number of years.");
  for (const [v, label] of [[i.btcGrowth, "Bitcoin Annual Return"], [i.homeGrowth, "Home Appreciation"], [i.inflation, "Inflation"], [i.discountRate, "Discount Rate"]] as const) range(v, -99, 200, label);
  for (const [v, label] of [[i.federalRate,"Federal Rate"], [i.stateRate,"State Rate"], [i.countyRate,"County / Local Rate"], [i.exitFederalRate,"Exit Federal Rate"], [i.exitStateRate,"Exit State Rate"], [i.exitCountyRate,"Exit County / Local Rate"]] as const) range(v,0,60,label);
  if (i.federalRate + i.stateRate + i.countyRate > 80 || i.exitFederalRate + i.exitStateRate + i.exitCountyRate > 80) errors.push("Combined tax assumptions must not exceed 80%.");
  range(i.rugProbability,0,100,"Coinbase Rug or 6102 Attack Probability %");
  range(i.advanceRate,0,100,"BTC Advance Rate");
  range(i.btcSaleFee,0,10,"BTC Sale Fee");
  range(i.pmiRate,0,10,"Annual PMI Rate");
  range(i.creditPct,0,10,"Promotional Credit Rate");
  range(i.btcVolatility,0,200,"Bitcoin Annualized Volatility %");
  range(i.btcPathSeed,1,2147483647,"Price Path Number");
  if (!Number.isInteger(i.btcPathSeed)) errors.push("Price Path Number must be a whole number.");
  range(i.homeSaleCost,0,25,"Home Sale Costs");
  range(i.homeSaleTaxRate,0,80,"Home Sale Tax Rate");
  range(i.refinanceCost,0,25,"Refinance Costs");
  range(i.earlyPayoffYear,0,Math.min(i.termYears,i.horizonYears),"Early Payoff Year");
  if (!Number.isInteger(i.earlyPayoffYear)) errors.push("Early Payoff Year must be a whole number, or zero to disable.");
  range(i.creditScore,300,850,"Credit Score");
  for (const key of ["traditionalClosing","cryptoFirstClosing","cryptoSecondClosing","traditionalEligibleCosts","cryptoFirstEligibleCosts","cryptoSecondEligibleCosts","traditionalOtherCredit","creditCap","otherIncome","otherCapitalGains","otherInvestmentIncome","stateAllowance","grossMonthlyIncome","monthlyOtherDebt","monthlyPropertyCosts","conformingLimit","acquisitionDebtLimit","homeSaleExclusion","saleBasis"] as const) {
    if (i[key] < 0) errors.push(`${key.replace(/([A-Z])/g," $1")} cannot be negative.`);
  }
  for (const key of ["traditionalPoints","cryptoFirstPoints","cryptoSecondPoints"] as const) range(i[key],0,20,"Loan Points");
  if (i.customSaleBasis && i.saleBasis > i.btcCostBasis) errors.push("The basis allocated to BTC sold cannot exceed total Bitcoin Cost Basis.");
  return errors;
}

export function promotionalCredits(first: number, second: number, firstEligible: number, secondEligible: number, pct: number, cap: number) {
  const firstCredit = Math.min(first * pct / 100, firstEligible, cap);
  const secondCredit = Math.min(second * pct / 100, secondEligible, Math.max(0, cap - firstCredit));
  return { first: firstCredit, second: secondCredit, total: firstCredit + secondCredit };
}

function loanSchedule(principals: number[], rate: number, i: Inputs, chargePmi: boolean) {
  const balances = [...principals];
  const payments = principals.map((p) => payment(p, rate, i.termYears));
  const deductionRate = i.interestDeduction ? interestDeductionAssumption(i).rate : 0;
  const rows: { outflow: number; payment: number; interest: number; pmi: number; deduction: number; payoff: number }[] = [];
  for (let month = 1; month <= i.horizonYears * 12; month++) {
    const startTotal = balances.reduce((a,b) => a+b,0);
    const pmi = chargePmi && principals[0] > i.homePrice * 0.8 && balances[0] > i.homePrice * 0.78 + 0.01 ? balances[0] * i.pmiRate / 1200 : 0;
    let monthlyPayment = 0, interest = 0, payoff = 0;
    for (let loan = 0; loan < balances.length; loan++) {
      if (balances[loan] < 0.000001) { balances[loan] = 0; continue; }
      const monthlyInterest = balances[loan] * rate / 1200;
      const paid = Math.min(payments[loan], balances[loan] + monthlyInterest);
      balances[loan] = Math.max(0, balances[loan] + monthlyInterest - paid);
      monthlyPayment += paid;
      interest += monthlyInterest;
      if (i.earlyPayoffYear > 0 && month === i.earlyPayoffYear * 12) {
        payoff += balances[loan]; balances[loan] = 0;
      }
    }
    const deduction = i.interestDeduction && startTotal > 0 ? interest * Math.min(1, i.acquisitionDebtLimit / startTotal) * deductionRate / 100 : 0;
    rows.push({ payment: monthlyPayment, interest, pmi, deduction, payoff, outflow: monthlyPayment + pmi + payoff - deduction });
  }
  const sum = (key: keyof typeof rows[number]) => rows.reduce((value,row) => value + row[key],0);
  return { rows, balance: balances.reduce((a,b) => a+b,0), interest: sum("interest"), pmi: sum("pmi"), payments: sum("payment"), deduction: sum("deduction"), payoff: sum("payoff"), firstMonthly: payments.reduce((a,b) => a+b,0) };
}

function saleForDownPayment(amount: number, i: Inputs) {
  const btcValue = i.btcQuantity * i.btcPrice, feeFactor = 1 - i.btcSaleFee / 100;
  const basis = (gross: number) => i.customSaleBasis ? (gross > 0 ? i.saleBasis : 0) : btcValue > 0 ? i.btcCostBasis * gross / btcValue : 0;
  const tax = (gross: number) => taxOnGain(Math.max(0, gross * feeFactor - basis(gross)), i);
  let btcSold = amount / feeFactor;
  if (i.fundTaxFromBtc && amount > 0) for (let n = 0; n < 500; n++) {
    const next = (amount + tax(btcSold)) / feeFactor;
    if (Math.abs(next - btcSold) < 0.000001) { btcSold = next; break; }
    btcSold = next;
  }
  return { btcSold, saleFees: btcSold * i.btcSaleFee / 100, saleTax: tax(btcSold), saleBasis: basis(btcSold) };
}

function traditionalFunding(i: Inputs, cashDown: number) {
  const target = i.homePrice * i.downPct / 100;
  const firstPrincipal = Math.max(0, i.homePrice - target - cashDown);
  // Cash first reduces the original mortgage. Once it reaches zero, sell less
  // BTC instead of creating a negative loan or buying BTC in down-payment mode.
  const btcDownPayment = Math.min(target, Math.max(0, i.homePrice - cashDown));
  const sale = saleForDownPayment(btcDownPayment, i);
  const closing = i.traditionalClosing + firstPrincipal * i.traditionalPoints / 100;
  const promoOn = i.coinbaseOne && i.traditionalPromo && firstPrincipal > 0;
  const promo = promoOn ? promotionalCredits(firstPrincipal,0,Math.min(i.traditionalEligibleCosts,closing),0,i.creditPct,i.creditCap).total : 0;
  const otherCredit = promoOn ? 0 : Math.min(i.traditionalOtherCredit,closing);
  const credit = promo + otherCredit;
  const cost = closing - credit + (i.fundTaxFromBtc ? 0 : sale.saleTax);
  return { cashDown, firstPrincipal, btcDownPayment, sale, closing, promo, otherCredit, credit, cost, upfront: cashDown + cost };
}

function collateralizedFunding(i: Inputs, cashDown: number) {
  // The traditional down-payment selector never changes the Bitcoin structure.
  // Extra cash exclusively reduces the BTC-backed second loan and its pledge.
  const firstPrincipal = i.homePrice * 0.8;
  const secondPrincipal = Math.max(0, i.homePrice * 0.2 - cashDown);
  const firstClosing = i.cryptoFirstClosing + firstPrincipal * i.cryptoFirstPoints / 100;
  const secondClosing = secondPrincipal > 0 ? i.cryptoSecondClosing + secondPrincipal * i.cryptoSecondPoints / 100 : 0;
  const creditParts = i.coinbaseOne && firstPrincipal + secondPrincipal > 0
    ? promotionalCredits(firstPrincipal,secondPrincipal,Math.min(i.cryptoFirstEligibleCosts,firstClosing),Math.min(i.cryptoSecondEligibleCosts,secondClosing),i.creditPct,i.creditCap)
    : { first:0, second:0, total:0 };
  const cost = firstClosing + secondClosing - creditParts.total;
  return { cashDown, firstPrincipal, secondPrincipal, firstClosing, secondClosing, creditParts, cost, upfront: cashDown + cost };
}

export function minimumAvailableCash(i: Inputs) {
  // The floor excludes optional extra down payments, avoiding a circular
  // minimum that rises whenever the user enters a larger cash budget.
  const amount = Math.max(traditionalFunding(i,0).cost,collateralizedFunding(i,0).cost);
  return Math.ceil(Number(`${amount.toFixed(8)}e2`)) / 100;
}

export function availableCashBounds(i: Inputs) {
  const minimumCash = minimumAvailableCash(i);
  // Both bounds use required costs before optional extra down payments, so
  // selecting a larger budget cannot increase its own ceiling.
  const maximumCash = Number((minimumCash + i.homePrice * 0.2).toFixed(2));
  return { minimumCash, maximumCash };
}

export function availableCashError(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return "Enter an Available Cash amount";
  if (value < minimum) return "Available Cash cannot be below Total Up Front Cost";
  if (value > maximum) return "Available Cash cannot be above Total Up Front Cost plus 20% of Home Price";
  return "";
}

function cashDownFromBudget<T extends {cost: number; upfront: number}>(budget: number, homePrice: number, evaluate: (cash: number) => T) {
  // Reprice credits, points, and the sale-tax reserve as loan balances change.
  // Starting from the full cash budget also handles a fully paid first loan.
  let cash = Math.min(budget,homePrice);
  for (let n = 0; n < 100; n++) {
    const next = Math.max(0,Math.min(homePrice,budget-evaluate(cash).cost));
    if (Math.abs(next-cash) < 0.0000001) return evaluate(next);
    cash = next;
  }
  let low = 0, high = Math.min(budget,homePrice);
  for (let n = 0; n < 60; n++) {
    const mid = (low+high)/2;
    if (evaluate(mid).upfront <= budget) low = mid; else high = mid;
  }
  return evaluate(low);
}

export function fundingPlan(i: Inputs) {
  const { minimumCash, maximumCash } = availableCashBounds(i), availableCash = i.availableCash ?? minimumCash;
  const extraDown = i.extraCashUse === "down-payment" && Number.isFinite(availableCash);
  const trad = extraDown ? cashDownFromBudget(availableCash,i.homePrice,cash=>traditionalFunding(i,cash)) : traditionalFunding(i,0);
  const crypto = extraDown ? cashDownFromBudget(availableCash,i.homePrice*0.2,cash=>collateralizedFunding(i,cash)) : collateralizedFunding(i,0);
  return { minimumCash, maximumCash, availableCash, trad, crypto };
}

export function traditionalRateAssumption(i: Inputs, firstPrincipal = fundingPlan(i).trad.firstPrincipal) {
  const oltv = firstPrincipal / i.homePrice * 100;
  const adjustment = ltvRateAdjustment(oltv, i.termYears, i.creditScore);
  const automaticRate = Math.max(0, Math.round((i.baseMortgageRate + adjustment.percentagePoints) * 1e6) / 1e6);
  return { ...adjustment, oltv, baseRate: i.baseMortgageRate, automaticRate,
    rate: i.traditionalRateOverride ?? automaticRate, overridden: i.traditionalRateOverride !== null };
}

export function calculate(i: Inputs, growthOverride?: number) {
  const errors = validateInputs(i);
  const warnings: string[] = [];
  if (errors.length) return { errors, warnings, result: null };
  const btcValue = i.btcQuantity * i.btcPrice;
  const plan = fundingPlan(i);
  const { minimumCash, maximumCash, availableCash: sharedStartingCash, trad, crypto } = plan;
  const cashError = availableCashError(sharedStartingCash, minimumCash, maximumCash);
  if (cashError) return { errors: [...errors, cashError], warnings, result: null };
  const downPayment = i.homePrice * i.downPct / 100;
  const firstPrincipal = trad.firstPrincipal, cryptoFirstPrincipal = crypto.firstPrincipal;
  const financedDown = crypto.secondPrincipal, cryptoPrincipal = cryptoFirstPrincipal + financedDown;
  const pledged = financedDown > 0 && i.advanceRate > 0 ? financedDown / (i.advanceRate / 100) : 0;
  const feeFactor = 1 - i.btcSaleFee / 100;
  const { btcSold, saleFees, saleTax, saleBasis } = trad.sale;
  const tradBtcDownPayment = trad.btcDownPayment;
  if (financedDown > 0 && i.advanceRate === 0) errors.push("BTC Advance Rate must be positive when a down-payment loan is needed.");
  if (Math.abs(btcSold - saleFees - (i.fundTaxFromBtc ? saleTax : 0) - tradBtcDownPayment) > 0.01) errors.push("The BTC sale cannot fund the requested down payment and tax under these assumptions.");
  if (btcSold > btcValue + 0.01) errors.push("Traditional: Bitcoin holdings are insufficient to fund the sale, fees, and any BTC-funded tax.");
  if (pledged > btcValue + 0.01) errors.push("Bitcoin Collateralized: Bitcoin holdings are insufficient for the required pledge.");
  if (saleBasis > i.btcCostBasis + 0.01) errors.push("Traditional: the allocated sale basis exceeds total Bitcoin Cost Basis.");
  const tradClosing = trad.closing, cryptoFirstClosing = crypto.firstClosing, cryptoSecondClosing = crypto.secondClosing;
  const tradPromo = trad.promo, tradOtherCredit = trad.otherCredit, tradCredit = trad.credit;
  const cryptoCredit = crypto.creditParts.total, cryptoCreditParts = crypto.creditParts;
  const tradCashDown = trad.cashDown, cryptoCashDown = crypto.cashDown;
  const tradAdditionalCash = tradCashDown + trad.closing - trad.credit;
  const cryptoAdditionalCash = cryptoCashDown + crypto.firstClosing + crypto.secondClosing - cryptoCredit;
  const tradOutsideTax = i.fundTaxFromBtc ? 0 : saleTax;
  const tradUpfront = tradAdditionalCash + tradOutsideTax, cryptoUpfront = cryptoAdditionalCash;
  const traditionalPricing = traditionalRateAssumption(i, firstPrincipal);
  const tradSchedule = loanSchedule([firstPrincipal],traditionalPricing.rate,i,true);
  const cryptoSchedule = loanSchedule([cryptoFirstPrincipal,financedDown],i.cryptoRate,i,false);
  const tradUpfrontBtcBudget = i.extraCashUse === "bitcoin" ? Math.max(0,sharedStartingCash - tradUpfront) : 0;
  const cryptoUpfrontBtcBudget = i.extraCashUse === "bitcoin" ? Math.max(0,sharedStartingCash - cryptoUpfront) : 0;
  // Once a permitted loan paydown is complete, preserve leftover cash at face
  // value. It cannot reduce the Bitcoin first mortgage or silently disappear.
  const tradUnspentCash = i.extraCashUse === "down-payment" ? Math.max(0,sharedStartingCash-tradUpfront) : 0;
  const cryptoUnspentCash = i.extraCashUse === "down-payment" ? Math.max(0,sharedStartingCash-cryptoUpfront) : 0;
  const annualBtcReturn = growthOverride ?? i.btcGrowth;
  const purchasePath = bitcoinPurchasePricePath(i.btcPrice, annualBtcReturn, i.horizonYears, i.btcVolatility, i.btcPathSeed);
  let tradPurchasedBtc = tradUpfrontBtcBudget / i.btcPrice, cryptoPurchasedBtc = cryptoUpfrontBtcBudget / i.btcPrice;
  let tradPurchaseBasis = tradUpfrontBtcBudget, cryptoPurchaseBasis = cryptoUpfrontBtcBudget;
  let commonBudgetTotal = 0, peakBudget = 0;
  for (let month = 0; month < tradSchedule.rows.length; month++) {
    const tradRow = tradSchedule.rows[month], cryptoRow = cryptoSchedule.rows[month];
    const a = tradRow.outflow, b = cryptoRow.outflow;
    const paymentDifference = cryptoRow.payment + cryptoRow.pmi - tradRow.payment - tradRow.pmi;
    // Preserve the common budget, including optional deduction and payoff
    // differences. All unspent dollars buy BTC; no cash investment remains.
    const budget = Math.max(a + Math.max(0,paymentDifference), b + Math.max(0,-paymentDifference), 0);
    const tradBuy = budget - a, cryptoBuy = budget - b;
    const price = purchasePath.prices[month + 1];
    tradPurchasedBtc += tradBuy / price;
    cryptoPurchasedBtc += cryptoBuy / price;
    tradPurchaseBasis += tradBuy;
    cryptoPurchaseBasis += cryptoBuy;
    commonBudgetTotal += budget;
    peakBudget = Math.max(peakBudget,budget);
  }
  const terminalBtcPrice = bitcoinPriceAtMonth(i.btcPrice, annualBtcReturn, i.horizonYears * 12);
  const btcFactor = terminalBtcPrice / i.btcPrice;
  const tradRemainingValue = Math.max(0,btcValue - btcSold);
  const tradRemainingBasis = Math.max(0,i.btcCostBasis - saleBasis);
  const tradBtcFuture = tradRemainingValue * btcFactor + tradPurchasedBtc * terminalBtcPrice;
  const cryptoBtcFuture = btcValue * btcFactor + cryptoPurchasedBtc * terminalBtcPrice;
  const tradExitProceeds = tradBtcFuture * feeFactor;
  const cryptoExitProceeds = cryptoBtcFuture * feeFactor;
  const tradExitTax = taxOnGain(Math.max(0,tradExitProceeds - tradRemainingBasis - tradPurchaseBasis),i,true);
  const cryptoExitTax = taxOnGain(Math.max(0,cryptoExitProceeds - i.btcCostBasis - cryptoPurchaseBasis),i,true);
  const tradBtcAfterTax = tradExitProceeds - tradExitTax;
  const cryptoBtcSurvival = cryptoExitProceeds - cryptoExitTax;
  const unpledgedFraction = btcValue > 0 ? Math.max(0,1 - pledged / btcValue) : 0;
  const failureProceeds = (btcValue * btcFactor * unpledgedFraction + cryptoPurchasedBtc * terminalBtcPrice) * feeFactor;
  const failureTax = taxOnGain(Math.max(0,failureProceeds - i.btcCostBasis * unpledgedFraction - cryptoPurchaseBasis),i,true);
  const cryptoBtcFailure = failureProceeds - failureTax;
  const probability = pledged > 0 ? i.rugProbability / 100 : 0;
  const cryptoBtcExpected = (1-probability)*cryptoBtcSurvival + probability*cryptoBtcFailure;
  const homeValue = i.homePrice * (1+i.homeGrowth/100) ** i.horizonYears;
  const homeSaleCosts = i.exitAction === "sell" ? homeValue * i.homeSaleCost / 100 : 0;
  const homeSaleTax = i.exitAction === "sell" ? Math.max(0,homeValue-homeSaleCosts-i.homePrice-i.homeSaleExclusion)*i.homeSaleTaxRate/100 : 0;
  const tradExitCost = homeSaleCosts + homeSaleTax + (i.exitAction === "refinance" ? tradSchedule.balance*i.refinanceCost/100 : 0);
  const cryptoExitCost = homeSaleCosts + homeSaleTax + (i.exitAction === "refinance" ? cryptoSchedule.balance*i.refinanceCost/100 : 0);
  const tradEquity = homeValue - tradSchedule.balance - tradExitCost;
  const cryptoEquity = homeValue - cryptoSchedule.balance - cryptoExitCost;
  const tradWealth = tradEquity + tradBtcAfterTax + tradUnspentCash;
  const cryptoWealthSurvival = cryptoEquity + cryptoBtcSurvival + cryptoUnspentCash;
  const cryptoWealthFailure = cryptoEquity + cryptoBtcFailure + cryptoUnspentCash;
  const cryptoWealth = (1-probability)*cryptoWealthSurvival + probability*cryptoWealthFailure;
  const advantage = cryptoWealth - tradWealth;
  const initialTradPmi = tradSchedule.rows[0]?.pmi ?? 0;
  const initialCryptoPmi = cryptoSchedule.rows[0]?.pmi ?? 0;
  const tradDti = i.grossMonthlyIncome > 0 ? Number(((tradSchedule.firstMonthly + initialTradPmi + i.monthlyOtherDebt + i.monthlyPropertyCosts) / i.grossMonthlyIncome * 100).toFixed(3)) : null;
  const cryptoDti = i.grossMonthlyIncome > 0 ? Number(((cryptoSchedule.firstMonthly + initialCryptoPmi + i.monthlyOtherDebt + i.monthlyPropertyCosts) / i.grossMonthlyIncome * 100).toFixed(3)) : null;
  if (!i.location) warnings.push("Select Location or enter a state tax assumption; state tax is currently modeled at the entered rate.");
  if (Math.max(firstPrincipal,cryptoFirstPrincipal) > i.conformingLimit) warnings.push("The first mortgage exceeds the entered conforming-loan limit. Replace the PMMS benchmark with an applicable quote.");
  if (i.creditScore < 680 && financedDown > 0) warnings.push("The entered credit score is below the published 680 minimum for the Bitcoin collateralized program.");
  if (initialTradPmi > 0) warnings.push("Traditional: the entered PMI assumption applies while scheduled loan-to-value exceeds the modeled cancellation threshold. Bitcoin Collateralized has no PMI.");
  if (i.advanceRate !== 40 && financedDown > 0) warnings.push("The entered BTC advance rate differs from the published 40% program assumption.");
  if (i.earlyPayoffYear > 0) warnings.push("Early payoff assumes both alternatives can fund a lump sum from the same household budget; the other option invests any unused amount.");
  if (i.location === "Washington" && i.stateRules) warnings.push("Washington's deduction uses the latest verified 2025 amount provisionally. Update the editable allowance when a 2026 amount is confirmed.");
  const eligibilityUnconfirmed = Math.max(firstPrincipal,cryptoFirstPrincipal) > i.conformingLimit || (financedDown > 0 && i.creditScore < 680);
  return { errors, warnings, result: {
    feasible: errors.length === 0, eligibilityUnconfirmed, traditionalPricing, btcValue, downPayment, financedDown, firstPrincipal, cryptoFirstPrincipal, cryptoPrincipal, pledged,
    minimumCash, maximumCash, tradCashDown, cryptoCashDown, tradBtcDownPayment,
    btcSold, btcSoldQuantity: btcSold/i.btcPrice, saleBasis, saleFees, saleTax, tradOutsideTax,
    tradClosing, cryptoFirstClosing, cryptoSecondClosing, tradPromo, tradOtherCredit, tradCredit, cryptoCredit, cryptoCreditParts,
    tradNetCredit:tradCredit, cryptoNetCredit:cryptoCredit,
    tradAdditionalCash, cryptoAdditionalCash, tradUpfront, cryptoUpfront, sharedStartingCash,
    purchasePath, tradPurchasedBtc, cryptoPurchasedBtc, tradPurchaseBasis, cryptoPurchaseBasis, terminalBtcPrice,
    tradAfterTaxBtcQuantity: tradBtcAfterTax / terminalBtcPrice, cryptoAfterTaxBtcQuantity: cryptoBtcExpected / terminalBtcPrice,
    tradUpfrontBtcBudget, cryptoUpfrontBtcBudget, tradUnspentCash, cryptoUnspentCash, commonBudgetTotal, peakBudget, tradSchedule, cryptoSchedule,
    tradTotalMonthlyPayment: tradSchedule.firstMonthly + initialTradPmi + i.monthlyPropertyCosts,
    cryptoTotalMonthlyPayment: cryptoSchedule.firstMonthly + initialCryptoPmi + i.monthlyPropertyCosts,
    monthlyDifference:cryptoSchedule.firstMonthly + initialCryptoPmi - tradSchedule.firstMonthly - initialTradPmi,
    tradBtcFuture, cryptoBtcFuture, tradExitTax, cryptoExitTax, tradBtcAfterTax, cryptoBtcSurvival, cryptoBtcFailure, cryptoBtcExpected,
    expectedCustodyLoss:cryptoBtcSurvival-cryptoBtcExpected, probability,
    homeValue, homeSaleCosts, homeSaleTax, tradExitCost, cryptoExitCost, tradEquity, cryptoEquity,
    tradWealth, cryptoWealth, cryptoWealthSurvival, cryptoWealthFailure, advantage,
    realTradWealth:tradWealth/(1+i.inflation/100)**i.horizonYears, realCryptoWealth:cryptoWealth/(1+i.inflation/100)**i.horizonYears,
    presentValueDifference:advantage/(1+i.discountRate/100)**i.horizonYears,
    tradDti, cryptoDti, collateralReleaseYear:i.earlyPayoffYear || i.termYears,
  } };
}

export function breakEvenReturns(i: Inputs) {
  const initial = calculate(i);
  if (!initial.result?.feasible || initial.result.financedDown === 0) return [];
  const grid = [-99,-75,-50,-25,-10,0,5,10,15,20,30,50,100,200];
  const roots: number[] = [];
  let low = grid[0], lowValue = calculate(i,low).result!.advantage;
  for (const highEnd of grid.slice(1)) {
    const highValue = calculate(i,highEnd).result!.advantage;
    if (lowValue === 0) roots.push(low);
    if (lowValue * highValue < 0) {
      let left = low, right = highEnd, leftValue = lowValue;
      for (let n=0;n<45;n++) {
        const mid=(left+right)/2, value=calculate(i,mid).result!.advantage;
        if (leftValue*value<=0) right=mid; else {left=mid;leftValue=value;}
      }
      const candidate = (left+right)/2;
      // A tax cliff is not a true zero; report only a verified crossover.
      if (Math.abs(calculate(i,candidate).result!.advantage)<0.1) roots.push(candidate);
    }
    low=highEnd;lowValue=highValue;
  }
  return roots;
}
