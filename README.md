# Mortgage Lens

An interactive comparison of a traditional mortgage funded partly by a BTC sale and a Bitcoin collateralized mortgage with a separate down-payment loan. The calculator gives both alternatives the same starting assets and cash budget, buys Bitcoin with monthly payment savings, and compares projected after-tax wealth and downside outcomes.

Current model revision: September 7, 2026. The public `/methodology` page contains formulas, limitations, and the complete 50-state-plus-DC source register.

## Project layout

- `app/page.tsx`: calculator controls, comparison, scenarios, signed chart, and printable assumptions.
- `lib/mortgage-pricing.ts`: sourced LTV price adjustments and historical fee-to-rate calibration.
- `lib/mortgage-model.ts`: pure amortization, taxes, credits, sale gross-up, custody scenarios, and common-budget calculations.
- `lib/state-taxes.ts`: reviewed long-term-gain planning defaults, source URLs, exclusions, and surtaxes.
- `lib/use-market-data.ts`: independent refresh requests, manual-edit protection, term switching, and reset.
- `lib/market-data.ts`: strict source parsers and request ordering.
- `app/api/market-data/route.ts`: uncached, timeout-bounded server-side fetches. Sources: `bitcoin`, `mortgage`, `taxes`.
- `app/methodology/page.tsx`: user-facing methodology and maintained sources.
- `tests/mortgage-model.test.mjs`: meaningful finance and refresh regression tests.

## Local setup

Use Node.js 22.13 or later and the checked-in npm lockfile. No Coinbase API key, database, or account sign-in is required by the calculator. The production server needs outbound HTTPS access to Coinbase and Freddie Mac. Tax rules are a reviewed dataset served by this application, not automatically interpreted from legislation.

```bash
npm ci
npx vinext dev
```

For local development outside Sites, add your local hostname to `server.allowedHosts` in `vite.config.ts` if necessary. Do not change production access policy to solve a local development issue.

## Verify and build

```bash
node --test tests/mortgage-model.test.mjs
npx vinext build
node --test tests/rendered-html.test.mjs
```

The existing `npm run build` wrapper is the bounded Sites build. `npm test` also runs the starter's UI contract tests after building. A bare TypeScript check currently needs Cloudflare runtime types for the pre-existing worker/database template modules; the application build is the production gate.

## Publish independently on Cloudflare Workers

This is a Vinext application built for Cloudflare Workers, rather than a static HTML export. A static-only host cannot serve its market-data endpoint.

1. Copy or clone the complete repository, including lockfile, `build`, `worker`, `vendor`, components, and the hosting manifest. Do not copy credentials, `node_modules`, or transient runtime directories.
2. Install dependencies and build with the commands above.
3. Sign in to your own Cloudflare account with `npx wrangler login`.
4. Review the generated `dist/server/wrangler.json`. It points to `index.js` and the `../client` assets. No D1 or R2 bindings are needed for this calculator.
5. Publish the built worker to your account, supplying a unique worker name:

```bash
npx wrangler deploy --config dist/server/wrangler.json --name your-mortgage-lens
```

6. Use the returned Workers URL or attach your domain in Cloudflare. Check the calculator and each market-data source on that deployment. A source failure should retain a labeled assumption, not silently claim a live observation.

The `.openai/hosting.json` project ID identifies the existing Sites project and is not a Cloudflare credential. Independent Cloudflare deployment does not update the Sites publication. Do not reuse that project ID to create a different Sites project.

## Inputs and modeling conventions

Default holdings: $400,000 at the initial Coinbase price; total adjusted basis $60,000; Available Cash automatically set to the higher upfront cost; BTC growth 15%; federal long-term rate 23.8% including NIIT; county/local rate 0%; custody-loss probability 1% for the entire comparison period. Home appreciation defaults to 3%. Location defaults to Select Location with a 0% state tax assumption until selected. Monthly property costs default to 0.084% of Home Price, updating with Home Price until manually edited. DTI is informational; no planning-limit check is applied. The Coinbase One toggle applies eligible promotional credits; membership expenses are excluded. The traditional promotion defaults eligible, and can be disabled for another lender.

A full state tax return is not calculated. Defaults are top base rates after broad percentage exclusions, plus selected conditional rules. Editable income/context fields control surtaxes; manual flat-rate mode disables extra rules. Future overrides are flat effective rates. Current rates/thresholds otherwise remain fixed over the horizon. Washington's deduction provisionally uses the latest verified 2025 value until a 2026 publication is confirmed. All modeled gains are long term. No custody-loss tax benefit is modeled.

Common-budget wealth uses the larger upfront outside-cash requirement and, each month, the larger financing outflow. Monthly principal, interest, and PMI payment savings buy BTC at month-end; upfront savings buy BTC immediately at today’s price, and other unused budget dollars also buy BTC. No cash investment account remains. BTC Purchased During Loan includes all of these purchases, with full purchase dollars added to basis. Prices interpolate linearly within each year to the entered annual return, then restart from that year-end price. Purchases add their full dollars to basis and stay outside pledged custody. Expected after-tax BTC quantity equals expected liquidation value divided by terminal BTC price. Debt, BTC sale and remaining basis, credits, fees, and terminal transactions are accounted for separately. Tax reserves are treated as committed cash at the start. The calculator does not manage wallets, request keys, or execute trades.

## Source maintenance

Review mortgage/credit terms and state changes monthly; review all jurisdictions before a new tax year. Update the primary URLs, effective year, `TAX_REVIEWED_AT`, notes, and associated regression cases together. Record future-effective laws in notes without applying them prematurely. Re-check Washington's annual deduction when published. The Reset button reloads the latest maintained table but does not autonomously interpret new tax legislation.

Do not label a fallback as live. Keep request sequence protection, edit revisions, bounded upstream timeouts, and `no-store` headers in all refresh paths. Do not combine an old saved source revision with a newly built deployment archive.

Volatility model: `btcVolatility` defaults to 15% (0% uses a linear path), and `btcPathSeed` to 42. A mean-corrected log Brownian bridge changes only interim BTC purchase prices; both endpoints exactly equal the linear-within-year baseline. Both alternatives share the same reproducible path. `/methodology#volatility` documents the formula and limitations.

When the optional qualified mortgage-interest deduction is enabled, its federal marginal rate is derived automatically from `grossMonthlyIncome * 12 + otherIncome`, rounded to cents, and `filingStatus`. The 2026 ordinary-income brackets come from [IRS Revenue Procedure 2025-32, section 4.01](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf). This is an income-before-deductions planning proxy, held fixed across the horizon; do not duplicate monthly income in Other Annual Income. No NIIT or state tax is added to the deduction rate. Update `FEDERAL_BRACKET_YEAR`, the bracket table, source, and boundary tests together for a new tax year.

Total Monthly Payment is initial principal and interest plus initial PMI and the shared Monthly Property Tax, Insurance & HOA input. The projection uses each month’s declining PMI. Traditional PMI is the annual rate times beginning-of-month balance divided by 12, stopping at the modeled 78% LTV threshold. This declining-premium convention is an assumption. PMI is included once in each monthly financing outflow before remaining budget buys BTC; its separate display row does not create another charge.

Type-check with `node node_modules/typescript/bin/tsc --noEmit`. `worker-runtime.d.ts` contains generated Cloudflare runtime declarations; regenerate after changing the Worker compatibility settings with `WRANGLER_SEND_METRICS=false node node_modules/wrangler/bin/wrangler.js types worker-runtime.d.ts --config dist/server/wrangler.json --include-env false` after a successful build. The starter's optional D1 binding is declared separately in `db/cloudflare-env.d.ts`.

Available Cash uses `null` internally for an automatic default: the greater baseline upfront requirement before optional extra down payments, rounded up to cents. The UI displays the calculated dollar amount and resets to automatic mode with Reset & Refresh. Edited cash stays between that current minimum and the minimum plus 20% of Home Price. Both bounds use required costs before optional extra down payments; a custom amount cannot raise its own ceiling. The field validates drafts and commits valid amounts on blur/Enter. `extraCashUse` defaults to `bitcoin`; `down-payment` applies Traditional's remaining budget to its first mortgage, then reduces the BTC sale if that mortgage is fully paid. Bitcoin Collateralized applies cash exclusively to its BTC-backed second loan and collateral pledge, leaving its first mortgage at 80% of Home Price. Any cash left after permitted paydown remains uninvested, appears in the cash and wealth tables, and is carried into terminal wealth at face value. A budget solver recalculates points, credits, and sale-tax reserves, preserving equal starting cash and preventing negative balances. Monthly unused budget dollars continue to buy BTC in both modes.

`downPct` applies only to Traditional, with a 5% default and minimum. Bitcoin Collateralized starts at 80% of Home Price in the first mortgage and 20% in the BTC-backed second loan; its structure is independent of `downPct`. The separate Extra Down Payment allocation reduces starting balances; only the BTC-backed second loan is reduced on the Bitcoin side; its first mortgage stays at 80% of Home Price. Mortgage insurance is explicitly disabled for Bitcoin Collateralized throughout the schedule, budget, and DTI; the editable PMI assumption applies only to Traditional.

The BTC position table lists Pledged BTC (quantity above current dollars), Initial Cold Storage BTC, BTC Purchased During Loan, and Total Pre-Tax Bitcoin. The total sums the displayed whole-satoshi components before future fees, taxes, and custody-loss weighting. Pledges round up and storage/purchases round down; wealth calculations keep their existing precision. Initial Monthly PMI is itemized before Total Monthly Payment.


Traditional pricing separates `baseMortgageRate` (unadjusted PMMS) from `traditionalRateOverride` (an optional final lender quote). `traditionalRateAssumption()` adds the original-LTV adjustment only to Traditional's schedule; all payments, amortization, PMI, DTI, deductions and BTC purchase differences use that final rate. The original LTV includes any upfront Extra Down Payment; the rate never changes as monthly balances amortize. Bitcoin pricing stays at unadjusted PMMS + 1.5 unless manually overridden, and a Traditional quote cannot change it. Reset and term changes restore automatic pricing. The public `/methodology#ltv-pricing` page documents the source, calibration and limitations. At Credit Score 740 the 30-year rate adjustments are +4 bp for (80,85] LTV, −4 bp for (85,90], and −8 bp for (90,95]. The 15-year adjustment is zero. These are historically calibrated planning proxies, not empirical historical bucket averages or guaranteed lender quotes.
