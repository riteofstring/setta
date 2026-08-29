export const BehaviorDropTypeEnum = {
  INVALID: "INVALID",
} as const;

export type BehaviorDropType =
  (typeof BehaviorDropTypeEnum)[keyof typeof BehaviorDropTypeEnum];

export const behaviorToPretty = {
  INVALID: "No nesting",
};
