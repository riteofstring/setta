import { EVType } from "../types/ev";

// Entered Value
export function newEV({ value = "", childId = null }: Partial<EVType>): EVType {
  return { value, childId };
}
