// The compiled stylesheet scopes its base rules (scopedBase.css) under this marker class, so
// every DOM root the package renders must carry it — the canvas, the separately mounted toolbar
// and tooltip surfaces, and the drag overlays portaled to document.body.
export const WORKSPACE_SCOPE_CLASS_NAME = "setta-workspace";
