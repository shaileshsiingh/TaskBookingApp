import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getCurrentUser(@Req() request: Request) {
    return this.authService.syncCurrentUser(request.headers, {});
  }

  @Post('me')
  syncCurrentUser(
    @Req() request: Request,
    @Body() input: Record<string, unknown>,
  ) {
    return this.authService.syncCurrentUser(request.headers, input);
  }
}
