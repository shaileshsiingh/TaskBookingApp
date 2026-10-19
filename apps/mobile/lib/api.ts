import { Platform } from 'react-native';

export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ||
  Platform.select({
    ios: 'http://localhost:3000/api',
    android: 'http://10.0.2.2:3000/api',
    default: 'http://localhost:3000/api',
  }) ||
  'http://localhost:3000/api';

export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `Request failed (${response.status}).`;
    try {
      const parsed: { message?: string | string[] } = JSON.parse(body);
      message = Array.isArray(parsed.message)
        ? parsed.message.join(' ')
        : parsed.message || message;
    } catch {
      message = `Request failed (${response.status}).`;
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}
