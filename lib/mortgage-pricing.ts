// Fannie Mae purchase-money credit-score/LTV matrix, introduced May 2023;
// the relevant cells remain unchanged in the January 28, 2026 matrix.
// These are upfront price points, NOT annual mortgage interest rates.
export const LTV_PRICING_SOURCE = "https://singlefamily.fanniemae.com/media/9391/display";
export const LTV_RESEARCH_SOURCE = "https://www.abfer.org/media/abfer-events-2025/annual-conference/papers-real-estate/AC25P6034_Cost-Pass-Through-and-Mortgage-Credit_The-Case-of-Guarantee-Fees.pdf";
export const LTV_PRICING_REVIEWED = "2026-09-07";
// Kalda, Pearson & Sovich, equation (7): estimated historical buy-up multiple.
// Full conversion at unchanged upfront points is our planning assumption, not
// their estimate of universal coupon pass-through or a measured bucket mean.
export const PRICE_TO_RATE_MULTIPLE = 3.25;
export const purchaseLlpaRows = [
  { minimumScore: 780, points: [0.375, 0.375, 0.250, 0.250] },
  { minimumScore: 760, points: [0.625, 0.625, 0.500, 0.500] },
  { minimumScore: 740, points: [0.875, 1.000, 0.750, 0.625] },
  { minimumScore: 720, points: [1.250, 1.250, 1.000, 0.875] },
  { minimumScore: 700, points: [1.375, 1.500, 1.250, 1.125] },
  { minimumScore: 680, points: [1.750, 1.875, 1.500, 1.375] },
  { minimumScore: 660, points: [1.875, 2.125, 1.750, 1.625] },
  { minimumScore: 640, points: [2.250, 2.500, 2.000, 1.875] },
  { minimumScore: 300, points: [2.750, 2.875, 2.625, 2.250] },
] as const;

export function ltvRateAdjustment(oltv: number, termYears: 15 | 30, creditScore: number) {
  if (!Number.isFinite(oltv) || oltv < 0 || oltv > 95 + 1e-8 || !Number.isFinite(creditScore) || creditScore < 300 || creditScore > 850 || ![15,30].includes(termYears)) {
    return { band: "Unavailable", pricePoints: NaN, basisPoints: NaN, percentagePoints: NaN };
  }
  // A tiny tolerance removes principal-division noise at exact 80/85/90 cutoffs.
  // Fractional LTVs have no gaps: (80,85], (85,90], (90,95].
  const index = oltv <= 80 + 1e-8 ? 0 : oltv <= 85 + 1e-8 ? 1 : oltv <= 90 + 1e-8 ? 2 : 3;
  const band = ["At or Below 80%", "Above 80–85%", "Above 85–90%", "Above 90–95%"][index];
  const row = purchaseLlpaRows.find(row => creditScore >= row.minimumScore)!;
  const pricePoints = termYears === 15 ? 0 : row.points[index] - row.points[0];
  // Whole basis points avoid implying precision that a planning proxy lacks.
  const basisPoints = Math.sign(pricePoints) * Math.round(Math.abs(pricePoints) / PRICE_TO_RATE_MULTIPLE * 100) || 0;
  return { band, pricePoints, basisPoints, percentagePoints: basisPoints / 100 };
}
