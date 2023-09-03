import _ from "lodash";
import { subscribeWithSelector } from "zustand/middleware";
import { createProjectState } from "./utils";

export const useWebsocketRooms = createProjectState(
  subscribeWithSelector((set) => ({
    createRoom: (id) => set(() => ({ [id]: "" })),
    deleteRoom: (id) => set((state) => _.omit(state, [id]), true),
    setMessage: (id, message) => set(() => ({ [id]: message })),
  }))
);
