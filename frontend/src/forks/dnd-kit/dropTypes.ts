import { ObjectValues } from "utils/generatedTypes";

export const BehaviorDropTypeEnum = {
  INVALID: "INVALID",
} as const;

export type BehaviorDropType = ObjectValues<typeof BehaviorDropTypeEnum>;

export const behaviorToPretty = {
  INVALID: "No nesting",
};
