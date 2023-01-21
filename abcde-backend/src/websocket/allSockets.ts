type CustomWebSocket = WebSocket & {
  isAlive: boolean;
  terminate: () => void;
  ping: () => void;
};

export const allSockets: Record<string, Set<CustomWebSocket>> = {};
