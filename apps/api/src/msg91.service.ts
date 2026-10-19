import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

type Msg91Response = {
  type?: unknown;
  status?: unknown;
  message?: unknown;
};

@Injectable()
export class Msg91Service {
  private readonly logger = new Logger(Msg91Service.name);
  private readonly baseUrl = 'https://control.msg91.com/api/v5/otp';

  async sendOtp(phoneNumber: string): Promise<void> {
    const { authKey, templateId } = this.getConfiguration();
    const url = new URL(this.baseUrl);
    url.searchParams.set('template_id', templateId);
    url.searchParams.set('mobile', this.getMsg91Mobile(phoneNumber));
    url.searchParams.set('otp_length', '6');
    url.searchParams.set('otp_expiry', '5');

    const response = await this.request(url, {
      method: 'POST',
      headers: {
        authkey: authKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const payload = await this.readResponse(response);

    if (!response.ok || this.isError(payload)) {
      this.logger.error('MSG91 rejected an OTP send request.');
      throw new ServiceUnavailableException(
        'Could not send a verification code. Please try again later.',
      );
    }
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
    const { authKey } = this.getConfiguration();
    const url = new URL(`${this.baseUrl}/verify`);
    url.searchParams.set('otp', code);
    url.searchParams.set('mobile', this.getMsg91Mobile(phoneNumber));

    const response = await this.request(url, {
      method: 'GET',
      headers: { authkey: authKey },
    });
    const payload = await this.readResponse(response);

    if (response.status === 401 || response.status === 403 || response.status >= 500) {
      this.logger.error(`MSG91 OTP verification failed with HTTP ${response.status}.`);
      throw new ServiceUnavailableException(
        'Phone verification is temporarily unavailable. Please try again.',
      );
    }

    return response.ok && this.isSuccess(payload);
  }

  private getConfiguration(): { authKey: string; templateId: string } {
    const authKey = process.env.MSG91_AUTH_KEY?.trim();
    const templateId = process.env.MSG91_OTP_TEMPLATE_ID?.trim();

    if (!authKey || !templateId) {
      throw new ServiceUnavailableException(
        'Phone sign-in is not configured. Add MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID to the API environment.',
      );
    }

    return { authKey, templateId };
  }

  private getMsg91Mobile(phoneNumber: string): string {
    if (!/^\+91[6-9]\d{9}$/.test(phoneNumber)) {
      throw new ServiceUnavailableException(
        'Only valid Indian mobile phone numbers are supported.',
      );
    }
    return phoneNumber.slice(1);
  }

  private async request(
    url: URL,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(
        'Could not reach MSG91.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Phone verification is temporarily unavailable. Please try again.',
      );
    }
  }

  private async readResponse(response: Response): Promise<Msg91Response> {
    try {
      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('MSG91 returned a non-object response.');
      }
      return payload as Msg91Response;
    } catch (error) {
      this.logger.error(
        'MSG91 returned an unreadable response.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Phone verification is temporarily unavailable. Please try again.',
      );
    }
  }

  private isSuccess(payload: Msg91Response): boolean {
    return (
      payload.type === 'success' ||
      payload.status === 'success' ||
      payload.message === 'OTP verified successfully'
    );
  }

  private isError(payload: Msg91Response): boolean {
    return payload.type === 'error' || payload.status === 'error';
  }
}
