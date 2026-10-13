import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

type BookingInput = {
  customerName?: unknown;
  customerPhone?: unknown;
  serviceId?: unknown;
  people?: unknown;
  hours?: unknown;
  date?: unknown;
  time?: unknown;
  address?: unknown;
  instructions?: unknown;
};

type ProviderInput = {
  name?: unknown;
  phone?: unknown;
  serviceArea?: unknown;
  serviceIds?: unknown;
};

const servicePresentation: Record<string, { icon: string; color: string }> = {
  'home-help': { icon: '⌂', color: '#e9f1e5' },
  'moving-help': { icon: '↗', color: '#f8eee1' },
  'event-crew': { icon: '✳', color: '#eeeafa' },
};

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  STARTED: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  REASSIGNMENT_REQUIRED: 'reassignment_required',
  PARTIALLY_ASSIGNED: 'partially_assigned',
  PARTIALLY_COMPLETED: 'partially_completed',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded',
};

function dateTimeInIndia(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException('date must use YYYY-MM-DD format.');
  }

  const dateParts = date.split('-').map(Number);
  const [year, month, day] = dateParts;
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() !== month - 1 ||
    dateCheck.getUTCDate() !== day
  ) {
    throw new BadRequestException('date must be a valid calendar date.');
  }

  const timeMatch = time.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
  if (!timeMatch) {
    throw new BadRequestException('time must use a 12-hour time such as 10:00 AM.');
  }

  const [, hourText, minuteText, periodText] = timeMatch;
  let hour = Number(hourText) % 12;
  if (periodText.toUpperCase() === 'PM') hour += 12;

  return new Date(Date.UTC(year, month - 1, day, hour, Number(minuteText)) - 330 * 60_000);
}

function formatIndiaDateTime(value: Date) {
  const indiaTime = new Date(value.getTime() + 330 * 60_000);
  return {
    date: `${indiaTime.getUTCFullYear()}-${String(indiaTime.getUTCMonth() + 1).padStart(2, '0')}-${String(indiaTime.getUTCDate()).padStart(2, '0')}`,
    time: indiaTime.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }),
  };
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      this.logger.error(
        'Database health check failed.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException('Database connection is unavailable.');
    }
  }

  async getServices() {
    const services = await this.prisma.service.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        unitPricePaise: true,
        pricingModel: true,
      },
    });

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      detail: service.description ?? 'Available service',
      price: service.unitPricePaise / 100,
      icon: servicePresentation[service.id]?.icon ?? '✳',
      color: servicePresentation[service.id]?.color ?? '#e9f1e5',
      area: 'Hyderabad',
      pricingModel: service.pricingModel.toLowerCase(),
    }));
  }

  async getBookings() {
    const bookings = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        requirements: {
          include: {
            service: { select: { id: true, name: true } },
          },
        },
        assignments: {
          include: {
            provider: { select: { id: true, name: true } },
          },
          orderBy: { offeredAt: 'asc' },
        },
      },
    });

    return bookings.map((booking) => {
      const requirement = booking.requirements[0];
      const dateTime = formatIndiaDateTime(booking.scheduledAt);

      return {
        id: booking.id,
        customerName: booking.customer.name,
        serviceId: requirement?.service.id ?? '',
        serviceName: requirement?.service.name ?? 'Service request',
        people: requirement?.quantity ?? 1,
        hours: booking.durationMinutes ? booking.durationMinutes / 60 : 1,
        date: dateTime.date,
        time: dateTime.time,
        address: booking.address,
        instructions: booking.instructions ?? undefined,
        estimatedTotal: (booking.totalAmountPaise ?? 0) / 100,
        status: statusLabels[booking.status],
        createdAt: booking.createdAt.toISOString(),
        assignments: booking.assignments.map((assignment) => ({
          id: assignment.id,
          providerId: assignment.provider.id,
          providerName: assignment.provider.name,
          status: assignment.status.toLowerCase(),
        })),
      };
    });
  }

  async getProviders() {
    const providers = await this.prisma.providerProfile.findMany({
      orderBy: { user: { name: 'asc' } },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        skills: {
          include: { service: { select: { id: true, name: true } } },
          orderBy: { service: { name: 'asc' } },
        },
      },
    });

    return providers.map((profile) => ({
      id: profile.user.id,
      name: profile.user.name,
      phone: profile.user.phone,
      serviceArea: profile.serviceArea,
      verified: profile.verified,
      services: profile.skills.map((skill) => ({
        id: skill.service.id,
        name: skill.service.name,
      })),
    }));
  }

  async createProvider(input: ProviderInput) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const phone = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : '';
    const serviceArea = typeof input.serviceArea === 'string' ? input.serviceArea.trim() : '';
    const serviceIds = Array.isArray(input.serviceIds)
      ? [...new Set(input.serviceIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))]
      : [];

    if (!name) throw new BadRequestException('Provider name is required.');
    if (!/^\d{10}$/.test(phone)) {
      throw new BadRequestException('Provider phone must contain a valid 10-digit number.');
    }
    if (!serviceArea) throw new BadRequestException('Provider service area is required.');
    if (serviceIds.length === 0) {
      throw new BadRequestException('Select at least one service for this provider.');
    }

    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds }, active: true },
      select: { id: true },
    });
    if (services.length !== serviceIds.length) {
      throw new BadRequestException('One or more selected services are unavailable.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('A user with this phone number already exists.');
    }

    const provider = await this.prisma.user.create({
      data: {
        role: UserRole.PROVIDER,
        name,
        phone,
        providerProfile: {
          create: {
            serviceArea,
            skills: {
              create: serviceIds.map((serviceId) => ({
                service: { connect: { id: serviceId } },
              })),
            },
          },
        },
      },
      include: {
        providerProfile: {
          include: {
            skills: { include: { service: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    return {
      id: provider.id,
      name: provider.name,
      phone: provider.phone,
      serviceArea: provider.providerProfile!.serviceArea,
      verified: provider.providerProfile!.verified,
      services: provider.providerProfile!.skills.map((skill) => skill.service),
    };
  }

  async setProviderVerification(providerId: string, verified: unknown) {
    if (typeof verified !== 'boolean') {
      throw new BadRequestException('verified must be a boolean.');
    }

    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      include: { skills: true },
    });
    if (!profile) throw new NotFoundException(`Provider "${providerId}" was not found.`);
    if (verified && (!profile.serviceArea?.trim() || profile.skills.length === 0)) {
      throw new BadRequestException('Provider must have a service area and at least one service before verification.');
    }

    const updatedProfile = await this.prisma.providerProfile.update({
      where: { userId: providerId },
      data: { verified },
    });

    return { id: providerId, verified: updatedProfile.verified };
  }

  async assignProvider(orderId: string, providerId: unknown) {
    if (typeof providerId !== 'string' || !providerId.trim()) {
      throw new BadRequestException('providerId is required.');
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const order = await transaction.order.findUnique({
          where: { id: orderId },
          include: {
            requirements: { select: { id: true, serviceId: true, quantity: true } },
          },
        });
        if (!order) throw new NotFoundException(`Booking "${orderId}" was not found.`);
        if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.COMPLETED) {
          throw new BadRequestException('This booking cannot accept provider assignments.');
        }
        const requirement = order.requirements[0];
        if (!requirement) throw new BadRequestException('Booking has no service requirement.');

        const provider = await transaction.providerProfile.findFirst({
          where: {
            userId: providerId.trim(),
            verified: true,
            skills: { some: { serviceId: requirement.serviceId } },
          },
          select: { userId: true },
        });
        if (!provider) {
          throw new BadRequestException('Choose a verified provider qualified for this service.');
        }

        const activeStatuses = [
          'OFFERED',
          'ACCEPTED',
          'ON_THE_WAY',
          'ARRIVED',
          'STARTED',
          'COMPLETED',
        ] as const;
        const activeAssignments = await transaction.assignment.count({
          where: {
            orderId,
            requirementId: requirement.id,
            status: { in: [...activeStatuses] },
          },
        });
        if (activeAssignments >= requirement.quantity) {
          throw new ConflictException('This booking already has enough providers assigned.');
        }

        const duplicate = await transaction.assignment.findFirst({
          where: {
            orderId,
            requirementId: requirement.id,
            providerId: provider.userId,
            status: { in: [...activeStatuses] },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException('This provider is already assigned to the booking.');
        }

        const assignment = await transaction.assignment.create({
          data: {
            orderId,
            requirementId: requirement.id,
            providerId: provider.userId,
          },
          include: { provider: { select: { name: true } } },
        });
        const nextAssignmentCount = activeAssignments + 1;
        await transaction.order.update({
          where: { id: orderId },
          data: {
            status:
              nextAssignmentCount >= requirement.quantity
                ? OrderStatus.ASSIGNED
                : OrderStatus.PARTIALLY_ASSIGNED,
          },
        });

        return {
          id: assignment.id,
          providerId: provider.userId,
          providerName: assignment.provider.name,
          status: assignment.status.toLowerCase(),
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async getBookingById(id: string) {
    const booking = (await this.getBookings()).find((item) => item.id === id);

    if (!booking) {
      throw new NotFoundException(`Booking with id "${id}" was not found.`);
    }

    return booking;
  }

  async createBooking(input: BookingInput) {
    const customerName = typeof input.customerName === 'string' ? input.customerName.trim() : '';
    const customerPhone =
      typeof input.customerPhone === 'string' ? input.customerPhone.replace(/\D/g, '') : '';
    const serviceId = typeof input.serviceId === 'string' ? input.serviceId.trim() : '';
    const address = typeof input.address === 'string' ? input.address.trim() : '';
    const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : '';
    const date = typeof input.date === 'string' ? input.date.trim() : '';
    const time = typeof input.time === 'string' ? input.time.trim() : '';
    const people = Number(input.people);
    const hours = Number(input.hours);

    if (!customerName) throw new BadRequestException('customerName is required.');
    if (!/^\d{10}$/.test(customerPhone)) {
      throw new BadRequestException('customerPhone must contain a valid 10-digit phone number.');
    }
    if (!Number.isInteger(people) || people < 1 || people > 20) {
      throw new BadRequestException('people must be an integer between 1 and 20.');
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
      throw new BadRequestException('hours must be an integer between 1 and 12.');
    }
    if (!address) throw new BadRequestException('address is required.');

    const scheduledAt = dateTimeInIndia(date, time);
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, active: true },
      select: { id: true, unitPricePaise: true },
    });

    if (!service) {
      throw new BadRequestException(`Unsupported or inactive serviceId: ${serviceId || 'missing'}`);
    }

    const totalAmountPaise = service.unitPricePaise * people * hours;
    const order = await this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.user.upsert({
        where: { phone: customerPhone },
        update: { name: customerName },
        create: {
          role: UserRole.CUSTOMER,
          name: customerName,
          phone: customerPhone,
        },
      });

      return transaction.order.create({
        data: {
          customerId: customer.id,
          status: OrderStatus.PENDING,
          scheduledAt,
          durationMinutes: hours * 60,
          address,
          instructions: instructions || null,
          totalAmountPaise,
          requirements: {
            create: {
              serviceId: service.id,
              quantity: people,
              notes: instructions || null,
            },
          },
        },
        include: {
          customer: { select: { name: true } },
          requirements: {
            include: {
              service: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    const requirement = order.requirements[0];
    const dateTime = formatIndiaDateTime(order.scheduledAt);

    return {
      id: order.id,
      customerName: order.customer.name,
      serviceId: requirement.service.id,
      serviceName: requirement.service.name,
      people: requirement.quantity,
      hours,
      date: dateTime.date,
      time: dateTime.time,
      address: order.address,
      instructions: order.instructions ?? undefined,
      estimatedTotal: totalAmountPaise / 100,
      status: statusLabels[order.status],
      createdAt: order.createdAt.toISOString(),
      message: 'Booking created successfully.',
    };
  }
}
