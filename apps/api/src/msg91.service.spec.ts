import { ServiceUnavailableException } from '@nestjs/common';
import { Msg91Service } from './msg91.service.js';

describe('Msg91Service', () => {
  let service: Msg91Service;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('MSG91_AUTH_KEY', 'test-key');
    vi.stubEnv('MSG91_OTP_TEMPLATE_ID', 'test-template');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    service = new Msg91Service();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends an OTP using the configured MSG91 template', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'success' }), { status: 200 }),
    );

    await expect(service.sendOtp('+919876543210')).resolves.toBeUndefined();

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    if (!(requestUrl instanceof URL)) throw new Error('Expected a URL request.');
    const url = requestUrl;
    expect(url.origin + url.pathname).toBe(
      'https://control.msg91.com/api/v5/otp',
    );
    expect(url.searchParams.get('mobile')).toBe('919876543210');
    expect(url.searchParams.get('template_id')).toBe('test-template');
    expect(url.searchParams.get('otp_length')).toBe('6');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.headers).toMatchObject({ authkey: 'test-key' });
  });

  it('returns false when MSG91 rejects an OTP code', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'error' }), { status: 200 }),
    );

    await expect(
      service.verifyOtp('+919876543210', '123456'),
    ).resolves.toBe(false);
    const [requestUrl] = fetchMock.mock.calls[0];
    if (!(requestUrl instanceof URL)) throw new Error('Expected a URL request.');
    expect(requestUrl.pathname).toBe('/api/v5/otp/verify');
  });

  it('reports missing MSG91 configuration instead of pretending to send', async () => {
    vi.stubEnv('MSG91_AUTH_KEY', '');

    await expect(service.sendOtp('+919876543210')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
