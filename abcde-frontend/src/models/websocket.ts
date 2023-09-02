import _ from "lodash";
import { createProjectState } from "./utils";

export const useWebsocketRooms = createProjectState((set) => ({
  createRoom: (id) => set(() => ({ [id]: "" })),
  deleteRoom: (id) => set((state) => _.omit(state, [id]), true),
  setMessage: (id, message) => set(() => ({ [id]: message })),
}));
