import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
  assignProvider(@Param('id') id: string, @Body() input: { providerId?: unknown }) {
    return this.appService.assignProvider(id, input.providerId);
  }

  @Post('bookings')
  createBooking(@Body() bookingInput: Record<string, unknown>) {
    return this.appService.createBooking(bookingInput);
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
}
