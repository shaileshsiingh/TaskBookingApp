import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { AppService } from './app.service.js';
import { AuthService } from './auth.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('services')
  getServices() {
    return this.appService.getServices();
  }

  @Get('bookings')
  @UseGuards(AdminApiKeyGuard)
  getBookings() {
    return this.appService.getBookings();
  }

  @Get('bookings/:id')
  @UseGuards(AdminApiKeyGuard)
  getBookingById(@Param('id') id: string) {
    return this.appService.getBookingById(id);
  }

  @Post('bookings/:id/assignments')
  @UseGuards(AdminApiKeyGuard)
  assignProvider(
    @Param('id') id: string,
    @Body() input: { providerId?: unknown; requirementId?: unknown },
  ) {
    return this.appService.assignProvider(id, input.providerId, input.requirementId);
  }

  @Post('bookings')
  async createBooking(
    @Req() request: Request,
    @Body() bookingInput: Record<string, unknown>,
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can create bookings.');
    }
    return this.appService.createBooking({
      ...bookingInput,
      customerName: user.name,
      customerPhone: user.phone,
    });
  }

  @Get('customer/bookings')
  async getCustomerBookings(@Req() request: Request) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can view their bookings.');
    }
    return this.appService.getCustomerBookings(user.id);
  }

  @Patch('customer/orders/:id/cancellation')
  async cancelOrder(@Req() request: Request, @Param('id') id: string) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can cancel their bookings.');
    }
    return this.appService.cancelOrder(user.id, id);
  }

  @Post('customer/orders/:id/dispute')
  async raiseDispute(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() input: { reason?: unknown },
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can report an issue.');
    }
    return this.appService.raiseDispute(user.id, id, input.reason);
  }

  @Get('customer/addresses')
  async getCustomerAddresses(@Req() request: Request) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can manage saved addresses.');
    }
    return this.appService.getCustomerAddresses(user.id);
  }

  @Post('customer/addresses')
  async createCustomerAddress(
    @Req() request: Request,
    @Body() input: { line?: unknown; label?: unknown },
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can manage saved addresses.');
    }
    return this.appService.createCustomerAddress(user.id, input.line, input.label);
  }

  @Delete('customer/addresses/:id')
  async deleteCustomerAddress(@Req() request: Request, @Param('id') id: string) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can manage saved addresses.');
    }
    return this.appService.deleteCustomerAddress(user.id, id);
  }

  @Patch('customer/assignments/:id/confirmation')
  async confirmCustomerAssignment(
    @Req() request: Request,
    @Param('id') id: string,
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can confirm job completion.');
    }
    return this.appService.confirmCustomerAssignment(user.id, id);
  }

  @Post('customer/assignments/:id/review')
  async createProviderReview(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() input: { rating?: unknown; comment?: unknown },
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Only customer accounts can rate providers.');
    }
    return this.appService.createProviderReview(
      user.id,
      id,
      input.rating,
      input.comment,
    );
  }

  @Get('provider/assignments')
  async getProviderAssignments(@Req() request: Request) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.PROVIDER) {
      throw new ForbiddenException('Only provider accounts can view assigned jobs.');
    }
    return this.appService.getProviderAssignments(user.id);
  }

  @Patch('provider/assignments/:id/status')
  async updateProviderAssignment(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() input: { status?: unknown; otp?: unknown },
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.PROVIDER) {
      throw new ForbiddenException('Only provider accounts can update assigned jobs.');
    }
    return this.appService.updateProviderAssignment(user.id, id, input.status, input.otp);
  }

  @Patch('provider/availability')
  async setProviderAvailability(
    @Req() request: Request,
    @Body() input: { available?: unknown },
  ) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.PROVIDER) {
      throw new ForbiddenException('Only provider accounts can update their availability.');
    }
    return this.appService.setProviderAvailability(user.id, input.available);
  }

  @Get('provider/earnings')
  async getProviderEarnings(@Req() request: Request) {
    const user = await this.authService.getCurrentApplicationUser(request.headers);
    if (user.role !== UserRole.PROVIDER) {
      throw new ForbiddenException('Only provider accounts can view earnings.');
    }
    return this.appService.getProviderEarnings(user.id);
  }

  @Get('providers')
  @UseGuards(AdminApiKeyGuard)
  getProviders() {
    return this.appService.getProviders();
  }

  @Post('providers')
  @UseGuards(AdminApiKeyGuard)
  createProvider(@Body() input: Record<string, unknown>) {
    return this.appService.createProvider(input);
  }

  @Patch('providers/:id/verification')
  @UseGuards(AdminApiKeyGuard)
  setProviderVerification(
    @Param('id') id: string,
    @Body() input: { verified?: unknown },
  ) {
    return this.appService.setProviderVerification(id, input.verified);
  }

  @Patch('admin/orders/:id/dispute-resolution')
  @UseGuards(AdminApiKeyGuard)
  resolveDispute(
    @Param('id') id: string,
    @Body() input: { action?: unknown; refundAmount?: unknown; note?: unknown },
  ) {
    return this.appService.resolveDispute(id, input.action, input.refundAmount, input.note);
  }

  @Get('admin/catalog')
  @UseGuards(AdminApiKeyGuard)
  getAdminCatalog() {
    return this.appService.getAdminCatalog();
  }

  @Post('admin/categories')
  @UseGuards(AdminApiKeyGuard)
  createCategory(@Body() input: { name?: unknown }) {
    return this.appService.createCategory(input.name);
  }

  @Patch('admin/categories/:id')
  @UseGuards(AdminApiKeyGuard)
  updateCategory(
    @Param('id') id: string,
    @Body() input: { name?: unknown; active?: unknown },
  ) {
    return this.appService.updateCategory(id, input.name, input.active);
  }

  @Post('admin/services')
  @UseGuards(AdminApiKeyGuard)
  createService(@Body() input: Record<string, unknown>) {
    return this.appService.createService(input);
  }

  @Patch('admin/services/:id')
  @UseGuards(AdminApiKeyGuard)
  updateService(@Param('id') id: string, @Body() input: Record<string, unknown>) {
    return this.appService.updateService(id, input);
  }

  @Get('admin/customers')
  @UseGuards(AdminApiKeyGuard)
  getCustomers() {
    return this.appService.getCustomers();
  }
}
