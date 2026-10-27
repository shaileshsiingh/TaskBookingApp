import { io } from 'socket.io-client';
import { apiBaseUrl } from './api';
import { authClient } from './auth-client';

const socketOrigin = apiBaseUrl.replace(/\/api\/?$/, '');

export async function connectRealtime(onSync: () => void): Promise<() => void> {
  const cookie = await authClient.getCookie();
  if (!cookie) return () => {};

  const socket = io(socketOrigin, {
    transports: ['websocket'],
    extraHeaders: { cookie },
  });

  socket.on('sync', onSync);

  return () => {
    socket.off('sync', onSync);
    socket.disconnect();
  };
}
