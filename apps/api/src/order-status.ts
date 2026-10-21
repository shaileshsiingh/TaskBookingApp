import { AssignmentStatus, OrderStatus } from '@prisma/client';

const inactiveAssignmentStatuses = new Set<AssignmentStatus>([
  AssignmentStatus.REJECTED,
  AssignmentStatus.CANCELLED,
]);

const leastAdvancedActiveStatus: AssignmentStatus[] = [
  AssignmentStatus.OFFERED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.ON_THE_WAY,
  AssignmentStatus.ARRIVED,
  AssignmentStatus.STARTED,
];

const activeStatusToOrderStatus: Partial<Record<AssignmentStatus, OrderStatus>> = {
  [AssignmentStatus.OFFERED]: OrderStatus.ASSIGNED,
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

  const active = assignmentStatuses.filter(
    (status) => !inactiveAssignmentStatuses.has(status),
  );
  const covered = active.length >= quantity;
  if (!covered) {
    return active.length > 0 ? OrderStatus.PARTIALLY_ASSIGNED : OrderStatus.PENDING;
  }

  const leastAdvanced = leastAdvancedActiveStatus.find((status) => active.includes(status));
  return leastAdvanced ? activeStatusToOrderStatus[leastAdvanced]! : OrderStatus.PENDING;
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
