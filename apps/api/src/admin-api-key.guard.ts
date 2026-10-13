import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

type AdminRequest = {
  headers: {
    'x-admin-api-key'?: string | string[];
  };
};

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedKey = process.env.ADMIN_API_KEY;
    if (!expectedKey) {
      throw new ServiceUnavailableException('Admin API key is not configured.');
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const providedKey = request.headers['x-admin-api-key'];
    if (
      typeof providedKey !== 'string' ||
      Buffer.byteLength(providedKey) !== Buffer.byteLength(expectedKey) ||
      !timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey))
    ) {
      throw new UnauthorizedException('A valid admin API key is required.');
    }

    return true;
  }
}
