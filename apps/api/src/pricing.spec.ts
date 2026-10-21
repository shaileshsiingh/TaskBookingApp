import { PricingModel } from '@prisma/client';
import { calculateLineAmountPaise } from './pricing.js';

describe('calculateLineAmountPaise', () => {
  it('multiplies by people only for FIXED pricing', () => {
    expect(calculateLineAmountPaise(PricingModel.FIXED, 50000, 3, 4)).toBe(150000);
  });

  it('multiplies by people and hours for HOURLY pricing', () => {
    expect(calculateLineAmountPaise(PricingModel.HOURLY, 50000, 3, 4)).toBe(600000);
  });

  it('multiplies by people only for PER_PERSON pricing', () => {
    expect(calculateLineAmountPaise(PricingModel.PER_PERSON, 50000, 3, 4)).toBe(150000);
  });

  it('multiplies by hours only for DURATION_BASED pricing', () => {
    expect(calculateLineAmountPaise(PricingModel.DURATION_BASED, 50000, 3, 4)).toBe(200000);
  });

  it('falls back to a per-person charge for DISTANCE_BASED pricing (no geo data yet)', () => {
    expect(calculateLineAmountPaise(PricingModel.DISTANCE_BASED, 50000, 3, 4)).toBe(150000);
  });
});
