import { subscribeWithSelector } from "zustand/middleware";
import { createProjectState } from "./utils";

export const useWebsocketRooms = createProjectState(
  subscribeWithSelector(() => ({})),
);
