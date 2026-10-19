import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { phoneNumber } from 'better-auth/plugins';
import { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaService } from './prisma.service.js';
import { Msg91Service } from './msg91.service.js';

type ProfileInput = {
  name?: unknown;
  phone?: unknown;
  role?: unknown;
  serviceArea?: unknown;
  serviceIds?: unknown;
};

type Identity = {
  authUserId: string;
  authName: string;
  phoneNumber?: string;
};

function createAuth(
  prisma: PrismaService,
  msg91: Msg91Service,
  secret: string,
  authMode: 'email' | 'phone',
) {
  const trustedOrigins = [
    'task-platform://',
    ...(process.env.NODE_ENV === 'development' ? ['exp://', 'exp://**'] : []),
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  return betterAuth({
    appName: 'Task Platform',
    baseURL:
      process.env.BETTER_AUTH_URL ??
      `http://localhost:${process.env.PORT ?? 3000}/api/auth`,
    secret,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    user: { modelName: 'authUser' },
    session: { modelName: 'authSession' },
    account: { modelName: 'authAccount' },
    verification: { modelName: 'authVerification' },
    emailAndPassword: { enabled: authMode === 'email' },
    plugins:
      authMode === 'phone'
        ? [
            phoneNumber({
              otpLength: 6,
              expiresIn: 300,
              allowedAttempts: 5,
              phoneNumberValidator: (value) => /^\+91[6-9]\d{9}$/.test(value),
              sendOTP: ({ phoneNumber: value }) => msg91.sendOtp(value),
              verifyOTP: ({ phoneNumber: value, code }) =>
                msg91.verifyOtp(value, code),
              signUpOnVerification: {
                getTempEmail: (value) =>
                  `${value.replace(/\D/g, '')}@phone.task-platform.invalid`,
                getTempName: (value) => value,
              },
            }),
          ]
        : [],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

@Injectable()
export class AuthService {
  private auth: AuthInstance | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly msg91: Msg91Service,
  ) {}

  getAuth() {
    if (this.auth) return this.auth;

    const authMode = this.getAuthMode();
    const secret = process.env.BETTER_AUTH_SECRET?.trim();
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'Authentication is not configured. Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.',
      );
    }

    this.auth = createAuth(this.prisma, this.msg91, secret, authMode);
    return this.auth;
  }

  async syncCurrentUser(
    headers: IncomingHttpHeaders,
    input: ProfileInput,
  ) {
    const session = await this.getAuth().api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) throw new UnauthorizedException('Sign in to continue.');

    const sessionUser = session.user;
    const phoneNumber =
      'phoneNumber' in sessionUser && typeof sessionUser.phoneNumber === 'string'
        ? sessionUser.phoneNumber
        : '';
    let phone: string;
    if (this.getAuthMode() === 'phone') {
      const phoneVerified =
        'phoneNumberVerified' in sessionUser &&
        sessionUser.phoneNumberVerified === true;
      if (!phoneVerified) {
        throw new UnauthorizedException('Verify your phone number to continue.');
      }
      phone = this.toApplicationPhone(phoneNumber);
    } else {
      const linkedUser = await this.prisma.user.findUnique({
        where: { authUserId: sessionUser.id },
        select: { phone: true },
      });
      const suppliedPhone =
        typeof input.phone === 'string' ? input.phone : linkedUser?.phone;
      if (typeof suppliedPhone !== 'string') {
        throw new BadRequestException('Enter a mobile number to finish setting up your account.');
      }
      phone = this.toApplicationPhone(suppliedPhone);
    }
    const authName =
      typeof sessionUser.name === 'string' ? sessionUser.name.trim() : '';
    const identity: Identity = {
      authUserId: sessionUser.id,
      authName,
      ...(phoneNumber ? { phoneNumber } : {}),
    };

    return this.syncApplicationUser(identity, input, phone);
  }

  async getCurrentApplicationUser(headers: IncomingHttpHeaders) {
    const session = await this.getAuth().api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!session) throw new UnauthorizedException('Sign in to continue.');

    const phoneNumber =
      'phoneNumber' in session.user &&
      typeof session.user.phoneNumber === 'string'
        ? session.user.phoneNumber
        : '';
    if (this.getAuthMode() === 'phone') {
      if (
        !('phoneNumberVerified' in session.user) ||
        session.user.phoneNumberVerified !== true
      ) {
        throw new UnauthorizedException('Verify your phone number to continue.');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { authUserId: session.user.id },
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
      },
    });
    if (
      !user ||
      (this.getAuthMode() === 'phone' &&
        user.phone !== this.toApplicationPhone(phoneNumber))
    ) {
      throw new UnauthorizedException('Complete your account setup to continue.');
    }

    return user;
  }

  private async syncApplicationUser(
    identity: Identity,
    input: ProfileInput,
    phone: string,
  ) {
    const linkedUser = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: {
        id: true,
        authUserId: true,
        role: true,
        name: true,
        phone: true,
        providerProfile: { select: { verified: true } },
      },
    });
    if (!linkedUser && this.getAuthMode() === 'email') {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (existingPhone) {
        throw new ConflictException(
          'This phone number already belongs to an account. Use a different test number or sign in to its linked account.',
        );
      }
    }
    const existingUser =
      linkedUser ??
      (this.getAuthMode() === 'phone'
        ? await this.prisma.user.findUnique({
            where: { phone },
            select: {
              id: true,
              authUserId: true,
              role: true,
              name: true,
              phone: true,
              providerProfile: { select: { verified: true } },
            },
          })
        : null);

    if (existingUser) {
      if (
        existingUser.authUserId &&
        existingUser.authUserId !== identity.authUserId
      ) {
        throw new ConflictException(
          'This phone number is already linked to another sign-in account.',
        );
      }

      if (
        existingUser.authUserId !== identity.authUserId &&
        input.role !== undefined &&
        input.role !== existingUser.role
      ) {
        throw new ConflictException(
          'This phone number already belongs to a different account type.',
        );
      }

      const requestedName =
        typeof input.name === 'string' ? input.name.trim() : '';
      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          authUserId: identity.authUserId,
          ...(existingUser.role === UserRole.CUSTOMER && requestedName
            ? { name: requestedName }
            : {}),
        },
        select: {
          id: true,
          role: true,
          name: true,
          phone: true,
          providerProfile: { select: { verified: true } },
        },
      });
      return this.toPublicUser(user);
    }

    const role =
      input.role === UserRole.PROVIDER
        ? UserRole.PROVIDER
        : input.role === undefined || input.role === UserRole.CUSTOMER
          ? UserRole.CUSTOMER
          : null;
    if (!role) throw new BadRequestException('Choose a valid account type.');

    const name = typeof input.name === 'string' ? input.name.trim() : identity.authName;
    if (!name || name === identity.phoneNumber) {
      throw new BadRequestException('Enter your name to finish setting up your account.');
    }

    if (role === UserRole.CUSTOMER) {
      const user = await this.prisma.user.create({
        data: {
          authUserId: identity.authUserId,
          role,
          name,
          phone,
        },
        select: {
          id: true,
          role: true,
          name: true,
          phone: true,
          providerProfile: { select: { verified: true } },
        },
      });
      return this.toPublicUser(user);
    }

    const serviceArea =
      typeof input.serviceArea === 'string' ? input.serviceArea.trim() : '';
    const serviceIds = Array.isArray(input.serviceIds)
      ? [
          ...new Set(
            input.serviceIds
              .filter((id): id is string => typeof id === 'string')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        ]
      : [];
    if (!serviceArea) {
      throw new BadRequestException('Enter your service area.');
    }
    if (serviceIds.length === 0) {
      throw new BadRequestException('Choose at least one service you provide.');
    }

    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds }, active: true },
      select: { id: true },
    });
    if (services.length !== serviceIds.length) {
      throw new BadRequestException('One or more selected services are unavailable.');
    }

    const user = await this.prisma.user.create({
      data: {
        authUserId: identity.authUserId,
        role,
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
      select: {
        id: true,
        role: true,
        name: true,
        phone: true,
        providerProfile: { select: { verified: true } },
      },
    });
    return this.toPublicUser(user);
  }

  private toApplicationPhone(phoneNumber: string): string {
    if (/^[6-9]\d{9}$/.test(phoneNumber)) return phoneNumber;
    if (/^\+91[6-9]\d{9}$/.test(phoneNumber)) return phoneNumber.slice(3);
    throw new BadRequestException('Enter a valid 10-digit Indian mobile number.');
  }

  private getAuthMode(): 'email' | 'phone' {
    const mode = process.env.AUTH_MODE ?? 'phone';
    if (mode !== 'email' && mode !== 'phone') {
      throw new ServiceUnavailableException(
        'AUTH_MODE must be either "email" or "phone".',
      );
    }
    return mode;
  }

  private toPublicUser(user: {
    id: string;
    role: UserRole;
    name: string;
    phone: string;
    providerProfile: { verified: boolean } | null;
  }) {
    return {
      id: user.id,
      role: user.role,
      name: user.name,
      phone: user.phone,
      providerVerified: user.providerProfile?.verified ?? false,
    };
  }
}
