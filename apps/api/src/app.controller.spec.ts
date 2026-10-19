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
      update: vi.fn().mockResolvedValue({}),
    },
    providerProfile: {
      findFirst: vi.fn().mockResolvedValue({ userId: 'provider-123' }),
    },
    assignment: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
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
          pricingModel: 'PER_PERSON',
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({ id: 'home-help', unitPricePaise: 50000 }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
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
      update: vi.fn().mockResolvedValue({ verified: true }),
    },
    order: {
      findMany: vi.fn().mockResolvedValue([createdOrder]),
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
        { id: 'home-help', name: 'Home help', price: 500 },
      ]);
    });
  });

  describe('bookings', () => {
    const bookingInput = {
      customerName: 'Karan Reddy',
      customerPhone: '9876543210',
      serviceId: 'home-help',
      people: 2,
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
          serviceName: 'Home help',
          people: 2,
          hours: 4,
          date: '2026-10-20',
          estimatedTotal: 4000,
          status: 'pending',
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
              create: {
                serviceId: 'home-help',
                quantity: 2,
                notes: 'Please bring cleaning supplies',
              },
            },
          }),
        }),
      );
      expect(result).toMatchObject({
        id: 'order-123',
        customerName: 'Karan Reddy',
        serviceName: 'Home help',
        estimatedTotal: 4000,
        status: 'pending',
      });
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
      ).rejects.toThrow('customerPhone must contain a valid 10-digit phone number.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('assigns only a verified provider with the matching service skill', async () => {
      await expect(
        appController.assignProvider('order-123', { providerId: 'provider-123' }),
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
      );
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
