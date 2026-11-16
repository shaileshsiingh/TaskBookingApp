import { AssignmentStatus, OrderStatus } from '@prisma/client';

/**
 * Statuses that represent a provider who has actually committed to the job.
 * A bare OFFERED does not count -- under broadcast matching, many providers
 * can be simultaneously offered the same requirement, so counting OFFERED
 * toward "covered" would report a requirement as staffed before anyone has
 * accepted.
 */
export const securedAssignmentStatuses = new Set<AssignmentStatus>([
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.ON_THE_WAY,
  AssignmentStatus.ARRIVED,
  AssignmentStatus.STARTED,
]);

const leastAdvancedSecuredStatus: AssignmentStatus[] = [
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.ON_THE_WAY,
  AssignmentStatus.ARRIVED,
  AssignmentStatus.STARTED,
];

const securedStatusToOrderStatus: Partial<Record<AssignmentStatus, OrderStatus>> = {
  [AssignmentStatus.ACCEPTED]: OrderStatus.ACCEPTED,
  [AssignmentStatus.ON_THE_WAY]: OrderStatus.ON_THE_WAY,
  [AssignmentStatus.ARRIVED]: OrderStatus.ARRIVED,
  [AssignmentStatus.STARTED]: OrderStatus.STARTED,
};

const orderStatusRank: Partial<Record<OrderStatus, number>> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.PARTIALLY_ASSIGNED]: 1,
  [OrderStatus.ASSIGNED]: 2,
  [OrderStatus.ACCEPTED]: 3,
  [OrderStatus.ON_THE_WAY]: 4,
  [OrderStatus.ARRIVED]: 5,
  [OrderStatus.STARTED]: 6,
  [OrderStatus.PARTIALLY_COMPLETED]: 7,
  [OrderStatus.COMPLETED]: 8,
};

export function computeRequirementStatus(
  quantity: number,
  assignmentStatuses: AssignmentStatus[],
): OrderStatus {
  const completedCount = assignmentStatuses.filter(
    (status) => status === AssignmentStatus.COMPLETED,
  ).length;
  if (completedCount >= quantity) return OrderStatus.COMPLETED;
  if (completedCount > 0) return OrderStatus.PARTIALLY_COMPLETED;

  const secured = assignmentStatuses.filter((status) => securedAssignmentStatuses.has(status));
  const covered = secured.length >= quantity;
  if (!covered) {
    // At least one partner has actually accepted, even though the
    // requirement isn't fully staffed yet (SRS: "Partially Assigned").
    if (secured.length > 0) return OrderStatus.PARTIALLY_ASSIGNED;
    // Nobody has accepted yet -- whether offers are out or not, this is
    // "Awaiting Partners" from the customer's point of view.
    return OrderStatus.PENDING;
  }

  const leastAdvanced = leastAdvancedSecuredStatus.find((status) => secured.includes(status));
  return leastAdvanced ? securedStatusToOrderStatus[leastAdvanced]! : OrderStatus.PENDING;
}

export function computeOrderStatus(
  requirements: { quantity: number; assignmentStatuses: AssignmentStatus[] }[],
): OrderStatus {
  const statuses = requirements.map((requirement) =>
    computeRequirementStatus(requirement.quantity, requirement.assignmentStatuses),
  );

  return statuses.reduce((slowest, current) =>
    (orderStatusRank[current] ?? 0) < (orderStatusRank[slowest] ?? 0) ? current : slowest,
  );
}
