import { describe, it, expect } from 'vitest';
import {
  check501c3Status,
  checkYearsOperating,
  checkRevenueRange,
  checkOverheadRatio,
  checkRecent990,
  calculateScore,
  getRecommendation,
  detectRedFlags,
  runTier1Checks,
  runRedFlagCheck,
} from '../src/domain/nonprofit/scoring.js';
import { DEFAULT_THRESHOLDS, makeProfile, make990, makeFiling, taxPrdOffset } from './fixtures.js';

const t = DEFAULT_THRESHOLDS;

// ============================================================================
// check501c3Status
// ============================================================================

describe('check501c3Status', () => {
  it('passes for subsection 03', () => {
    const result = check501c3Status(makeProfile({ subsection: '03' }), t);
    expect(result.result).toBe('PASS');
    expect(result.passed).toBe(true);
    expect(result.weight).toBe(30);
  });

  it('fails for subsection 04', () => {
    const result = check501c3Status(makeProfile({ subsection: '04' }), t);
    expect(result.result).toBe('FAIL');
    expect(result.passed).toBe(false);
  });

  it('fails for empty subsection', () => {
    const result = check501c3Status(makeProfile({ subsection: '' }), t);
    expect(result.result).toBe('FAIL');
  });

  it('fails for subsection 06 (501(c)(6) trade associations)', () => {
    const result = check501c3Status(makeProfile({ subsection: '06' }), t);
    expect(result.result).toBe('FAIL');
    expect(result.detail).toContain('subsection 06');
  });
});

// ============================================================================
// checkYearsOperating
// ============================================================================

describe('checkYearsOperating', () => {
  it.each([
    [10, 'PASS'],
    [3,  'PASS'],   // boundary
    [2,  'REVIEW'],
    [1,  'REVIEW'], // boundary
    [0,  'FAIL'],
    [-1, 'FAIL'],   // data anomaly
  ] as const)('%d years → %s', (years, expected) => {
    const result = checkYearsOperating(makeProfile({ years_operating: years }), t);
    expect(result.result).toBe(expected);
  });

  it('fails for null years (no ruling date)', () => {
    const result = checkYearsOperating(makeProfile({ years_operating: null }), t);
    expect(result.result).toBe('FAIL');
    expect(result.detail).toContain('No ruling date');
  });
});

// ============================================================================
// checkRevenueRange
// ============================================================================

describe('checkRevenueRange', () => {
  it.each([
    [500_000,    'PASS'],   // middle of range
    [100_000,    'PASS'],   // lower boundary
    [10_000_000, 'PASS'],   // upper boundary
    [75_000,     'REVIEW'], // small but viable
    [30_000_000, 'REVIEW'], // larger org
    [25_000,     'FAIL'],   // too small
    [60_000_000, 'FAIL'],   // outside scope
  ] as const)('$%d revenue → %s', (revenue, expected) => {
    const result = checkRevenueRange(makeProfile({ latest_990: make990({ total_revenue: revenue }) }), t);
    expect(result.result).toBe(expected);
  });

  // --- Edge cases from the truthiness bug fix ---

  it('fails for $0 revenue (not falsy pass-through)', () => {
    const result = checkRevenueRange(makeProfile({ latest_990: make990({ total_revenue: 0 }) }), t);
    expect(result.result).toBe('FAIL');
    expect(result.detail).toBe('Zero revenue reported');
  });

  it('fails for negative revenue', () => {
    const result = checkRevenueRange(makeProfile({ latest_990: make990({ total_revenue: -50_000 }) }), t);
    expect(result.result).toBe('FAIL');
    expect(result.detail).toContain('Negative revenue');
  });

  it('fails for null revenue', () => {
    const result = checkRevenueRange(makeProfile({ latest_990: make990({ total_revenue: null as unknown as number }) }), t);
    expect(result.result).toBe('FAIL');
    expect(result.detail).toContain('No revenue data');
  });

  it('fails for undefined revenue (no 990)', () => {
    const result = checkRevenueRange(makeProfile({ latest_990: null }), t);
    expect(result.result).toBe('FAIL');
  });
});

// ============================================================================
// checkOverheadRatio
// ============================================================================

describe('checkOverheadRatio', () => {
  it.each([
    [0.8,  'PASS'],   // healthy
    [0.70, 'PASS'],   // lower boundary
    [1.0,  'PASS'],   // upper boundary
    [1.1,  'REVIEW'], // slightly above revenue
    [0.6,  'REVIEW'], // low deployment
    [1.2,  'REVIEW'], // high review boundary (uses >)
    [0.5,  'REVIEW'], // low review boundary (uses <)
    [NaN,  'REVIEW'], // data corruption treated as missing
    [1.5,  'FAIL'],   // unsustainable
    [0.3,  'FAIL'],   // very low deployment
    [-0.5, 'FAIL'],   // data anomaly
  ] as const)('ratio %d → %s', (ratio, expected) => {
    const result = checkOverheadRatio(makeProfile({ latest_990: make990({ overhead_ratio: ratio }) }), t);
    expect(result.result).toBe(expected);
  });

  it('reviews for null ratio (missing data)', () => {
    const result = checkOverheadRatio(makeProfile({ latest_990: make990({ overhead_ratio: null }) }), t);
    expect(result.result).toBe('REVIEW');
    expect(result.detail).toContain('missing data');
  });

  it('reviews when no 990 at all', () => {
    const result = checkOverheadRatio(makeProfile({ latest_990: null }), t);
    expect(result.result).toBe('REVIEW');
  });
});

// ============================================================================
// checkRecent990
// ============================================================================

describe('checkRecent990', () => {
  it('passes for recent filing (last year)', () => {
    const result = checkRecent990(makeProfile(), t);
    expect(result.result).toBe('PASS');
  });

  it('fails when filing_count is 0', () => {
    const result = checkRecent990(makeProfile({ filing_count: 0 }), t);
    expect(result.result).toBe('FAIL');
    expect(result.detail).toContain('No 990 filings');
  });

  it('fails when no latest_990', () => {
    const result = checkRecent990(makeProfile({ latest_990: null, filing_count: 0 }), t);
    expect(result.result).toBe('FAIL');
  });

  it('fails for very old filing (2015)', () => {
    const result = checkRecent990(
      makeProfile({ latest_990: make990({ tax_period: '2015-06' }) }),
      t
    );
    expect(result.result).toBe('FAIL');
    expect(result.detail).toContain('too stale');
  });

  it('fails for malformed tax_period without NaN in detail', () => {
    const result = checkRecent990(
      makeProfile({ latest_990: make990({ tax_period: 'bad-data' }) }),
      t
    );
    expect(result.result).toBe('FAIL');
    expect(result.detail).not.toContain('NaN');
  });
});

// ============================================================================
// calculateScore
// ============================================================================

describe('calculateScore', () => {
  it('returns 100 when all checks pass', () => {
    const checks = [
      { name: 'a', passed: true, result: 'PASS' as const, detail: '', weight: 30 },
      { name: 'b', passed: true, result: 'PASS' as const, detail: '', weight: 15 },
      { name: 'c', passed: true, result: 'PASS' as const, detail: '', weight: 20 },
      { name: 'd', passed: true, result: 'PASS' as const, detail: '', weight: 20 },
      { name: 'e', passed: true, result: 'PASS' as const, detail: '', weight: 15 },
    ];
    expect(calculateScore(checks)).toBe(100);
  });

  it('returns 0 when all checks fail', () => {
    const checks = [
      { name: 'a', passed: false, result: 'FAIL' as const, detail: '', weight: 30 },
      { name: 'b', passed: false, result: 'FAIL' as const, detail: '', weight: 15 },
      { name: 'c', passed: false, result: 'FAIL' as const, detail: '', weight: 20 },
      { name: 'd', passed: false, result: 'FAIL' as const, detail: '', weight: 20 },
      { name: 'e', passed: false, result: 'FAIL' as const, detail: '', weight: 15 },
    ];
    expect(calculateScore(checks)).toBe(0);
  });

  it('gives 50% weight for REVIEW results', () => {
    const checks = [
      { name: 'a', passed: false, result: 'REVIEW' as const, detail: '', weight: 20 },
    ];
    expect(calculateScore(checks)).toBe(10);
  });

  it('rounds to nearest integer', () => {
    const checks = [
      { name: 'a', passed: true, result: 'PASS' as const, detail: '', weight: 30 },
      { name: 'b', passed: false, result: 'REVIEW' as const, detail: '', weight: 15 },
      { name: 'c', passed: false, result: 'FAIL' as const, detail: '', weight: 20 },
    ];
    // 30 + 7.5 + 0 = 37.5 -> 38
    expect(calculateScore(checks)).toBe(38);
  });

  it('handles empty checks array', () => {
    expect(calculateScore([])).toBe(0);
  });
});

// ============================================================================
// getRecommendation
// ============================================================================

describe('getRecommendation', () => {
  it('returns PASS for score >= 80 with no flags', () => {
    expect(getRecommendation(85, [], t)).toBe('PASS');
  });

  it('returns PASS at exactly 80 (boundary)', () => {
    expect(getRecommendation(80, [], t)).toBe('PASS');
  });

  it('returns REVIEW for score 50-79', () => {
    expect(getRecommendation(65, [], t)).toBe('REVIEW');
  });

  it('returns REVIEW at exactly 50 (boundary)', () => {
    expect(getRecommendation(50, [], t)).toBe('REVIEW');
  });

  it('returns REJECT for score < 50', () => {
    expect(getRecommendation(30, [], t)).toBe('REJECT');
  });

  it('returns REJECT when HIGH severity flag exists regardless of score', () => {
    const highFlag = { severity: 'HIGH' as const, type: 'no_990_on_file' as const, detail: 'test' };
    expect(getRecommendation(95, [highFlag], t)).toBe('REJECT');
  });

  it('does not auto-reject on MEDIUM flags', () => {
    const medFlag = { severity: 'MEDIUM' as const, type: 'too_new' as const, detail: 'test' };
    expect(getRecommendation(85, [medFlag], t)).toBe('PASS');
  });
});

// ============================================================================
// detectRedFlags
// ============================================================================

describe('detectRedFlags', () => {
  it('returns empty array for clean profile', () => {
    const profile = makeProfile();
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toEqual([]);
  });

  it('flags no 990 on file (HIGH)', () => {
    const profile = makeProfile({ filing_count: 0, latest_990: null });
    const flags = detectRedFlags(profile, [], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'no_990_on_file', severity: 'HIGH' })
    );
  });

  it('flags non-501(c)(3) status (HIGH)', () => {
    const profile = makeProfile({ subsection: '04' });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'not_501c3', severity: 'HIGH' })
    );
  });

  it('flags missing ruling date (HIGH)', () => {
    const profile = makeProfile({ ruling_date: '', years_operating: null });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'no_ruling_date', severity: 'HIGH' })
    );
  });

  it('flags organization less than 1 year old (MEDIUM)', () => {
    const profile = makeProfile({ years_operating: 0 });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'too_new', severity: 'MEDIUM' })
    );
  });

  it('does NOT flag org at exactly 1 year', () => {
    const profile = makeProfile({ years_operating: 1 });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'too_new' })
    );
  });

  it('flags stale 990 older than 4 years (HIGH)', () => {
    const profile = makeProfile({
      latest_990: make990({ tax_period: '2018-06' }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'stale_990', severity: 'HIGH' })
    );
  });

  it('flags very high expense ratio > 1.2 (HIGH)', () => {
    const profile = makeProfile({
      latest_990: make990({ overhead_ratio: 1.5 }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'very_high_overhead', severity: 'HIGH' })
    );
  });

  it('does NOT flag ratio at exactly 1.2 (boundary uses >)', () => {
    const profile = makeProfile({
      latest_990: make990({ overhead_ratio: 1.2 }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'very_high_overhead' })
    );
  });

  it('flags low fund deployment < 0.5 (MEDIUM)', () => {
    const profile = makeProfile({
      latest_990: make990({ overhead_ratio: 0.3 }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'low_fund_deployment', severity: 'MEDIUM' })
    );
  });

  it('does NOT flag ratio at exactly 0.5 (boundary uses <)', () => {
    const profile = makeProfile({
      latest_990: make990({ overhead_ratio: 0.5 }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'low_fund_deployment' })
    );
  });

  it('flags very low revenue under $25K (MEDIUM)', () => {
    const profile = makeProfile({
      latest_990: make990({ total_revenue: 10_000 }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'very_low_revenue', severity: 'MEDIUM' })
    );
  });

  it('does NOT flag null revenue as very low (guards null, not just undefined)', () => {
    const profile = makeProfile({
      latest_990: make990({ total_revenue: null as unknown as number }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'very_low_revenue' })
    );
  });

  // --- $0 revenue truthiness edge case (bug #1 from cleanup) ---

  it('flags $0 revenue as very low (not skipped by falsy check)', () => {
    const profile = makeProfile({
      latest_990: make990({ total_revenue: 0 }),
    });
    const flags = detectRedFlags(profile, [makeFiling()], t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'very_low_revenue' })
    );
  });

  // --- Revenue decline ---

  it('flags >50% revenue decline year-over-year (MEDIUM)', () => {
    const filings = [
      makeFiling({ tax_prd: taxPrdOffset(0), totrevenue: 200_000 }),
      makeFiling({ tax_prd: taxPrdOffset(1), totrevenue: 500_000 }),
    ];
    const flags = detectRedFlags(makeProfile(), filings, t);
    expect(flags).toContainEqual(
      expect.objectContaining({ type: 'revenue_decline', severity: 'MEDIUM' })
    );
  });

  it('does not flag 40% decline (below threshold)', () => {
    const filings = [
      makeFiling({ tax_prd: taxPrdOffset(0), totrevenue: 300_000 }),
      makeFiling({ tax_prd: taxPrdOffset(1), totrevenue: 500_000 }),
    ];
    const flags = detectRedFlags(makeProfile(), filings, t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'revenue_decline' })
    );
  });

  it('does not flag revenue increase', () => {
    const filings = [
      makeFiling({ tax_prd: taxPrdOffset(0), totrevenue: 800_000 }),
      makeFiling({ tax_prd: taxPrdOffset(1), totrevenue: 500_000 }),
    ];
    const flags = detectRedFlags(makeProfile(), filings, t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'revenue_decline' })
    );
  });

  it('handles single filing (no decline check possible)', () => {
    const flags = detectRedFlags(makeProfile(), [makeFiling()], t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'revenue_decline' })
    );
  });

  it('handles previous revenue of 0 (avoids division by zero)', () => {
    const filings = [
      makeFiling({ tax_prd: taxPrdOffset(0), totrevenue: 100_000 }),
      makeFiling({ tax_prd: taxPrdOffset(1), totrevenue: 0 }),
    ];
    // Should not throw, and should not flag decline (can't calculate % from 0)
    const flags = detectRedFlags(makeProfile(), filings, t);
    expect(flags).not.toContainEqual(
      expect.objectContaining({ type: 'revenue_decline' })
    );
  });
});

// ============================================================================
// runTier1Checks (integration)
// ============================================================================

describe('runTier1Checks', () => {
  it('returns PASS for a clean healthy profile', () => {
    const profile = makeProfile();
    const result = runTier1Checks(profile, [makeFiling()], t);

    expect(result.recommendation).toBe('PASS');
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.red_flags).toHaveLength(0);
    expect(result.checks).toHaveLength(5);
    expect(result.summary.headline).toBe('Approved for Tier 2 Vetting');
  });

  it('returns REJECT for non-501(c)(3) (HIGH flag overrides score)', () => {
    const profile = makeProfile({ subsection: '04' });
    const result = runTier1Checks(profile, [makeFiling()], t);

    expect(result.recommendation).toBe('REJECT');
    expect(result.passed).toBe(false);
    // Score might still be decent (70 = all pass except 501c3) but HIGH flag forces REJECT
    expect(result.red_flags.some(f => f.type === 'not_501c3')).toBe(true);
  });

  it('returns REJECT for bare minimum profile (no data)', () => {
    const profile = makeProfile({
      subsection: '',
      years_operating: null,
      ruling_date: '',
      latest_990: null,
      filing_count: 0,
    });
    const result = runTier1Checks(profile, [], t);

    expect(result.recommendation).toBe('REJECT');
    // Score is 10, not 0: checkOverheadRatio returns REVIEW for missing data (50% of weight 20 = 10)
    expect(result.score).toBe(10);
    expect(result.red_flags.length).toBeGreaterThan(0);
  });

  // --- review_reasons field ---

  it('has empty review_reasons for a clean PASS profile', () => {
    const result = runTier1Checks(makeProfile(), [makeFiling()], t);
    expect(result.review_reasons).toEqual([]);
  });

  it('includes REVIEW check details in review_reasons', () => {
    // Profile with 2 years operating -> REVIEW on years check
    const profile = makeProfile({ years_operating: 2 });
    const result = runTier1Checks(profile, [makeFiling()], t);

    expect(result.review_reasons.length).toBeGreaterThan(0);
    expect(result.review_reasons.some(r => r.includes('newer organization'))).toBe(true);
  });

  it('includes FAIL check details in review_reasons', () => {
    const profile = makeProfile({ subsection: '04' });
    const result = runTier1Checks(profile, [makeFiling()], t);

    expect(result.review_reasons.some(r => r.includes('Not a 501(c)(3)'))).toBe(true);
  });

  it('includes HIGH red flag details prefixed with RED FLAG:', () => {
    const profile = makeProfile({ subsection: '04' });
    const result = runTier1Checks(profile, [makeFiling()], t);

    expect(result.review_reasons.some(r => r.startsWith('RED FLAG:'))).toBe(true);
  });

  it('collects all non-PASS reasons for bare minimum profile', () => {
    const profile = makeProfile({
      subsection: '',
      years_operating: null,
      ruling_date: '',
      latest_990: null,
      filing_count: 0,
    });
    const result = runTier1Checks(profile, [], t);

    // 4 FAIL checks + 1 REVIEW check (overhead) = 5 check reasons
    // Plus HIGH red flags (no_990, not_501c3, no_ruling_date)
    expect(result.review_reasons.length).toBeGreaterThanOrEqual(5);
    expect(result.review_reasons.filter(r => r.startsWith('RED FLAG:')).length).toBeGreaterThan(0);
  });
});

// ============================================================================
// runRedFlagCheck
// ============================================================================

describe('runRedFlagCheck', () => {
  it('returns clean=true for healthy profile', () => {
    const profile = makeProfile();
    const result = runRedFlagCheck(profile, [makeFiling()], t);

    expect(result.clean).toBe(true);
    expect(result.flags).toHaveLength(0);
    expect(result.ein).toBe('95-3135649');
    expect(result.name).toBe('Test Nonprofit');
  });

  it('returns clean=false when flags exist', () => {
    const profile = makeProfile({ subsection: '06', filing_count: 0, latest_990: null });
    const result = runRedFlagCheck(profile, [], t);

    expect(result.clean).toBe(false);
    expect(result.flags.length).toBeGreaterThan(0);
  });
});
