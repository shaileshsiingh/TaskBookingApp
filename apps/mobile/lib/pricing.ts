export type PricingModel =
  | 'fixed'
  | 'hourly'
  | 'per_person'
  | 'duration_based'
  | 'distance_based';

export function calculateLineAmount(
  pricingModel: PricingModel,
  pricePerUnit: number,
  people: number,
  hours: number,
): number {
  switch (pricingModel) {
    case 'fixed':
      return pricePerUnit * people;
    case 'hourly':
      return pricePerUnit * people * hours;
    case 'per_person':
      return pricePerUnit * people;
    case 'duration_based':
      return pricePerUnit * hours;
    case 'distance_based':
      return pricePerUnit * people;
  }
}
