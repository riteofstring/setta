import { EVType } from "../types/ev";
import { maybeNewId } from "../utils";

// Entered Value
export function newEV({
  id,
  value = "",
  childId = null,
}: Partial<EVType>): EVType {
  return { id: maybeNewId(id), value, childId };
}
