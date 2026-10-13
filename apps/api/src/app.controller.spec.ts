import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

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
      const result = await appController.createBooking(bookingInput);

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

  describe('providers', () => {
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
