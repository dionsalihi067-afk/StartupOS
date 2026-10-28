/** Bounds for the pricing engine. Small samples are reported as points, never as distributions. */
export const PRICING_LIMITS = {
  /** Distinct competitors in one comparable price group before a median is reported. */
  minCompetitorsForMedian: 3,
  /** Distinct competitors in one comparable price group before lowest/highest are reported. */
  minCompetitorsForRange: 2,
  /** Observed prices kept in the persisted pricing grounding. */
  maxGroundingObservations: 6,
  /** Derived signal statements kept in the persisted pricing grounding. */
  maxGroundingSignals: 6,
  /** Upper bound for a verbatim price string ("€29 / month"). */
  maxOriginalChars: 40,
} as const;
