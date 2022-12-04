import { LOGIN } from "utils/pageNames";
import { create } from "./utils";

export const useCurrPage = create((set) => ({
  name: LOGIN,
  setName: (payload) => set(() => ({ name: payload })),
}));
