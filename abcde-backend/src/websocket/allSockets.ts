type CustomWebSocket = WebSocket & {
  isAlive: boolean;
  terminate: () => void;
  ping: () => void;
  location: string;
};

export const allSockets: Record<string, Record<string, CustomWebSocket>> = {};
