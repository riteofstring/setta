import { create } from "./utils";

export const useWebsocketConnectionList = create(() => ({
  connectedTo: null,
  connections: [],
}));
