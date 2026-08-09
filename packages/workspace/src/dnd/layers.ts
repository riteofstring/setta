// Body-portal layers used during free movement. Drop feedback must remain above the opaque drag
// preview so an invalid target is legible at the pointer, not merely around its edges.
export const DRAG_PREVIEW_Z_INDEX = 1000;
export const DROP_FEEDBACK_Z_INDEX = DRAG_PREVIEW_Z_INDEX + 1;
