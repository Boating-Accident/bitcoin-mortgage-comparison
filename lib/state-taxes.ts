// Reviewed statutory planning defaults for long-term gains on personally held BTC.
// Rates are top base rates after broad percentage exclusions, NOT a full return calculator.
export const TAX_REVIEWED_AT = "2026-09-06";
export const TAX_YEAR = 2026;
export type StateTaxRule = { name: string; rate: number; source: string; note: string; allowance?: number; extraSource?: string };
const plain = "Top base planning rate. Ordinary income brackets, personal deductions, and credits are not calculated; edit for your situation.";
const zero = "No state tax on personally held investment Bitcoin gains.";
export const stateTaxRules: StateTaxRule[] = [
  { name: "Alabama", rate: 5, source: "https://www.revenue.alabama.gov/tax-types/individual-income-tax/", note: `${plain} Any allowable federal-income-tax deduction is not modeled.` },
  { name: "Alaska", rate: 0, source: "https://tax.alaska.gov/", note: zero },
  { name: "Arizona", rate: 1.875, source: "https://www.azleg.gov/ars/43/01022.htm", note: "2.5% × 75% inclusion for eligible assets acquired after December 31, 2011. Disable eligibility below for older assets." },
  { name: "Arkansas", rate: 1.85, source: "https://www.dfa.arkansas.gov/wp-content/uploads/AR1000CRES_CompEstimatedTaxVouchers_2026_1.pdf", extraSource: "https://www.dfa.arkansas.gov/office/taxes/income-tax-administration/individual-income-tax/forms/", note: "2026 top rate 3.7% × 50% inclusion. Rules mode also excludes annual net capital gain above $10 million." },
  { name: "California", rate: 12.3, source: "https://www.ftb.ca.gov/about-ftb/data-reports-plans/Summary-of-Federal-Income-Tax-Changes/index.html", note: "Top base rate 12.3%; rules mode adds the 1% surcharge on taxable income above $1 million." },
  { name: "Colorado", rate: 4.4, source: "https://tax.colorado.gov/individual-income-tax-guide", note: "4.4% statutory rate; a subsequently certified temporary TABOR adjustment may change the final tax-year rate. Ordinary BTC does not receive the qualifying-property capital-gain subtraction." },
  { name: "Connecticut", rate: 6.99, source: "https://portal.ct.gov/drs/individuals/resident-income-tax/tax-information", note: `${plain} Recapture and credit phaseouts are not modeled.` },
  { name: "Delaware", rate: 6.6, source: "https://revenue.delaware.gov/frequently-asked-questions/personal-income-tax-faqs/", note: plain },
  { name: "District of Columbia", rate: 10.75, source: "https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates", note: plain },
  { name: "Florida", rate: 0, source: "https://floridarevenue.com/faq/pages/faqsearch.aspx?cat=4&keywords=&subcat=39", note: zero },
  { name: "Georgia", rate: 4.99, source: "https://dor.georgia.gov/taxes/important-tax-updates", note: "2026 individual income-tax rate. No broad exclusion for ordinary investment BTC gains." },
  { name: "Hawaii", rate: 7.25, source: "https://files.hawaii.gov/tax/forms/current/n11ins.pdf", note: "Maximum rate on qualifying long-term capital gains; lower ordinary brackets can produce less tax." },
  { name: "Idaho", rate: 5.3, source: "https://tax.idaho.gov/taxes/income-tax/individual-income/online-guide/", extraSource: "https://tax.idaho.gov/taxes/income-tax/individual-income/popular-credits-and-deductions/capital-gains/", note: "5.3% rate. The qualifying Idaho-property deduction is not applied to ordinary investment BTC." },
  { name: "Illinois", rate: 4.95, source: "https://tax.illinois.gov/research/taxrates/income.html", note: "4.95% flat rate; personal exemptions and credits not modeled." },
  { name: "Indiana", rate: 2.95, source: "https://www.in.gov/dor/resources/tax-rates-and-reports/rates-fees-and-penalties/", note: "2026 state rate; enter any applicable county rate separately." },
  { name: "Iowa", rate: 3.8, source: "https://revenue.iowa.gov/press-release/2025-10-21/idr-announces-2026-individual-income-tax-and-interest-rates", note: "2026 flat rate; limited business/farm capital-gain deductions are not applied to ordinary investment BTC." },
  { name: "Kansas", rate: 5.58, source: "https://www.ksrevenue.gov/pdf/k-40es26.pdf", note: plain },
  { name: "Kentucky", rate: 3.5, source: "https://revenue.ky.gov/Software-Developer/Pages/default.aspx", note: "2026 flat individual rate." },
  { name: "Louisiana", rate: 3, source: "https://revenue.louisiana.gov/tax-education-and-faqs/faqs/income-tax-reform/what-are-the-individual-income-tax-rates-and-brackets/", note: "3% flat individual rate effective from 2025." },
  { name: "Maine", rate: 7.15, source: "https://www.maine.gov/revenue/taxes/income-estate-tax/individual-income-tax-1040me", extraSource: "https://legislature.maine.gov/doc/12536", note: "Top base 7.15%. Rules mode adds the 2026 2% surcharge above $1 million single, $1.5 million joint/head, or $750,000 separate." },
  { name: "Maryland", rate: 6.5, source: "https://services.marylandcomptroller.gov/taxes?id=kb_article_view&sysparm_article=KB0010014", extraSource: "https://services.marylandcomptroller.gov/taxes?id=kb_article_view&sysparm_article=KB0010023", note: "Top base 6.5%. Rules mode adds 2% on applicable net capital gains when federal AGI exceeds $350,000. County tax is separate." },
  { name: "Massachusetts", rate: 5, source: "https://www.mass.gov/info-details/massachusetts-tax-rates", extraSource: "https://www.mass.gov/info-details/massachusetts-4-surtax-on-taxable-income", note: "5% long-term rate; rules mode adds 4% on taxable income above the 2026 $1,107,750 threshold." },
  { name: "Michigan", rate: 4.25, source: "https://www.michigan.gov/treasury/news/2026/04/15/state-individual-income-tax-rate-for-2026-tax-year-determined", note: "Confirmed 2026 rate. Enter any applicable local tax separately." },
  { name: "Minnesota", rate: 9.85, source: "https://www.revenue.state.mn.us/minnesota-income-tax-rates-and-brackets", extraSource: "https://www.revenue.state.mn.us/net-investment-income-tax-niit", note: "Top base 9.85%. Rules mode adds the state's 1% NIIT on annual net investment income above $1 million." },
  { name: "Mississippi", rate: 4, source: "https://www.dor.ms.gov/general-information", note: "2026 rate on taxable income above $10,000. The ordinary-income exemption and personal deductions are not applied by this marginal planning model." },
  { name: "Missouri", rate: 0, source: "https://dor.mo.gov/news/newsitem/uuid/15044650-59dd-48f4-975a-01988d485255", note: "Full individual capital-gain subtraction, including qualifying cryptocurrency gains." },
  { name: "Montana", rate: 4.1, source: "https://revenue.mt.gov/news/recent-news/HB-337", note: "Top long-term rate is 4.1%; the lower long-term bracket is 3%. Edit the planning rate if applicable." },
  { name: "Nebraska", rate: 4.55, source: "https://revenue.nebraska.gov/about/2023-nebraska-legislative-changes", note: "2026 top individual rate. Future scheduled changes are not projected automatically." },
  { name: "Nevada", rate: 0, source: "https://tax.nv.gov/", note: zero },
  { name: "New Hampshire", rate: 0, source: "https://www.revenue.nh.gov/taxes-glance/interest-dividends-tax", note: "No state individual capital-gains tax. Interest and dividends tax was repealed for periods beginning after 2024." },
  { name: "New Jersey", rate: 10.75, source: "https://www.nj.gov/treasury/taxation/taxtables.shtml", note: plain },
  { name: "New Mexico", rate: 5.9, allowance: 2500, source: "https://www.nmlegis.gov/sessions/24%20Regular/bills/house/HB0252TRS.HTML", note: "Top rate 5.9%; rules mode applies up to $2,500 annual net-capital-gain deduction. The larger qualifying business deduction is not applied to BTC." },
  { name: "New York", rate: 10.9, source: "https://www.tax.ny.gov/pit/file/tax-tables/", note: `${plain} Local taxes and tax-benefit recapture are not automatically calculated.` },
  { name: "North Carolina", rate: 3.99, source: "https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules", note: "2026 flat individual rate." },
  { name: "North Dakota", rate: 1.5, source: "https://www.tax.nd.gov/individual-income-tax", extraSource: "https://www.tax.nd.gov/individual-income-tax-history", note: "Top 2.5% rate × 60% inclusion after the 40% net long-term gain exclusion." },
  { name: "Ohio", rate: 2.75, source: "https://tax.ohio.gov/individual/file-now/annual-tax-rates", note: "2026 marginal rate above the no-tax income threshold. Personal exemptions, credits, and school-district taxes are not calculated." },
  { name: "Oklahoma", rate: 4.5, source: "https://oksenate.gov/press-releases/oklahoma-legislature-sends-comprehensive-tax-cuts-and-modernization-plan-governor", note: "2026 top rate. The qualifying Oklahoma-property deduction is not applied to ordinary investment BTC." },
  { name: "Oregon", rate: 9.9, source: "https://www.oregon.gov/dor/forms/FormsPubs/publication-or-17_101-431_2025.pdf", note: `${plain} Enter relevant local income taxes separately.` },
  { name: "Pennsylvania", rate: 3.07, source: "https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax", note: "3.07% flat state rate; state basis and loss-netting differences are not modeled." },
  { name: "Rhode Island", rate: 5.99, source: "https://tax.ri.gov/sites/g/files/xkgbur541/files/2026-07/2026_summary_of_legislative_changes.pdf", note: "2026 top base rate. A high-income surtax begins in 2027; use exit-rate overrides for future assumptions." },
  { name: "South Carolina", rate: 2.9176, source: "https://dor.sc.gov/iit", extraSource: "https://dor.sc.gov/iit/prepare-you-file/iit-faqs", note: "2026 top 5.21% rate × 56% inclusion after the 44% long-term gain deduction." },
  { name: "South Dakota", rate: 0, source: "https://dor.sd.gov/", note: zero },
  { name: "Tennessee", rate: 0, source: "https://www.tn.gov/revenue/taxes/hall-income-tax.html", note: zero },
  { name: "Texas", rate: 0, source: "https://comptroller.texas.gov/taxes/", note: zero },
  { name: "Utah", rate: 4.45, source: "https://tax.utah.gov/forms-pubs-revisions/", extraSource: "https://le.utah.gov/~2026/bills/static/SB0060.html", note: "2026 rate 4.45%. Qualifying-business reinvestment credits are not applied to ordinary BTC sales." },
  { name: "Vermont", rate: 8.75, allowance: 5000, source: "https://legislature.vermont.gov/statutes/section/32/151/05822", extraSource: "https://tax.vermont.gov/content/regulation-15811-21-b-ii-capital-gains-exclusion", note: "Top 8.75%; rules mode applies the $5,000 flat capital-gain exclusion. The alternative 40% qualifying-asset exclusion is not assumed for BTC; use a custom rate/exclusion if advised." },
  { name: "Virginia", rate: 5.75, source: "https://www.tax.virginia.gov/sites/default/files/2016-12/TAXTABLE.pdf", note: plain },
  { name: "Washington", rate: 7, allowance: 278000, source: "https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax/frequently-asked-questions-about-washingtons-capital-gains-tax", extraSource: "https://dor.wa.gov/forms-publications/publications-subject/special-notices/new-tiered-rates-washingtons-capital-gains-tax", note: "7% plus 2.9% above $1 million of taxable gains. $278,000 is the latest verified published deduction (2025), used provisionally until a 2026 amount is verified; editable below." },
  { name: "West Virginia", rate: 4.58, source: "https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx", note: "2026 top rate after the retroactive 5% rate reduction." },
  { name: "Wisconsin", rate: 5.355, source: "https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx", extraSource: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1NPR-inst.pdf", note: "Top 7.65% rate × 70% inclusion after the 30% net long-term gain exclusion." },
  { name: "Wyoming", rate: 0, source: "https://revenue.wyo.gov/", note: zero },
];

export type TaxContext = {
  location: string; stateRate: number; stateRules: boolean; otherIncome: number; otherCapitalGains: number;
  otherInvestmentIncome: number; stateAllowance: number; filingStatus: "single" | "joint" | "head" | "separate";
};

export function stateDefaults(location: string, azEligible = true) {
  const rule = stateTaxRules.find((r) => r.name === location);
  return { stateRate: rule?.name === "Arizona" && !azEligible ? 2.5 : rule?.rate ?? 0, stateAllowance: rule?.allowance ?? 0 };
}

export function estimateStateTax(gain: number, context: TaxContext): number {
  if (gain <= 0) return 0;
  const rate = context.stateRate / 100;
  if (!context.stateRules || !context.location) return gain * rate;
  const { location, otherIncome, otherCapitalGains, otherInvestmentIncome, stateAllowance, filingStatus } = context;
  const total = (capitalGain: number) => {
    const taxable = Math.max(0, capitalGain - stateAllowance);
    let tax = (location === "Arkansas" ? Math.min(taxable, 10000000) : taxable) * rate;
    const income = otherIncome + capitalGain;
    if (location === "California") tax += Math.max(0, income - 1000000) * 0.01;
    if (location === "Maine") tax += Math.max(0, income - (filingStatus === "single" ? 1000000 : filingStatus === "separate" ? 750000 : 1500000)) * 0.02;
    if (location === "Massachusetts") tax += Math.max(0, income - 1107750) * 0.04;
    if (location === "Maryland" && income > 350000) tax += capitalGain * 0.02;
    if (location === "Minnesota") tax += Math.max(0, otherInvestmentIncome + capitalGain - 1000000) * 0.01;
    if (location === "Washington") tax += Math.max(0, taxable - 1000000) * 0.029;
    return tax;
  };
  return Math.max(0, total(otherCapitalGains + gain) - total(otherCapitalGains));
}
