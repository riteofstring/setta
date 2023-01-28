type CustomWebSocket = WebSocket & {
  isAlive: boolean;
  terminate: () => void;
  ping: () => void;
  currPage: string;
};

export const allSockets: Record<string, Set<CustomWebSocket>> = {};
