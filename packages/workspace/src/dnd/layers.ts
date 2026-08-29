// The invalid-drop portal escapes the target section's stacking context, but the dragged preview
// remains the topmost surface as in Setta. This keeps the target feedback visible without turning
// its label into the dominant object under the pointer.
export const DROP_TARGET_Z_INDEX = 500;
export const DROP_FEEDBACK_Z_INDEX = 750;
export const DRAG_PREVIEW_Z_INDEX = 1000;
