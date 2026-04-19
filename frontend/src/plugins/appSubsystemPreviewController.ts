import { AppSpecPatchPolicyConfig } from "utils/generatedTypes";

// Keep the generated patch-policy value export reachable from `frontend/src`
// until the cleanup pipeline understands plugin-owned frontend consumers.
void AppSpecPatchPolicyConfig;

export * from "../../../plugins/setta-json-render-app-gen/frontend/src/appSubsystemPreviewController";
