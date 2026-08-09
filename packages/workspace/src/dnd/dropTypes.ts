// The reference's `dropTypes.ts` with the generated `ObjectValues` helper re-authored inline
// (extraction seam 6).
export const BehaviorDropTypeEnum = {
  INVALID: "INVALID",
} as const;

export type BehaviorDropType = (typeof BehaviorDropTypeEnum)[keyof typeof BehaviorDropTypeEnum];

export const behaviorToPretty = {
  INVALID: "No nesting",
};
