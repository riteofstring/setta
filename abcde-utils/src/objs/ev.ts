import { EVType } from "../types/ev";

// Entered Value
export function newEV({ value = "", childId }: EVType): EVType {
  return { value, childId };
}
