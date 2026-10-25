import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthService } from './auth.service.js';
import { PrismaService } from './prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;
  const authService = {
    getCurrentApplicationUser: vi.fn().mockResolvedValue({
      id: 'customer-123',
      role: 'CUSTOMER',
      name: 'Karan Reddy',
      phone: '9876543210',
    }),
  };

  const createdOrder = {
    id: 'order-123',
    status: 'PENDING',
    scheduledAt: new Date('2026-10-20T03:30:00.000Z'),
    durationMinutes: 240,
    address: '12, Green Park, Kondapur',
    instructions: 'Please bring cleaning supplies',
    totalAmountPaise: 400000,
    createdAt: new Date('2026-10-12T08:15:00.000Z'),
    customer: { name: 'Karan Reddy' },
    requirements: [
      {
        id: 'requirement-123',
        quantity: 2,
        service: { id: 'home-help', name: 'Home help' },
      },
    ],
    assignments: [],
  };

  const transaction = {
    user: {
      upsert: vi.fn().mockResolvedValue({ id: 'customer-123', name: 'Karan Reddy' }),
    },
    order: {
      create: vi.fn().mockResolvedValue(createdOrder),
      findUnique: vi.fn().mockResolvedValue({
        id: 'order-123',
        status: 'PENDING',
        requirements: [{ id: 'requirement-123', serviceId: 'home-help', quantity: 2 }],
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: 'order-123',
        status: 'PENDING',
        scheduledAt: new Date(Date.now() + 10 * 60_000),
        totalAmountPaise: 400000,
        assignments: [],
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        requirements: [{ id: 'requirement-123', quantity: 2 }],
        assignments: [{ requirementId: 'requirement-123', status: 'OFFERED' }],
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    providerProfile: {
      findFirst: vi.fn().mockResolvedValue({ userId: 'provider-123' }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ verified: true }),
    },
    assignment: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({
        id: 'assignment-123',
        status: 'OFFERED',
        provider: { name: 'Asha Provider' },
      }),
    },
  };

  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    service: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'home-help',
          name: 'Home help',
          description: 'Cleaning and routine support',
          unitPricePaise: 50000,
          pricingModel: 'HOURLY',
          category: { id: 'home-support', name: 'Home support' },
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({ id: 'home-help', unitPricePaise: 50000 }),
      create: vi.fn().mockResolvedValue({
        id: 'service-999',
        name: 'Deep cleaning',
        description: null,
        unitPricePaise: 70000,
        pricingModel: 'PER_PERSON',
        active: true,
        category: { id: 'home-support', name: 'Home support' },
      }),
      update: vi.fn().mockResolvedValue({
        id: 'home-help',
        name: 'Home help',
        description: null,
        unitPricePaise: 60000,
        pricingModel: 'HOURLY',
        active: true,
        category: { id: 'home-support', name: 'Home support' },
      }),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'home-support', name: 'Home support', active: true },
      ]),
      findUnique: vi.fn().mockResolvedValue({ id: 'home-support', name: 'Home support', active: true }),
      create: vi.fn().mockResolvedValue({ id: 'category-999', name: 'Event support', active: true }),
      update: vi.fn().mockResolvedValue({ id: 'home-support', name: 'Home support', active: true }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'customer-123',
          name: 'Karan Reddy',
          phone: '9876543210',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          customerOrders: [
            { status: 'COMPLETED', totalAmountPaise: 400000 },
            { status: 'CANCELLED', totalAmountPaise: 100000 },
          ],
        },
      ]),
      create: vi.fn().mockResolvedValue({
        id: 'provider-123',
        name: 'Asha Provider',
        phone: '9988776655',
        providerProfile: {
          serviceArea: 'Madhapur',
          verified: false,
          skills: [{ service: { id: 'home-help', name: 'Home help' } }],
        },
      }),
    },
    providerProfile: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({
        userId: 'provider-123',
        verified: false,
        serviceArea: 'Madhapur',
        skills: [{ serviceId: 'home-help' }],
      }),
      update: vi.fn().mockResolvedValue({ verified: true, available: true }),
    },
    assignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    order: {
      findMany: vi.fn().mockResolvedValue([createdOrder]),
      findFirst: vi.fn().mockResolvedValue({ id: 'order-123', status: 'COMPLETED' }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'order-123',
        status: 'DISPUTED',
        totalAmountPaise: 400000,
      }),
      update: vi.fn().mockResolvedValue({ id: 'order-123', status: 'DISPUTED' }),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: AuthService, useValue: authService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    appService = app.get<AppService>(AppService);
  });

  describe('health', () => {
    it('reports API and database readiness', async () => {
      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        database: 'connected',
      });
    });

    it('does not report healthy when the database is unavailable', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
      await expect(appController.getHealth()).rejects.toThrow(
        'Database connection is unavailable.',
      );
    });
  });

  describe('services', () => {
    it('returns active services from the database with prices in rupees', async () => {
      await expect(appController.getServices()).resolves.toMatchObject([
        {
          id: 'home-help',
          name: 'Home help',
          categoryId: 'home-support',
          categoryName: 'Home support',
          price: 500,
        },
      ]);
    });
  });

  describe('bookings', () => {
    const bookingInput = {
      customerName: 'Karan Reddy',
      customerPhone: '9876543210',
      items: [{ serviceId: 'home-help', people: 2 }],
      hours: 4,
      date: '2026-10-20',
      time: '9:00 AM',
      address: '12, Green Park, Kondapur',
      instructions: 'Please bring cleaning supplies',
    };

    it('returns persisted bookings with their customer and service details', async () => {
      await expect(appController.getBookings()).resolves.toMatchObject([
        {
          id: 'order-123',
          customerName: 'Karan Reddy',
          hours: 4,
          date: '2026-10-20',
          estimatedTotal: 4000,
          status: 'pending',
          requirements: [
            {
              serviceId: 'home-help',
              serviceName: 'Home help',
              people: 2,
            },
          ],
        },
      ]);
    });

    it('persists the customer, order and requirement in one transaction', async () => {
      const result = await appController.createBooking(
        { headers: {} } as never,
        bookingInput,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(transaction.user.upsert).toHaveBeenCalledWith({
        where: { phone: '9876543210' },
        update: { name: 'Karan Reddy' },
        create: {
          role: 'CUSTOMER',
          name: 'Karan Reddy',
          phone: '9876543210',
        },
      });
      expect(transaction.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'customer-123',
            totalAmountPaise: 400000,
            requirements: {
              create: [
                {
                  serviceId: 'home-help',
                  quantity: 2,
                  notes: 'Please bring cleaning supplies',
                },
              ],
            },
          }),
        }),
      );
      expect(result).toMatchObject({
        id: 'order-123',
        customerName: 'Karan Reddy',
        estimatedTotal: 4000,
        status: 'pending',
        requirements: [
          {
            serviceId: 'home-help',
            serviceName: 'Home help',
            people: 2,
            lineTotal: 4000,
          },
        ],
      });
    });

    it('creates one requirement per item and sums their pricing-model-aware totals', async () => {
      prisma.service.findMany.mockResolvedValueOnce([
        {
          id: 'home-help',
          name: 'Home help',
          unitPricePaise: 50000,
          pricingModel: 'PER_PERSON',
          category: { id: 'home-support', name: 'Home support' },
        },
        {
          id: 'event-crew',
          name: 'Event crew',
          unitPricePaise: 30000,
          pricingModel: 'DURATION_BASED',
          category: { id: 'event-support', name: 'Event support' },
        },
      ]);
      transaction.order.create.mockResolvedValueOnce({
        ...createdOrder,
        requirements: [
          { id: 'requirement-123', quantity: 2, service: { id: 'home-help', name: 'Home help' } },
          { id: 'requirement-456', quantity: 1, service: { id: 'event-crew', name: 'Event crew' } },
        ],
      });

      const result = await appController.createBooking({ headers: {} } as never, {
        ...bookingInput,
        items: [
          { serviceId: 'home-help', people: 2 },
          { serviceId: 'event-crew', people: 1 },
        ],
      });

      // home-help: PER_PERSON -> 500 * 2 = 1000; event-crew: DURATION_BASED -> 300 * 4 hours = 1200
      expect(transaction.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalAmountPaise: 220000 }),
        }),
      );
      expect(result.requirements).toEqual([
        { serviceId: 'home-help', serviceName: 'Home help', people: 2, lineTotal: 1000 },
        { serviceId: 'event-crew', serviceName: 'Event crew', people: 1, lineTotal: 1200 },
      ]);
    });

    it('rejects a booking with duplicate serviceIds across items', async () => {
      await expect(
        appService.createBooking({
          ...bookingInput,
          items: [
            { serviceId: 'home-help', people: 2 },
            { serviceId: 'home-help', people: 1 },
          ],
        }),
      ).rejects.toThrow('items cannot repeat the same serviceId.');
    });

    it('does not allow a provider account to create a customer booking', async () => {
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });

      await expect(
        appController.createBooking({ headers: {} } as never, bookingInput),
      ).rejects.toThrow('Only customer accounts can create bookings.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects invalid customer phone numbers rather than creating demo bookings', async () => {
      await expect(
        appService.createBooking({ ...bookingInput, customerPhone: '' }),
      ).rejects.toThrow('customerPhone must contain 7 to 15 digits.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a shorter test phone number when creating a customer booking', async () => {
      await expect(
        appService.createBooking({ ...bookingInput, customerPhone: '1234567' }),
      ).resolves.toMatchObject({ id: 'order-123' });
      expect(prisma.$transaction).toHaveBeenCalledOnce();
    });

    it('assigns only a verified provider with the matching service skill', async () => {
      transaction.assignment.findMany.mockResolvedValueOnce([
        { requirementId: 'requirement-123', status: 'OFFERED' },
      ]);

      await expect(
        appController.assignProvider('order-123', {
          providerId: 'provider-123',
          requirementId: 'requirement-123',
        }),
      ).resolves.toMatchObject({
        id: 'assignment-123',
        providerName: 'Asha Provider',
        status: 'offered',
      });
      expect(transaction.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: { status: 'PARTIALLY_ASSIGNED' },
      });
    });

    it('rejects assigning a provider to a requirement that is not on the booking', async () => {
      await expect(
        appController.assignProvider('order-123', {
          providerId: 'provider-123',
          requirementId: 'requirement-does-not-exist',
        }),
      ).rejects.toThrow('This booking has no such service requirement.');
    });
  });

  describe('customer booking tracking', () => {
    it('returns bookings for the signed-in customer only', async () => {
      const bookings = vi
        .spyOn(appService, 'getCustomerBookings')
        .mockResolvedValueOnce([{ id: 'order-123' }]);

      await expect(
        appController.getCustomerBookings({ headers: {} } as never),
      ).resolves.toEqual([{ id: 'order-123' }]);
      expect(bookings).toHaveBeenCalledWith('customer-123');
    });

    it('does not allow providers to read customer bookings', async () => {
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });
      const bookings = vi.spyOn(appService, 'getCustomerBookings');

      await expect(
        appController.getCustomerBookings({ headers: {} } as never),
      ).rejects.toThrow('Only customer accounts can view their bookings.');
      expect(bookings).not.toHaveBeenCalled();
    });

    it('scopes completion confirmation to the signed-in customer', async () => {
      const confirmation = vi
        .spyOn(appService, 'confirmCustomerAssignment')
        .mockResolvedValueOnce({
          id: 'assignment-123',
          customerConfirmed: true,
        });

      await expect(
        appController.confirmCustomerAssignment(
          { headers: {} } as never,
          'assignment-123',
        ),
      ).resolves.toEqual({ id: 'assignment-123', customerConfirmed: true });
      expect(confirmation).toHaveBeenCalledWith(
        'customer-123',
        'assignment-123',
      );
    });

    it('scopes provider ratings to the signed-in customer', async () => {
      const review = vi
        .spyOn(appService, 'createProviderReview')
        .mockResolvedValueOnce({
          id: 'review-123',
          rating: 5,
          comment: 'Great service',
        });

      await expect(
        appController.createProviderReview(
          { headers: {} } as never,
          'assignment-123',
          { rating: 5, comment: 'Great service' },
        ),
      ).resolves.toEqual({
        id: 'review-123',
        rating: 5,
        comment: 'Great service',
      });
      expect(review).toHaveBeenCalledWith(
        'customer-123',
        'assignment-123',
        5,
        'Great service',
      );
    });
  });

  describe('order cancellation', () => {
    it('cancels an order and applies no fee outside the cancellation window', async () => {
      transaction.order.findFirst.mockResolvedValueOnce({
        id: 'order-123',
        status: 'PENDING',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60_000),
        totalAmountPaise: 400000,
        assignments: [{ status: 'OFFERED' }],
      });

      await expect(
        appController.cancelOrder({ headers: {} } as never, 'order-123'),
      ).resolves.toMatchObject({ id: 'order-123', status: 'cancelled', cancellationFee: 0 });
      expect(transaction.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancellationFeePaise: 0,
        }),
      });
      expect(transaction.assignment.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-123', status: { in: ['OFFERED', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED'] } },
        data: { status: 'CANCELLED' },
      });
    });

    it('applies a cancellation fee when cancelling close to the scheduled time', async () => {
      transaction.order.findFirst.mockResolvedValueOnce({
        id: 'order-123',
        status: 'PENDING',
        scheduledAt: new Date(Date.now() + 10 * 60_000),
        totalAmountPaise: 400000,
        assignments: [],
      });

      await expect(
        appController.cancelOrder({ headers: {} } as never, 'order-123'),
      ).resolves.toMatchObject({ id: 'order-123', status: 'cancelled', cancellationFee: 400 });
    });

    it('blocks cancellation once a provider has started the job', async () => {
      transaction.order.findFirst.mockResolvedValueOnce({
        id: 'order-123',
        status: 'STARTED',
        scheduledAt: new Date(Date.now() + 10 * 60_000),
        totalAmountPaise: 400000,
        assignments: [{ status: 'STARTED' }],
      });

      await expect(
        appController.cancelOrder({ headers: {} } as never, 'order-123'),
      ).rejects.toThrow('This booking can no longer be cancelled because work has already started.');
    });

    it('blocks cancellation of an order that is already in a terminal state', async () => {
      transaction.order.findFirst.mockResolvedValueOnce({
        id: 'order-123',
        status: 'DISPUTED',
        scheduledAt: new Date(Date.now() + 10 * 60_000),
        totalAmountPaise: 400000,
        assignments: [],
      });

      await expect(
        appController.cancelOrder({ headers: {} } as never, 'order-123'),
      ).rejects.toThrow('This booking can no longer be cancelled.');
    });

    it('does not allow a provider account to cancel a customer booking', async () => {
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });

      await expect(
        appController.cancelOrder({ headers: {} } as never, 'order-123'),
      ).rejects.toThrow('Only customer accounts can cancel their bookings.');
    });
  });

  describe('disputes and refunds', () => {
    it('lets a customer report an issue on a completed booking', async () => {
      prisma.order.findFirst.mockResolvedValueOnce({ id: 'order-123', status: 'COMPLETED' });

      await expect(
        appController.raiseDispute({ headers: {} } as never, 'order-123', {
          reason: 'Provider left early without finishing.',
        }),
      ).resolves.toEqual({ id: 'order-123', status: 'disputed' });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          status: 'DISPUTED',
          disputeReason: 'Provider left early without finishing.',
        }),
      });
    });

    it('rejects a dispute on a booking that is not completed', async () => {
      prisma.order.findFirst.mockResolvedValueOnce({ id: 'order-123', status: 'ACCEPTED' });

      await expect(
        appController.raiseDispute({ headers: {} } as never, 'order-123', {
          reason: 'Not happy with it.',
        }),
      ).rejects.toThrow('You can report an issue once the booking is marked completed.');
    });

    it('requires a non-empty reason to raise a dispute', async () => {
      await expect(
        appController.raiseDispute({ headers: {} } as never, 'order-123', { reason: '  ' }),
      ).rejects.toThrow('Describe the issue before submitting.');
    });

    it('dismisses a dispute back to completed', async () => {
      prisma.order.update.mockResolvedValueOnce({ id: 'order-123', status: 'COMPLETED' });

      await expect(
        appController.resolveDispute('order-123', {
          action: 'dismiss',
          note: 'Spoke with the provider, resolved informally.',
        }),
      ).resolves.toEqual({ id: 'order-123', status: 'completed' });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: { status: 'COMPLETED', resolutionNote: 'Spoke with the provider, resolved informally.' },
      });
    });

    it('refunds a dispute within the booking total', async () => {
      prisma.order.update.mockResolvedValueOnce({ id: 'order-123', status: 'REFUNDED' });

      await expect(
        appController.resolveDispute('order-123', {
          action: 'refund',
          refundAmount: 2000,
          note: 'Partial refund for incomplete work.',
        }),
      ).resolves.toEqual({ id: 'order-123', status: 'refunded' });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          status: 'REFUNDED',
          refundAmountPaise: 200000,
        }),
      });
    });

    it('rejects a refund larger than the booking total', async () => {
      await expect(
        appController.resolveDispute('order-123', { action: 'refund', refundAmount: 999999 }),
      ).rejects.toThrow('refundAmount cannot exceed the booking total.');
    });

    it('rejects resolving a dispute on a booking that has none open', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'order-123',
        status: 'COMPLETED',
        totalAmountPaise: 400000,
      });

      await expect(
        appController.resolveDispute('order-123', { action: 'dismiss' }),
      ).rejects.toThrow('This booking has no open dispute to resolve.');
    });
  });

  describe('admin catalog and customers', () => {
    it('lists every category and service for the catalog editor', async () => {
      await expect(appController.getAdminCatalog()).resolves.toEqual({
        categories: [{ id: 'home-support', name: 'Home support', active: true }],
        services: [
          {
            id: 'home-help',
            name: 'Home help',
            description: 'Cleaning and routine support',
            categoryId: 'home-support',
            categoryName: 'Home support',
            price: 500,
            pricingModel: 'HOURLY',
            active: undefined,
          },
        ],
      });
    });

    it('creates a new service under an existing category', async () => {
      await expect(
        appController.createService({
          categoryId: 'home-support',
          name: 'Deep cleaning',
          pricingModel: 'PER_PERSON',
          price: 700,
        }),
      ).resolves.toMatchObject({
        id: 'service-999',
        name: 'Deep cleaning',
        price: 700,
        pricingModel: 'PER_PERSON',
      });
      expect(prisma.service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'home-support',
            name: 'Deep cleaning',
            pricingModel: 'PER_PERSON',
            unitPricePaise: 70000,
          }),
        }),
      );
    });

    it('rejects an unknown pricingModel when creating a service', async () => {
      await expect(
        appController.createService({
          categoryId: 'home-support',
          name: 'Deep cleaning',
          pricingModel: 'NOT_A_MODEL',
          price: 700,
        }),
      ).rejects.toThrow('pricingModel must be one of:');
    });

    it('updates a service price', async () => {
      await expect(
        appController.updateService('home-help', { price: 600 }),
      ).resolves.toMatchObject({ id: 'home-help', price: 600 });
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'home-help' },
          data: { unitPricePaise: 60000 },
        }),
      );
    });

    it('creates a new category', async () => {
      await expect(appController.createCategory({ name: 'Event support' })).resolves.toEqual({
        id: 'category-999',
        name: 'Event support',
        active: true,
      });
    });

    it('lists customers with booking count and lifetime value excluding cancelled orders', async () => {
      await expect(appController.getCustomers()).resolves.toEqual([
        {
          id: 'customer-123',
          name: 'Karan Reddy',
          phone: '9876543210',
          joinedAt: '2026-09-01T00:00:00.000Z',
          bookingCount: 2,
          lifetimeValue: 4000,
        },
      ]);
    });
  });

  describe('providers', () => {
    it('returns assigned jobs only for the signed-in provider', async () => {
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });
      const getAssignments = vi
        .spyOn(appService, 'getProviderAssignments')
        .mockResolvedValueOnce([{ id: 'assignment-123', status: 'offered' }]);

      await expect(
        appController.getProviderAssignments({ headers: {} } as never),
      ).resolves.toEqual([{ id: 'assignment-123', status: 'offered' }]);
      expect(getAssignments).toHaveBeenCalledWith('provider-123');
    });

    it('does not let a customer read provider jobs', async () => {
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'customer-123',
        role: 'CUSTOMER',
        name: 'Karan Reddy',
        phone: '9876543210',
      });
      const getAssignments = vi.spyOn(appService, 'getProviderAssignments');

      await expect(
        appController.getProviderAssignments({ headers: {} } as never),
      ).rejects.toThrow('Only provider accounts can view assigned jobs.');
      expect(getAssignments).not.toHaveBeenCalled();
    });

    it('scopes provider status updates to the signed-in provider', async () => {
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });
      const updateAssignment = vi
        .spyOn(appService, 'updateProviderAssignment')
        .mockResolvedValueOnce({ id: 'assignment-123', status: 'accepted' });

      await expect(
        appController.updateProviderAssignment(
          { headers: {} } as never,
          'assignment-123',
          { status: 'accepted' },
        ),
      ).resolves.toEqual({ id: 'assignment-123', status: 'accepted' });
      expect(updateAssignment).toHaveBeenCalledWith(
        'provider-123',
        'assignment-123',
        'accepted',
        undefined,
      );
    });

    it('finds a replacement automatically when a provider cancels an accepted job', async () => {
      transaction.assignment.findFirst.mockResolvedValueOnce({
        id: 'assignment-999',
        status: 'ACCEPTED',
        requirementId: 'requirement-123',
        orderId: 'order-123',
        order: {
          status: 'ACCEPTED',
          requirements: [{ id: 'requirement-123', quantity: 2, serviceId: 'home-help' }],
          assignments: [
            { id: 'assignment-999', requirementId: 'requirement-123', status: 'ACCEPTED' },
            { id: 'assignment-other', requirementId: 'requirement-123', status: 'OFFERED' },
          ],
        },
      });
      transaction.order.findUnique.mockResolvedValueOnce({ status: 'REASSIGNMENT_REQUIRED' });
      transaction.assignment.findMany.mockResolvedValueOnce([{ providerId: 'provider-other' }]);
      transaction.providerProfile.findMany.mockResolvedValueOnce([{ userId: 'provider-456' }]);
      transaction.assignment.groupBy.mockResolvedValueOnce([]);
      transaction.order.findUniqueOrThrow.mockResolvedValueOnce({
        requirements: [{ id: 'requirement-123', quantity: 2 }],
        assignments: [
          { requirementId: 'requirement-123', status: 'OFFERED' },
          { requirementId: 'requirement-123', status: 'OFFERED' },
        ],
      });

      await expect(
        appService.updateProviderAssignment('provider-123', 'assignment-999', 'cancelled'),
      ).resolves.toEqual({ id: 'assignment-999', status: 'cancelled' });

      expect(transaction.assignment.create).toHaveBeenCalledWith({
        data: { orderId: 'order-123', requirementId: 'requirement-123', providerId: 'provider-456' },
      });
      expect(transaction.order.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'order-123' },
        data: { status: 'REASSIGNMENT_REQUIRED' },
      });
      expect(transaction.order.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'order-123' },
        data: { status: 'ASSIGNED' },
      });
    });

    it('leaves the booking reassignment-required when no replacement provider is available', async () => {
      transaction.assignment.findFirst.mockResolvedValueOnce({
        id: 'assignment-999',
        status: 'ACCEPTED',
        requirementId: 'requirement-123',
        orderId: 'order-123',
        order: {
          status: 'ACCEPTED',
          requirements: [{ id: 'requirement-123', quantity: 2, serviceId: 'home-help' }],
          assignments: [
            { id: 'assignment-999', requirementId: 'requirement-123', status: 'ACCEPTED' },
            { id: 'assignment-other', requirementId: 'requirement-123', status: 'OFFERED' },
          ],
        },
      });
      transaction.order.findUnique.mockResolvedValueOnce({ status: 'REASSIGNMENT_REQUIRED' });
      transaction.assignment.findMany.mockResolvedValueOnce([{ providerId: 'provider-other' }]);
      transaction.providerProfile.findMany.mockResolvedValueOnce([]);

      await expect(
        appService.updateProviderAssignment('provider-123', 'assignment-999', 'cancelled'),
      ).resolves.toEqual({ id: 'assignment-999', status: 'cancelled' });

      expect(transaction.assignment.create).not.toHaveBeenCalled();
      expect(transaction.order.update).toHaveBeenCalledTimes(1);
      expect(transaction.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: { status: 'REASSIGNMENT_REQUIRED' },
      });
    });

    it('generates a start OTP when a provider marks arrival', async () => {
      transaction.assignment.findFirst.mockResolvedValueOnce({
        id: 'assignment-999',
        status: 'ON_THE_WAY',
        requirementId: 'requirement-123',
        orderId: 'order-123',
        startOtp: null,
        order: {
          status: 'ACCEPTED',
          requirements: [{ id: 'requirement-123', quantity: 1, serviceId: 'home-help' }],
          assignments: [
            { id: 'assignment-999', requirementId: 'requirement-123', status: 'ON_THE_WAY' },
          ],
        },
      });

      await expect(
        appService.updateProviderAssignment('provider-123', 'assignment-999', 'arrived'),
      ).resolves.toEqual({ id: 'assignment-999', status: 'arrived' });

      expect(transaction.assignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startOtp: expect.stringMatching(/^\d{4}$/) }),
        }),
      );
    });

    it('rejects starting a job with an incorrect OTP', async () => {
      transaction.assignment.findFirst.mockResolvedValueOnce({
        id: 'assignment-999',
        status: 'ARRIVED',
        requirementId: 'requirement-123',
        orderId: 'order-123',
        startOtp: '4321',
        order: {
          status: 'ACCEPTED',
          requirements: [{ id: 'requirement-123', quantity: 1, serviceId: 'home-help' }],
          assignments: [
            { id: 'assignment-999', requirementId: 'requirement-123', status: 'ARRIVED' },
          ],
        },
      });

      await expect(
        appService.updateProviderAssignment('provider-123', 'assignment-999', 'started', '0000'),
      ).rejects.toThrow('Incorrect OTP. Ask the customer for the code shown in their app.');
      expect(transaction.assignment.updateMany).not.toHaveBeenCalled();
    });

    it('starts a job once the correct OTP is supplied and clears it', async () => {
      transaction.assignment.findFirst.mockResolvedValueOnce({
        id: 'assignment-999',
        status: 'ARRIVED',
        requirementId: 'requirement-123',
        orderId: 'order-123',
        startOtp: '4321',
        order: {
          status: 'ACCEPTED',
          requirements: [{ id: 'requirement-123', quantity: 1, serviceId: 'home-help' }],
          assignments: [
            { id: 'assignment-999', requirementId: 'requirement-123', status: 'ARRIVED' },
          ],
        },
      });

      await expect(
        appService.updateProviderAssignment('provider-123', 'assignment-999', 'started', '4321'),
      ).resolves.toEqual({ id: 'assignment-999', status: 'started' });

      expect(transaction.assignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startOtp: null }),
        }),
      );
    });

    it('lets a verified provider toggle their own availability', async () => {
      prisma.providerProfile.findUnique.mockResolvedValueOnce({ verified: true });
      prisma.providerProfile.update.mockResolvedValueOnce({ available: false });
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });

      await expect(
        appController.setProviderAvailability({ headers: {} } as never, { available: false }),
      ).resolves.toEqual({ id: 'provider-123', available: false });
      expect(prisma.providerProfile.update).toHaveBeenCalledWith({
        where: { userId: 'provider-123' },
        data: { available: false },
      });
    });

    it('blocks an unverified provider from toggling availability', async () => {
      prisma.providerProfile.findUnique.mockResolvedValueOnce({ verified: false });
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });

      await expect(
        appController.setProviderAvailability({ headers: {} } as never, { available: true }),
      ).rejects.toThrow('Your provider account is not verified.');
    });

    it('summarizes a provider\'s completed, customer-confirmed earnings', async () => {
      prisma.providerProfile.findUnique.mockResolvedValueOnce({ verified: true });
      prisma.assignment.findMany.mockResolvedValueOnce([
        {
          id: 'assignment-111',
          completedAt: new Date('2026-10-18T10:00:00.000Z'),
          order: { durationMinutes: 240, customer: { name: 'Karan Reddy' } },
          requirement: {
            quantity: 2,
            service: { name: 'Home help', unitPricePaise: 50000, pricingModel: 'HOURLY' },
          },
        },
      ]);
      authService.getCurrentApplicationUser.mockResolvedValueOnce({
        id: 'provider-123',
        role: 'PROVIDER',
        name: 'Asha Provider',
        phone: '9988776655',
      });

      // HOURLY: 500 * 2 people * 4 hours = 4000 total, split across 2 assigned slots = 2000 each.
      await expect(
        appController.getProviderEarnings({ headers: {} } as never),
      ).resolves.toEqual({
        totalJobsCompleted: 1,
        totalEarnings: 2000,
        recent: [
          {
            assignmentId: 'assignment-111',
            serviceName: 'Home help',
            customerName: 'Karan Reddy',
            completedAt: '2026-10-18T10:00:00.000Z',
            amount: 2000,
          },
        ],
      });
    });

    it('creates a provider pending verification with selected service skills', async () => {
      await expect(
        appController.createProvider({
          name: 'Asha Provider',
          phone: '9988776655',
          serviceArea: 'Madhapur',
          serviceIds: ['home-help'],
        }),
      ).resolves.toMatchObject({
        id: 'provider-123',
        verified: false,
        services: [{ id: 'home-help', name: 'Home help' }],
      });
    });

    it('does not allow verification unless the provider is fully profiled', async () => {
      prisma.providerProfile.findUnique.mockResolvedValueOnce({
        userId: 'provider-123',
        verified: false,
        serviceArea: '',
        skills: [],
      });
      await expect(
        appController.setProviderVerification('provider-123', { verified: true }),
      ).rejects.toThrow('Provider must have a service area and at least one service before verification.');
    });
  });
});
