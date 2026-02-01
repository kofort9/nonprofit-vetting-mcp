import { describe, it, expect } from 'vitest';
import { validateThresholds } from '../src/core/config.js';
import { DEFAULT_THRESHOLDS, makeThresholds } from './fixtures.js';

describe('validateThresholds', () => {
  it('accepts default thresholds', () => {
    expect(() => validateThresholds(DEFAULT_THRESHOLDS)).not.toThrow();
  });

  // --- Weight validation ---

  it('rejects weights that do not sum to 100', () => {
    const t = makeThresholds({ weight501c3Status: 50 }); // sum = 120
    expect(() => validateThresholds(t)).toThrow(/Weights must sum to 100/);
  });

  it('rejects negative weights', () => {
    // Adjust another weight to keep sum at 100 but with a negative
    const t = makeThresholds({ weight501c3Status: -10, weightYearsOperating: 55 });
    expect(() => validateThresholds(t)).toThrow(/non-negative/);
  });

  it('accepts zero weight (disabling a check)', () => {
    // sum still 100: 0 + 45 + 20 + 20 + 15 = 100
    const t = makeThresholds({ weight501c3Status: 0, weightYearsOperating: 45 });
    expect(() => validateThresholds(t)).not.toThrow();
  });

  // --- Revenue range ordering ---

  it('rejects revenueFailMin > revenuePassMin', () => {
    const t = makeThresholds({ revenueFailMin: 200_000, revenuePassMin: 100_000 });
    expect(() => validateThresholds(t)).toThrow(/revenueFailMin/);
  });

  it('rejects revenuePassMin > revenuePassMax', () => {
    const t = makeThresholds({ revenuePassMin: 20_000_000 });
    expect(() => validateThresholds(t)).toThrow(/revenuePassMin/);
  });

  it('rejects revenuePassMax > revenueReviewMax', () => {
    const t = makeThresholds({ revenuePassMax: 60_000_000 });
    expect(() => validateThresholds(t)).toThrow(/revenuePassMax/);
  });

  // --- Expense ratio ordering ---

  it('rejects expenseRatioLowReview > expenseRatioPassMin', () => {
    const t = makeThresholds({ expenseRatioLowReview: 0.9 });
    expect(() => validateThresholds(t)).toThrow(/expenseRatioLowReview/);
  });

  it('rejects expenseRatioPassMin > expenseRatioPassMax', () => {
    const t = makeThresholds({ expenseRatioPassMin: 1.5 });
    expect(() => validateThresholds(t)).toThrow(/expenseRatioPassMin/);
  });

  it('rejects expenseRatioPassMax > expenseRatioHighReview', () => {
    const t = makeThresholds({ expenseRatioPassMax: 2.0 });
    expect(() => validateThresholds(t)).toThrow(/expenseRatioPassMax/);
  });

  // --- Other ordering invariants ---

  it('rejects yearsReviewMin > yearsPassMin', () => {
    const t = makeThresholds({ yearsReviewMin: 5 });
    expect(() => validateThresholds(t)).toThrow(/yearsReviewMin/);
  });

  it('rejects filing990PassMax > filing990ReviewMax', () => {
    const t = makeThresholds({ filing990PassMax: 5 });
    expect(() => validateThresholds(t)).toThrow(/filing990PassMax/);
  });

  it('rejects scoreReviewMin > scorePassMin', () => {
    const t = makeThresholds({ scoreReviewMin: 90 });
    expect(() => validateThresholds(t)).toThrow(/scoreReviewMin/);
  });

  it('rejects scorePassMin > 100', () => {
    // need scoreReviewMin <= scorePassMin, so bump both
    const t = makeThresholds({ scorePassMin: 101, scoreReviewMin: 50 });
    expect(() => validateThresholds(t)).toThrow(/scorePassMin must be between/);
  });

  it('rejects scorePassMin < 0', () => {
    const t = makeThresholds({ scorePassMin: -1 });
    expect(() => validateThresholds(t)).toThrow(/scorePassMin must be between/);
  });

  // --- Multiple errors ---

  it('reports multiple errors at once', () => {
    const t = makeThresholds({
      weight501c3Status: -5,
      revenueFailMin: 200_000,
      scorePassMin: 101,
    });
    let caught: Error | undefined;
    try { validateThresholds(t); } catch (e) { caught = e as Error; }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('non-negative');
    expect(caught!.message).toContain('revenueFailMin');
    expect(caught!.message).toContain('scorePassMin');
  });
});
