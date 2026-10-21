import { AssignmentStatus, OrderStatus } from '@prisma/client';
import { computeOrderStatus, computeRequirementStatus } from './order-status.js';

describe('computeRequirementStatus', () => {
  it('reports PENDING when nothing has been offered yet', () => {
    expect(computeRequirementStatus(3, [])).toBe(OrderStatus.PENDING);
  });

  it('reports PARTIALLY_ASSIGNED when coverage is incomplete', () => {
    expect(computeRequirementStatus(3, [AssignmentStatus.ACCEPTED])).toBe(
      OrderStatus.PARTIALLY_ASSIGNED,
    );
  });

  it('does not report ACCEPTED until every slot is at least offered', () => {
    // 1 of 3 required providers has accepted; the other 2 have no assignment at all.
    expect(
      computeRequirementStatus(3, [AssignmentStatus.ACCEPTED]),
    ).not.toBe(OrderStatus.ACCEPTED);
  });

  it('reports ACCEPTED once every slot is covered and the least-advanced is ACCEPTED', () => {
    expect(
      computeRequirementStatus(2, [AssignmentStatus.ACCEPTED, AssignmentStatus.OFFERED]),
    ).toBe(OrderStatus.ASSIGNED);
    expect(
      computeRequirementStatus(2, [AssignmentStatus.ACCEPTED, AssignmentStatus.ACCEPTED]),
    ).toBe(OrderStatus.ACCEPTED);
  });

  it('ignores REJECTED/CANCELLED assignments when checking coverage', () => {
    expect(
      computeRequirementStatus(2, [
        AssignmentStatus.REJECTED,
        AssignmentStatus.ACCEPTED,
        AssignmentStatus.ACCEPTED,
      ]),
    ).toBe(OrderStatus.ACCEPTED);
  });

  it('reports PARTIALLY_COMPLETED once some, but not all, required slots finish', () => {
    expect(
      computeRequirementStatus(2, [AssignmentStatus.COMPLETED, AssignmentStatus.STARTED]),
    ).toBe(OrderStatus.PARTIALLY_COMPLETED);
  });

  it('reports COMPLETED once every required slot finishes', () => {
    expect(
      computeRequirementStatus(2, [AssignmentStatus.COMPLETED, AssignmentStatus.COMPLETED]),
    ).toBe(OrderStatus.COMPLETED);
  });
});

describe('computeOrderStatus', () => {
  it('is only as advanced as its slowest requirement (the design-review scenario)', () => {
    // Requirement A needs 3, fully ACCEPTED. Requirement B needs 2, zero assignments.
    const status = computeOrderStatus([
      {
        quantity: 3,
        assignmentStatuses: [
          AssignmentStatus.ACCEPTED,
          AssignmentStatus.ACCEPTED,
          AssignmentStatus.ACCEPTED,
        ],
      },
      { quantity: 2, assignmentStatuses: [] },
    ]);

    expect(status).toBe(OrderStatus.PENDING);
    expect(status).not.toBe(OrderStatus.ACCEPTED);
  });

  it('reports the shared stage when every requirement is at the same point', () => {
    const status = computeOrderStatus([
      { quantity: 1, assignmentStatuses: [AssignmentStatus.STARTED] },
      { quantity: 1, assignmentStatuses: [AssignmentStatus.STARTED] },
    ]);

    expect(status).toBe(OrderStatus.STARTED);
  });

  it('reports COMPLETED only when every requirement is fully completed', () => {
    const status = computeOrderStatus([
      { quantity: 1, assignmentStatuses: [AssignmentStatus.COMPLETED] },
      { quantity: 1, assignmentStatuses: [AssignmentStatus.STARTED] },
    ]);

    expect(status).toBe(OrderStatus.STARTED);
  });
});
