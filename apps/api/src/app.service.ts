import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AssignmentStatus, OrderStatus, PricingModel, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { calculateLineAmountPaise } from './pricing.js';
import { computeOrderStatus, computeRequirementStatus } from './order-status.js';
import { RealtimeGateway } from './realtime.gateway.js';

type TransactionClient = Prisma.TransactionClient;

type BookingItemInput = {
  serviceId?: unknown;
  people?: unknown;
};

type BookingInput = {
  customerName?: unknown;
  customerPhone?: unknown;
  items?: unknown;
  hours?: unknown;
  date?: unknown;
  time?: unknown;
  address?: unknown;
  instructions?: unknown;
};

const activeAssignmentStatuses = [
  AssignmentStatus.OFFERED,
  AssignmentStatus.ACCEPTED,
  AssignmentStatus.ON_THE_WAY,
  AssignmentStatus.ARRIVED,
  AssignmentStatus.STARTED,
  AssignmentStatus.COMPLETED,
] as const;

const terminalOrderStatuses = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.PARTIALLY_COMPLETED,
  OrderStatus.DISPUTED,
  OrderStatus.REFUNDED,
  OrderStatus.FAILED,
] as const;

const CANCELLATION_FEE_WINDOW_MINUTES = 120;
const CANCELLATION_FEE_RATE = 0.1;
const MAX_SAVED_ADDRESSES = 10;

function generateStartOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function isPrismaSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
  );
}

async function withSerializableRetry<T>(
  run: () => Promise<T>,
  maxAttempts = 3,
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isPrismaSerializationConflict(error) || attempt === maxAttempts) {
        if (isPrismaSerializationConflict(error)) return undefined;
        throw error;
      }
    }
  }
  return undefined;
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

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
        category: { select: { id: true, name: true } },
      },
    });

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      detail: service.description ?? 'Available service',
      categoryId: service.category.id,
      categoryName: service.category.name,
      price: service.unitPricePaise / 100,
      icon: servicePresentation[service.id]?.icon ?? '✳',
      color: servicePresentation[service.id]?.color ?? '#e9f1e5',
      area: 'Hyderabad',
      pricingModel: service.pricingModel.toLowerCase(),
    }));
  }

  async getAdminCatalog() {
    const [categories, services] = await Promise.all([
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.service.findMany({
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        active: category.active,
      })),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description ?? undefined,
        categoryId: service.category.id,
        categoryName: service.category.name,
        price: service.unitPricePaise / 100,
        pricingModel: service.pricingModel,
        active: service.active,
      })),
    };
  }

  async createCategory(nameInput: unknown) {
    const name = typeof nameInput === 'string' ? nameInput.trim() : '';
    if (!name) throw new BadRequestException('Category name is required.');

    const category = await this.prisma.category.create({ data: { name } });
    return { id: category.id, name: category.name, active: category.active };
  }

  async updateCategory(
    categoryId: string,
    nameInput: unknown,
    activeInput: unknown,
  ) {
    const data: { name?: string; active?: boolean } = {};
    if (nameInput !== undefined) {
      const name = typeof nameInput === 'string' ? nameInput.trim() : '';
      if (!name) throw new BadRequestException('Category name cannot be empty.');
      data.name = name;
    }
    if (activeInput !== undefined) {
      if (typeof activeInput !== 'boolean') {
        throw new BadRequestException('active must be a boolean.');
      }
      data.active = activeInput;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide a name and/or active value to update.');
    }

    try {
      const category = await this.prisma.category.update({
        where: { id: categoryId },
        data,
      });
      return { id: category.id, name: category.name, active: category.active };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Category "${categoryId}" was not found.`);
      }
      throw error;
    }
  }

  async createService(input: {
    categoryId?: unknown;
    name?: unknown;
    description?: unknown;
    pricingModel?: unknown;
    price?: unknown;
  }) {
    const categoryId = typeof input.categoryId === 'string' ? input.categoryId.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description =
      typeof input.description === 'string' ? input.description.trim() : '';
    const pricingModel = this.parsePricingModel(input.pricingModel);
    const price = Number(input.price);

    if (!categoryId) throw new BadRequestException('categoryId is required.');
    if (!name) throw new BadRequestException('Service name is required.');
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException('price must be a positive number.');
    }

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new BadRequestException(`Unknown categoryId: ${categoryId}`);

    const service = await this.prisma.service.create({
      data: {
        categoryId,
        name,
        description: description || null,
        pricingModel,
        unitPricePaise: Math.round(price * 100),
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return {
      id: service.id,
      name: service.name,
      categoryId: service.category.id,
      categoryName: service.category.name,
      price: service.unitPricePaise / 100,
      pricingModel: service.pricingModel,
      active: service.active,
    };
  }

  async updateService(
    serviceId: string,
    input: {
      name?: unknown;
      description?: unknown;
      pricingModel?: unknown;
      price?: unknown;
      active?: unknown;
    },
  ) {
    const data: {
      name?: string;
      description?: string | null;
      pricingModel?: Prisma.ServiceUpdateInput['pricingModel'];
      unitPricePaise?: number;
      active?: boolean;
    } = {};

    if (input.name !== undefined) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (!name) throw new BadRequestException('Service name cannot be empty.');
      data.name = name;
    }
    if (input.description !== undefined) {
      data.description =
        typeof input.description === 'string' && input.description.trim()
          ? input.description.trim()
          : null;
    }
    if (input.pricingModel !== undefined) {
      data.pricingModel = this.parsePricingModel(input.pricingModel);
    }
    if (input.price !== undefined) {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('price must be a positive number.');
      }
      data.unitPricePaise = Math.round(price * 100);
    }
    if (input.active !== undefined) {
      if (typeof input.active !== 'boolean') {
        throw new BadRequestException('active must be a boolean.');
      }
      data.active = input.active;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide at least one field to update.');
    }

    try {
      const service = await this.prisma.service.update({
        where: { id: serviceId },
        data,
        include: { category: { select: { id: true, name: true } } },
      });
      return {
        id: service.id,
        name: service.name,
        categoryId: service.category.id,
        categoryName: service.category.name,
        price: service.unitPricePaise / 100,
        pricingModel: service.pricingModel,
        active: service.active,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Service "${serviceId}" was not found.`);
      }
      throw error;
    }
  }

  private parsePricingModel(value: unknown): PricingModel {
    if (
      typeof value !== 'string' ||
      !Object.values(PricingModel).includes(value as PricingModel)
    ) {
      throw new BadRequestException(
        `pricingModel must be one of: ${Object.values(PricingModel).join(', ')}.`,
      );
    }
    return value as PricingModel;
  }

  async getCustomers() {
    const customers = await this.prisma.user.findMany({
      where: { role: UserRole.CUSTOMER },
      orderBy: { createdAt: 'desc' },
      include: {
        customerOrders: {
          select: { status: true, totalAmountPaise: true },
        },
      },
    });

    return customers.map((customer) => {
      const nonCancelledOrders = customer.customerOrders.filter(
        (order) => order.status !== OrderStatus.CANCELLED,
      );
      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        joinedAt: customer.createdAt.toISOString(),
        bookingCount: customer.customerOrders.length,
        lifetimeValue:
          nonCancelledOrders.reduce(
            (sum, order) => sum + (order.totalAmountPaise ?? 0),
            0,
          ) / 100,
      };
    });
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
      const dateTime = formatIndiaDateTime(booking.scheduledAt);

      return {
        id: booking.id,
        customerName: booking.customer.name,
        hours: booking.durationMinutes ? booking.durationMinutes / 60 : 1,
        date: dateTime.date,
        time: dateTime.time,
        address: booking.address,
        instructions: booking.instructions ?? undefined,
        estimatedTotal: (booking.totalAmountPaise ?? 0) / 100,
        status: statusLabels[booking.status],
        createdAt: booking.createdAt.toISOString(),
        disputeReason: booking.disputeReason ?? undefined,
        resolutionNote: booking.resolutionNote ?? undefined,
        refundAmount:
          booking.refundAmountPaise != null ? booking.refundAmountPaise / 100 : undefined,
        requirements: booking.requirements.map((requirement) => {
          const assignments = booking.assignments.filter(
            (assignment) => assignment.requirementId === requirement.id,
          );
          return {
            id: requirement.id,
            serviceId: requirement.service.id,
            serviceName: requirement.service.name,
            people: requirement.quantity,
            status:
              statusLabels[
                computeRequirementStatus(
                  requirement.quantity,
                  assignments.map((assignment) => assignment.status),
                )
              ],
            assignments: assignments.map((assignment) => ({
              id: assignment.id,
              providerId: assignment.provider.id,
              providerName: assignment.provider.name,
              status: assignment.status.toLowerCase(),
            })),
          };
        }),
      };
    });
  }

  async getCustomerBookings(customerId: string) {
    const bookings = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        requirements: {
          include: { service: { select: { name: true } } },
        },
        assignments: {
          orderBy: { offeredAt: 'asc' },
          include: {
            provider: { select: { name: true } },
            review: { select: { rating: true, comment: true } },
          },
        },
      },
    });

    return bookings.map((booking) => {
      const dateTime = formatIndiaDateTime(booking.scheduledAt);
      return {
        id: booking.id,
        hours: booking.durationMinutes ? booking.durationMinutes / 60 : 1,
        date: dateTime.date,
        time: dateTime.time,
        address: booking.address,
        instructions: booking.instructions ?? undefined,
        estimatedTotal: (booking.totalAmountPaise ?? 0) / 100,
        status: statusLabels[booking.status],
        disputeReason: booking.disputeReason ?? undefined,
        resolutionNote: booking.resolutionNote ?? undefined,
        refundAmount:
          booking.refundAmountPaise != null ? booking.refundAmountPaise / 100 : undefined,
        requirements: booking.requirements.map((requirement) => {
          const assignments = booking.assignments.filter(
            (assignment) => assignment.requirementId === requirement.id,
          );
          return {
            id: requirement.id,
            serviceName: requirement.service.name,
            people: requirement.quantity,
            status:
              statusLabels[
                computeRequirementStatus(
                  requirement.quantity,
                  assignments.map((assignment) => assignment.status),
                )
              ],
            assignments: assignments.map((assignment) => ({
              id: assignment.id,
              providerName: assignment.provider.name,
              status: assignment.status.toLowerCase(),
              customerConfirmed: assignment.customerConfirmedAt !== null,
              review: assignment.review,
              startOtp:
                assignment.status === AssignmentStatus.ARRIVED
                  ? assignment.startOtp ?? undefined
                  : undefined,
            })),
          };
        }),
      };
    });
  }

  async cancelOrder(customerId: string, orderId: string) {
    const activeAssignmentStatusesForCancellation: AssignmentStatus[] = [
      AssignmentStatus.OFFERED,
      AssignmentStatus.ACCEPTED,
      AssignmentStatus.ON_THE_WAY,
      AssignmentStatus.ARRIVED,
    ];

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const order = await transaction.order.findFirst({
          where: { id: orderId, customerId },
          include: { assignments: { select: { status: true, providerId: true } } },
        });
        if (!order) throw new NotFoundException('Booking was not found.');
        if ((terminalOrderStatuses as readonly OrderStatus[]).includes(order.status)) {
          throw new BadRequestException('This booking can no longer be cancelled.');
        }
        const hasStartedWork = order.assignments.some(
          (assignment) =>
            assignment.status === AssignmentStatus.STARTED ||
            assignment.status === AssignmentStatus.COMPLETED,
        );
        if (hasStartedWork) {
          throw new BadRequestException(
            'This booking can no longer be cancelled because work has already started.',
          );
        }

        const minutesUntilScheduled = (order.scheduledAt.getTime() - Date.now()) / 60_000;
        const cancellationFeePaise =
          minutesUntilScheduled <= CANCELLATION_FEE_WINDOW_MINUTES
            ? Math.round((order.totalAmountPaise ?? 0) * CANCELLATION_FEE_RATE)
            : 0;

        await transaction.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationFeePaise,
          },
        });
        await transaction.assignment.updateMany({
          where: {
            orderId: order.id,
            status: { in: activeAssignmentStatusesForCancellation },
          },
          data: { status: AssignmentStatus.CANCELLED },
        });

        const affectedProviderIds = order.assignments
          .filter((assignment) =>
            activeAssignmentStatusesForCancellation.includes(assignment.status),
          )
          .map((assignment) => assignment.providerId);

        return {
          id: order.id,
          status: statusLabels[OrderStatus.CANCELLED],
          cancellationFee: cancellationFeePaise / 100,
          affectedProviderIds,
        };
      },
      { isolationLevel: 'Serializable' },
    );

    this.realtime.notifyUsers([customerId, ...result.affectedProviderIds]);
    const { affectedProviderIds: _affectedProviderIds, ...response } = result;
    return response;
  }

  async raiseDispute(customerId: string, orderId: string, reasonInput: unknown) {
    const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
    if (!reason) throw new BadRequestException('Describe the issue before submitting.');
    if (reason.length > 500) {
      throw new BadRequestException('reason must be 500 characters or fewer.');
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Booking was not found.');
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException(
        'You can report an issue once the booking is marked completed.',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.DISPUTED,
        disputeReason: reason,
        disputedAt: new Date(),
      },
    });

    this.realtime.notifyUsers([customerId]);
    return { id: updated.id, status: statusLabels[updated.status] };
  }

  async resolveDispute(
    orderId: string,
    actionInput: unknown,
    refundAmountInput: unknown,
    noteInput: unknown,
  ) {
    if (actionInput !== 'refund' && actionInput !== 'dismiss') {
      throw new BadRequestException('action must be "refund" or "dismiss".');
    }
    const note = typeof noteInput === 'string' ? noteInput.trim() : '';
    if (note.length > 500) {
      throw new BadRequestException('note must be 500 characters or fewer.');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, totalAmountPaise: true, customerId: true },
    });
    if (!order) throw new NotFoundException(`Booking "${orderId}" was not found.`);
    if (order.status !== OrderStatus.DISPUTED) {
      throw new BadRequestException('This booking has no open dispute to resolve.');
    }

    if (actionInput === 'dismiss') {
      const updated = await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.COMPLETED, resolutionNote: note || null },
      });
      this.realtime.notifyUsers([order.customerId]);
      return { id: updated.id, status: statusLabels[updated.status] };
    }

    const refundRupees = Number(refundAmountInput);
    if (!Number.isFinite(refundRupees) || refundRupees <= 0) {
      throw new BadRequestException('refundAmount must be a positive number.');
    }
    const refundAmountPaise = Math.round(refundRupees * 100);
    if (refundAmountPaise > (order.totalAmountPaise ?? 0)) {
      throw new BadRequestException('refundAmount cannot exceed the booking total.');
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.REFUNDED,
        refundedAt: new Date(),
        refundAmountPaise,
        resolutionNote: note || null,
      },
    });
    this.realtime.notifyUsers([order.customerId]);
    return { id: updated.id, status: statusLabels[updated.status] };
  }

  async getCustomerAddresses(customerId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return addresses.map((address) => ({
      id: address.id,
      label: address.label ?? undefined,
      line: address.line,
    }));
  }

  async createCustomerAddress(customerId: string, lineInput: unknown, labelInput: unknown) {
    const line = typeof lineInput === 'string' ? lineInput.trim() : '';
    if (!line) throw new BadRequestException('address is required.');
    if (line.length > 240) {
      throw new BadRequestException('address must be 240 characters or fewer.');
    }
    const label = typeof labelInput === 'string' ? labelInput.trim() : '';
    if (label.length > 40) {
      throw new BadRequestException('label must be 40 characters or fewer.');
    }

    const existingCount = await this.prisma.address.count({ where: { customerId } });
    if (existingCount >= MAX_SAVED_ADDRESSES) {
      throw new BadRequestException(
        `You can save up to ${MAX_SAVED_ADDRESSES} addresses. Delete one before adding another.`,
      );
    }

    const address = await this.prisma.address.create({
      data: { customerId, line, label: label || null },
    });
    return { id: address.id, label: address.label ?? undefined, line: address.line };
  }

  async deleteCustomerAddress(customerId: string, addressId: string) {
    const deleted = await this.prisma.address.deleteMany({
      where: { id: addressId, customerId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Saved address was not found.');
    }
    return { id: addressId };
  }

  async confirmCustomerAssignment(customerId: string, assignmentId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const assignment = await transaction.assignment.findFirst({
        where: { id: assignmentId, order: { customerId } },
        select: {
          id: true,
          status: true,
          customerConfirmedAt: true,
        },
      });
      if (!assignment) {
        throw new NotFoundException('Booking assignment was not found.');
      }
      if (assignment.status !== AssignmentStatus.COMPLETED) {
        throw new BadRequestException(
          'You can confirm completion after the provider marks the job complete.',
        );
      }
      if (assignment.customerConfirmedAt) {
        return { id: assignment.id, customerConfirmed: true };
      }

      await transaction.assignment.update({
        where: { id: assignment.id },
        data: { customerConfirmedAt: new Date() },
      });
      return { id: assignment.id, customerConfirmed: true };
    });
  }

  async createProviderReview(
    customerId: string,
    assignmentId: string,
    ratingInput: unknown,
    commentInput: unknown,
  ) {
    if (
      typeof ratingInput !== 'number' ||
      !Number.isInteger(ratingInput) ||
      ratingInput < 1 ||
      ratingInput > 5
    ) {
      throw new BadRequestException('rating must be a whole number from 1 to 5.');
    }
    const comment =
      typeof commentInput === 'string' ? commentInput.trim() : '';
    if (comment.length > 500) {
      throw new BadRequestException('comment must be 500 characters or fewer.');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const assignment = await transaction.assignment.findFirst({
          where: { id: assignmentId, order: { customerId } },
          select: {
            id: true,
            providerId: true,
            status: true,
            customerConfirmedAt: true,
            review: { select: { id: true } },
          },
        });
        if (!assignment) {
          throw new NotFoundException('Booking assignment was not found.');
        }
        if (
          assignment.status !== AssignmentStatus.COMPLETED ||
          !assignment.customerConfirmedAt
        ) {
          throw new BadRequestException(
            'Confirm the completed job before rating the provider.',
          );
        }
        if (assignment.review) {
          throw new ConflictException(
            'You have already rated this provider for this job.',
          );
        }

        return transaction.providerReview.create({
          data: {
            assignmentId: assignment.id,
            customerId,
            providerId: assignment.providerId,
            rating: ratingInput,
            comment: comment || null,
          },
          select: {
            id: true,
            rating: true,
            comment: true,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'You have already rated this provider for this job.',
        );
      }
      throw error;
    }
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
      available: profile.available,
      services: profile.skills.map((skill) => ({
        id: skill.service.id,
        name: skill.service.name,
      })),
    }));
  }

  async setProviderAvailability(providerId: string, available: unknown) {
    if (typeof available !== 'boolean') {
      throw new BadRequestException('available must be a boolean.');
    }

    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      select: { verified: true },
    });
    if (!profile) throw new NotFoundException('Provider profile was not found.');
    if (!profile.verified) {
      throw new ForbiddenException('Your provider account is not verified.');
    }

    const updated = await this.prisma.providerProfile.update({
      where: { userId: providerId },
      data: { available },
    });

    return { id: providerId, available: updated.available };
  }

  async getProviderAssignments(providerId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      select: { verified: true },
    });
    if (!profile) throw new NotFoundException('Provider profile was not found.');
    if (!profile.verified) {
      throw new ForbiddenException('Your provider account is not verified.');
    }

    const assignments = await this.prisma.assignment.findMany({
      where: { providerId },
      orderBy: [{ order: { scheduledAt: 'asc' } }, { offeredAt: 'desc' }],
      include: {
        order: {
          include: {
            customer: { select: { name: true } },
            requirements: {
              include: { service: { select: { name: true } } },
            },
          },
        },
      },
    });

    return assignments.map((assignment) => {
      const requirement = assignment.order.requirements.find(
        (item) => item.id === assignment.requirementId,
      );
      const dateTime = formatIndiaDateTime(assignment.order.scheduledAt);
      return {
        id: assignment.id,
        status: assignment.status.toLowerCase(),
        serviceName: requirement?.service.name ?? 'Service request',
        customerName: assignment.order.customer.name,
        date: dateTime.date,
        time: dateTime.time,
        address: assignment.order.address,
        instructions: assignment.order.instructions ?? undefined,
        hours: assignment.order.durationMinutes
          ? assignment.order.durationMinutes / 60
          : undefined,
      };
    });
  }

  async getProviderEarnings(providerId: string) {
    const profile = await this.prisma.providerProfile.findUnique({
      where: { userId: providerId },
      select: { verified: true },
    });
    if (!profile) throw new NotFoundException('Provider profile was not found.');
    if (!profile.verified) {
      throw new ForbiddenException('Your provider account is not verified.');
    }

    const completedAssignments = await this.prisma.assignment.findMany({
      where: {
        providerId,
        status: AssignmentStatus.COMPLETED,
        customerConfirmedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      include: {
        order: { select: { durationMinutes: true, customer: { select: { name: true } } } },
        requirement: {
          select: {
            quantity: true,
            service: { select: { name: true, unitPricePaise: true, pricingModel: true } },
          },
        },
      },
    });

    const jobs = completedAssignments.map((assignment) => {
      const hours = assignment.order.durationMinutes
        ? assignment.order.durationMinutes / 60
        : 1;
      const lineAmountPaise = calculateLineAmountPaise(
        assignment.requirement.service.pricingModel,
        assignment.requirement.service.unitPricePaise,
        assignment.requirement.quantity,
        hours,
      );
      const amountPaise = Math.round(lineAmountPaise / assignment.requirement.quantity);
      return {
        assignmentId: assignment.id,
        serviceName: assignment.requirement.service.name,
        customerName: assignment.order.customer.name,
        completedAt: assignment.completedAt!.toISOString(),
        amount: amountPaise / 100,
      };
    });

    return {
      totalJobsCompleted: jobs.length,
      totalEarnings: jobs.reduce((sum, job) => sum + job.amount, 0),
      recent: jobs.slice(0, 20),
    };
  }

  async updateProviderAssignment(
    providerId: string,
    assignmentId: string,
    requestedStatus: unknown,
    otpInput?: unknown,
  ) {
    if (typeof requestedStatus !== 'string') {
      throw new BadRequestException('status must be a supported assignment status.');
    }

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const profile = await transaction.providerProfile.findUnique({
          where: { userId: providerId },
          select: { verified: true },
        });
        if (!profile?.verified) {
          throw new ForbiddenException('Your provider account is not verified.');
        }

        const assignment = await transaction.assignment.findFirst({
          where: { id: assignmentId, providerId },
          include: {
            order: {
              include: {
                requirements: { select: { id: true, quantity: true, serviceId: true } },
                assignments: {
                  select: { id: true, requirementId: true, status: true },
                },
              },
            },
          },
        });
        if (!assignment) {
          throw new NotFoundException('Assigned job was not found.');
        }

        const transitions: Partial<Record<AssignmentStatus, AssignmentStatus[]>> = {
          [AssignmentStatus.OFFERED]: [
            AssignmentStatus.ACCEPTED,
            AssignmentStatus.REJECTED,
          ],
          [AssignmentStatus.ACCEPTED]: [
            AssignmentStatus.ON_THE_WAY,
            AssignmentStatus.CANCELLED,
          ],
          [AssignmentStatus.ON_THE_WAY]: [
            AssignmentStatus.ARRIVED,
            AssignmentStatus.CANCELLED,
          ],
          [AssignmentStatus.ARRIVED]: [
            AssignmentStatus.STARTED,
            AssignmentStatus.CANCELLED,
          ],
          [AssignmentStatus.STARTED]: [AssignmentStatus.COMPLETED],
        };
        const nextStatus = requestedStatus.toUpperCase() as AssignmentStatus;
        if (!transitions[assignment.status]?.includes(nextStatus)) {
          throw new BadRequestException(
            `Cannot change an assignment from ${assignment.status.toLowerCase()} to ${requestedStatus.toLowerCase()}.`,
          );
        }

        if (nextStatus === AssignmentStatus.STARTED) {
          const suppliedOtp = typeof otpInput === 'string' ? otpInput.trim() : '';
          if (!suppliedOtp || suppliedOtp !== assignment.startOtp) {
            throw new BadRequestException(
              'Incorrect OTP. Ask the customer for the code shown in their app.',
            );
          }
        }

        const updated = await transaction.assignment.updateMany({
          where: {
            id: assignment.id,
            providerId,
            status: assignment.status,
          },
          data: {
            status: nextStatus,
            ...(nextStatus === AssignmentStatus.ACCEPTED
              ? { acceptedAt: new Date() }
              : {}),
            ...(nextStatus === AssignmentStatus.ARRIVED
              ? { startOtp: generateStartOtp() }
              : {}),
            ...(nextStatus === AssignmentStatus.STARTED
              ? { startOtp: null }
              : {}),
            ...(nextStatus === AssignmentStatus.COMPLETED
              ? { completedAt: new Date() }
              : {}),
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('This assigned job changed. Refresh and try again.');
        }

        const requiresReassignment =
          nextStatus === AssignmentStatus.REJECTED || nextStatus === AssignmentStatus.CANCELLED;
        const orderStatus = requiresReassignment
          ? OrderStatus.REASSIGNMENT_REQUIRED
          : computeOrderStatus(
              assignment.order.requirements.map((requirement) => ({
                quantity: requirement.quantity,
                assignmentStatuses: assignment.order.assignments
                  .filter((item) => item.requirementId === requirement.id)
                  .map((item) => (item.id === assignment.id ? nextStatus : item.status)),
              })),
            );

        if (orderStatus !== assignment.order.status) {
          await transaction.order.update({
            where: { id: assignment.orderId },
            data: { status: orderStatus },
          });
        }

        const requirement = assignment.order.requirements.find(
          (item) => item.id === assignment.requirementId,
        )!;

        return {
          id: assignment.id,
          status: nextStatus.toLowerCase(),
          orderId: assignment.orderId,
          requirementId: assignment.requirementId,
          serviceId: requirement.serviceId,
          customerId: assignment.order.customerId,
          requiresReassignment,
        };
      },
      { isolationLevel: 'Serializable' },
    );

    this.realtime.notifyUsers([result.customerId, providerId]);

    if (result.requiresReassignment) {
      await this.attemptAutomaticReassignment(
        result.orderId,
        result.requirementId,
        result.serviceId,
        providerId,
      );
    }

    return { id: result.id, status: result.status };
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

  async assignProvider(orderId: string, providerId: unknown, requirementId: unknown) {
    if (typeof providerId !== 'string' || !providerId.trim()) {
      throw new BadRequestException('providerId is required.');
    }
    if (typeof requirementId !== 'string' || !requirementId.trim()) {
      throw new BadRequestException('requirementId is required.');
    }

    const result = await this.prisma.$transaction(
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
        const requirement = order.requirements.find((item) => item.id === requirementId);
        if (!requirement) {
          throw new BadRequestException('This booking has no such service requirement.');
        }

        const provider = await transaction.providerProfile.findFirst({
          where: {
            userId: providerId.trim(),
            verified: true,
            available: true,
            skills: { some: { serviceId: requirement.serviceId } },
          },
          select: { userId: true },
        });
        if (!provider) {
          throw new BadRequestException(
            'Choose a verified, available provider qualified for this service.',
          );
        }

        const activeAssignments = await transaction.assignment.count({
          where: {
            orderId,
            requirementId: requirement.id,
            status: { in: [...activeAssignmentStatuses] },
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
            status: { in: [...activeAssignmentStatuses] },
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

        const allAssignments = await transaction.assignment.findMany({
          where: { orderId },
          select: { requirementId: true, status: true },
        });
        const nextOrderStatus = computeOrderStatus(
          order.requirements.map((item) => ({
            quantity: item.quantity,
            assignmentStatuses: allAssignments
              .filter((entry) => entry.requirementId === item.id)
              .map((entry) => entry.status),
          })),
        );
        if (nextOrderStatus !== order.status) {
          await transaction.order.update({
            where: { id: orderId },
            data: { status: nextOrderStatus },
          });
        }

        return {
          id: assignment.id,
          providerId: provider.userId,
          providerName: assignment.provider.name,
          status: assignment.status.toLowerCase(),
          customerId: order.customerId,
        };
      },
      { isolationLevel: 'Serializable' },
    );

    this.realtime.notifyUsers([result.customerId, result.providerId]);
    const { customerId: _customerId, ...response } = result;
    return response;
  }

  private async findEligibleProvider(
    transaction: TransactionClient,
    requirementId: string,
    serviceId: string,
    excludeProviderIds: string[],
  ): Promise<string | null> {
    const activeOnRequirement = await transaction.assignment.findMany({
      where: { requirementId, status: { in: [...activeAssignmentStatuses] } },
      select: { providerId: true },
    });
    const excluded = new Set([
      ...excludeProviderIds,
      ...activeOnRequirement.map((item) => item.providerId),
    ]);

    const candidates = await transaction.providerProfile.findMany({
      where: {
        verified: true,
        available: true,
        skills: { some: { serviceId } },
        userId: { notIn: [...excluded] },
      },
      select: { userId: true },
    });
    if (candidates.length === 0) return null;

    const workloads = await transaction.assignment.groupBy({
      by: ['providerId'],
      where: {
        providerId: { in: candidates.map((candidate) => candidate.userId) },
        status: { in: [...activeAssignmentStatuses] },
      },
      _count: { _all: true },
    });
    const workloadByProvider = new Map(
      workloads.map((entry) => [entry.providerId, entry._count._all]),
    );

    return candidates
      .slice()
      .sort(
        (a, b) =>
          (workloadByProvider.get(a.userId) ?? 0) - (workloadByProvider.get(b.userId) ?? 0),
      )[0].userId;
  }

  private async createReplacementAssignment(
    orderId: string,
    requirementId: string,
    serviceId: string,
    excludeProviderIds: string[],
  ): Promise<{ customerId: string; replacementProviderId: string } | null> {
    const outcome = await withSerializableRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          const order = await transaction.order.findUnique({
            where: { id: orderId },
            select: { status: true },
          });
          if (!order || order.status !== OrderStatus.REASSIGNMENT_REQUIRED) return null;

          const replacementProviderId = await this.findEligibleProvider(
            transaction,
            requirementId,
            serviceId,
            excludeProviderIds,
          );
          if (!replacementProviderId) return null;

          await transaction.assignment.create({
            data: { orderId, requirementId, providerId: replacementProviderId },
          });

          const fullOrder = await transaction.order.findUniqueOrThrow({
            where: { id: orderId },
            include: {
              requirements: { select: { id: true, quantity: true } },
              assignments: { select: { requirementId: true, status: true } },
            },
          });
          const nextOrderStatus = computeOrderStatus(
            fullOrder.requirements.map((requirement) => ({
              quantity: requirement.quantity,
              assignmentStatuses: fullOrder.assignments
                .filter((assignment) => assignment.requirementId === requirement.id)
                .map((assignment) => assignment.status),
            })),
          );
          await transaction.order.update({
            where: { id: orderId },
            data: { status: nextOrderStatus },
          });

          return { customerId: fullOrder.customerId, replacementProviderId };
        },
        { isolationLevel: 'Serializable' },
      ),
    );

    return outcome ?? null;
  }

  private async attemptAutomaticReassignment(
    orderId: string,
    requirementId: string,
    serviceId: string,
    departedProviderId: string,
  ): Promise<void> {
    const outcome = await this.createReplacementAssignment(
      orderId,
      requirementId,
      serviceId,
      [departedProviderId],
    );
    if (outcome) {
      this.realtime.notifyUsers([outcome.customerId, outcome.replacementProviderId]);
    }
  }

  async retryStuckReassignments(): Promise<void> {
    const stuckOrders = await this.prisma.order.findMany({
      where: { status: OrderStatus.REASSIGNMENT_REQUIRED },
      select: {
        id: true,
        requirements: { select: { id: true, serviceId: true, quantity: true } },
      },
    });

    for (const order of stuckOrders) {
      const assignments = await this.prisma.assignment.findMany({
        where: { orderId: order.id },
        select: { requirementId: true, providerId: true, status: true },
      });

      for (const requirement of order.requirements) {
        const requirementAssignments = assignments.filter(
          (assignment) => assignment.requirementId === requirement.id,
        );
        const activeCount = requirementAssignments.filter((assignment) =>
          (activeAssignmentStatuses as readonly AssignmentStatus[]).includes(assignment.status),
        ).length;
        if (activeCount >= requirement.quantity) continue;

        const excludeProviderIds = requirementAssignments.map((assignment) => assignment.providerId);
        const outcome = await this.createReplacementAssignment(
          order.id,
          requirement.id,
          requirement.serviceId,
          excludeProviderIds,
        );
        if (outcome) {
          this.realtime.notifyUsers([outcome.customerId, outcome.replacementProviderId]);
        }
      }
    }
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
    const address = typeof input.address === 'string' ? input.address.trim() : '';
    const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : '';
    const date = typeof input.date === 'string' ? input.date.trim() : '';
    const time = typeof input.time === 'string' ? input.time.trim() : '';
    const hours = Number(input.hours);

    if (!customerName) throw new BadRequestException('customerName is required.');
    if (!/^\d{7,15}$/.test(customerPhone)) {
      throw new BadRequestException('customerPhone must contain 7 to 15 digits.');
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
      throw new BadRequestException('hours must be an integer between 1 and 12.');
    }
    if (!address) throw new BadRequestException('address is required.');

    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 5) {
      throw new BadRequestException('items must contain between 1 and 5 service requirements.');
    }
    const items = (input.items as BookingItemInput[]).map((item) => {
      const serviceId = typeof item.serviceId === 'string' ? item.serviceId.trim() : '';
      const people = Number(item.people);
      if (!serviceId) throw new BadRequestException('Each item requires a serviceId.');
      if (!Number.isInteger(people) || people < 1 || people > 20) {
        throw new BadRequestException('Each item requires people between 1 and 20.');
      }
      return { serviceId, people };
    });
    const serviceIds = items.map((item) => item.serviceId);
    if (new Set(serviceIds).size !== serviceIds.length) {
      throw new BadRequestException('items cannot repeat the same serviceId.');
    }

    const scheduledAt = dateTimeInIndia(date, time);
    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds }, active: true },
      select: { id: true, name: true, unitPricePaise: true, pricingModel: true },
    });
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const missingServiceId = serviceIds.find((id) => !serviceById.has(id));
    if (missingServiceId) {
      throw new BadRequestException(`Unsupported or inactive serviceId: ${missingServiceId}`);
    }

    const lineItems = items.map((item) => {
      const service = serviceById.get(item.serviceId)!;
      return {
        service,
        people: item.people,
        lineAmountPaise: calculateLineAmountPaise(
          service.pricingModel,
          service.unitPricePaise,
          item.people,
          hours,
        ),
      };
    });
    const totalAmountPaise = lineItems.reduce((sum, item) => sum + item.lineAmountPaise, 0);

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
            create: lineItems.map((item) => ({
              serviceId: item.service.id,
              quantity: item.people,
              notes: instructions || null,
            })),
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

    const dateTime = formatIndiaDateTime(order.scheduledAt);

    return {
      id: order.id,
      customerName: order.customer.name,
      requirements: order.requirements.map((requirement) => ({
        serviceId: requirement.service.id,
        serviceName: requirement.service.name,
        people: requirement.quantity,
        lineTotal:
          (lineItems.find((item) => item.service.id === requirement.service.id)
            ?.lineAmountPaise ?? 0) / 100,
      })),
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
