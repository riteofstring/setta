type CustomWebSocket = WebSocket & {
  isAlive: boolean;
  terminate: () => void;
  ping: () => void;
  location: string;
  isCLI: boolean;
  websocketId: string;
  user: string;
};

export const allSockets: Record<string, Record<string, CustomWebSocket>> = {};

export const allCodeJson: Record<string, Record<string, any>> = {};
