import { PricingModel } from '@prisma/client';

export function calculateLineAmountPaise(
  pricingModel: PricingModel,
  unitPricePaise: number,
  people: number,
  hours: number,
): number {
  switch (pricingModel) {
    case PricingModel.FIXED:
      return unitPricePaise * people;
    case PricingModel.HOURLY:
      return unitPricePaise * people * hours;
    case PricingModel.PER_PERSON:
      return unitPricePaise * people;
    case PricingModel.DURATION_BASED:
      return unitPricePaise * hours;
    case PricingModel.DISTANCE_BASED:
      return unitPricePaise * people;
  }
}
