import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient } from 'better-auth/client/plugins';
import { apiBaseUrl } from './api';

export const authClient = createAuthClient({
  baseURL: `${apiBaseUrl}/auth`,
  plugins: [
    phoneNumberClient(),
    expoClient({
      scheme: 'task-platform',
      storagePrefix: 'task-platform',
      storage: SecureStore,
    }),
  ],
});
