import { AppService } from './app.service.js';
import { PrismaService } from './prisma.service.js';

describe('customer booking lifecycle', () => {
  const orderFindMany = vi.fn();
  const transaction = {
    assignment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    providerReview: {
      create: vi.fn(),
    },
  };
  const runTransaction = vi.fn(
    async (callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
  );
  const prisma = {
    order: { findMany: orderFindMany },
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const appService = new AppService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries only the signed-in customer bookings', async () => {
    orderFindMany.mockResolvedValueOnce([]);

    await expect(appService.getCustomerBookings('customer-123')).resolves.toEqual(
      [],
    );
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'customer-123' },
      }),
    );
  });

  it('only confirms a completed assignment belonging to the customer', async () => {
    transaction.assignment.findFirst.mockResolvedValueOnce({
      id: 'assignment-123',
      status: 'COMPLETED',
      customerConfirmedAt: null,
    });
    transaction.assignment.update.mockResolvedValueOnce({});

    await expect(
      appService.confirmCustomerAssignment('customer-123', 'assignment-123'),
    ).resolves.toEqual({
      id: 'assignment-123',
      customerConfirmed: true,
    });
    expect(transaction.assignment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'assignment-123',
        order: { customerId: 'customer-123' },
      },
      select: {
        id: true,
        status: true,
        customerConfirmedAt: true,
      },
    });
  });

  it('rejects completion confirmation before the provider completes the job', async () => {
    transaction.assignment.findFirst.mockResolvedValueOnce({
      id: 'assignment-123',
      status: 'STARTED',
      customerConfirmedAt: null,
    });

    await expect(
      appService.confirmCustomerAssignment('customer-123', 'assignment-123'),
    ).rejects.toThrow('You can confirm completion after the provider marks the job complete.');
    expect(transaction.assignment.update).not.toHaveBeenCalled();
  });

  it('does not reveal assignments belonging to another customer', async () => {
    transaction.assignment.findFirst.mockResolvedValueOnce(null);

    await expect(
      appService.confirmCustomerAssignment('customer-123', 'other-assignment'),
    ).rejects.toThrow('Booking assignment was not found.');
  });

  it('accepts only integer ratings from one through five', async () => {
    await expect(
      appService.createProviderReview(
        'customer-123',
        'assignment-123',
        6,
        '',
      ),
    ).rejects.toThrow('rating must be a whole number from 1 to 5.');
    expect(runTransaction.mock.calls).toHaveLength(0);
  });

  it('requires customer confirmation before a review can be submitted', async () => {
    transaction.assignment.findFirst.mockResolvedValueOnce({
      id: 'assignment-123',
      providerId: 'provider-123',
      status: 'COMPLETED',
      customerConfirmedAt: null,
      review: null,
    });

    await expect(
      appService.createProviderReview(
        'customer-123',
        'assignment-123',
        5,
        '',
      ),
    ).rejects.toThrow('Confirm the completed job before rating the provider.');
    expect(transaction.providerReview.create.mock.calls).toHaveLength(0);
  });

  it('stores one bounded review for the assignment provider', async () => {
    transaction.assignment.findFirst.mockResolvedValueOnce({
      id: 'assignment-123',
      providerId: 'provider-123',
      status: 'COMPLETED',
      customerConfirmedAt: new Date('2026-10-16T10:00:00.000Z'),
      review: null,
    });
    transaction.providerReview.create.mockResolvedValueOnce({
      id: 'review-123',
      rating: 5,
      comment: 'Great service',
    });

    await expect(
      appService.createProviderReview(
        'customer-123',
        'assignment-123',
        5,
        '  Great service  ',
      ),
    ).resolves.toEqual({
      id: 'review-123',
      rating: 5,
      comment: 'Great service',
    });
    expect(transaction.providerReview.create).toHaveBeenCalledWith({
      data: {
        assignmentId: 'assignment-123',
        customerId: 'customer-123',
        providerId: 'provider-123',
        rating: 5,
        comment: 'Great service',
      },
      select: { id: true, rating: true, comment: true },
    });
  });
});
