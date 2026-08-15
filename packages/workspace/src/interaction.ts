// The package's single documented interaction boundary (extraction seam 5). Hosts mark
// interactive or self-scrolling descendants with these class names instead of learning XYFlow or
// dnd-kit internals. Values match the frozen reference's `utils/constants.ts`.

// Excludes an element (and its subtree) from starting a section drag.
export const NO_DRAG_CLASS_NAME = "nodrag";
// Lets an element keep its own wheel behavior instead of canvas zoom/pan-on-scroll.
export const NO_WHEEL_CLASS_NAME = "nowheel";
// Package-internal boundary for a vertically scrolling surface. Vertical-dominant wheel input
// stays native; horizontal-dominant input remains owned by canvas pan-on-scroll. This is not part
// of the host interaction seam because consumers use `nowheel` when they own every wheel axis.
export const NATIVE_VERTICAL_WHEEL_CLASS_NAME = "setta-native-wheel-y";
// Gives a manually handled wheel gesture to the control while the canvas synchronously cancels
// the browser default, preventing Chrome from latching horizontal history navigation.
export const MANUAL_WHEEL_CLASS_NAME = "setta-manual-wheel";
// Excludes an element from starting a canvas pan.
export const NO_PAN_CLASS_NAME = "nopan";
// Keeps a focused scalar control's Arrow keys with the control instead of section movement.
export const SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION = "setta-prevent-arrow-keys-moving-section";
// Prevents the pressed-section outline treatment while the element is active.
export const SETTA_PREVENT_SECTION_ACTIVE_CSS = "setta-prevent-section-active-css";
// Prevents a click on the element from activating the enclosing section.
export const SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER = "setta-prevent-section-on-click-trigger";
