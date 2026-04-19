import { AppSpecPatchPolicyConfig } from "./generatedTypes";

// Keep the generated app patch policy export reachable while the implementation
// lives under the plugin frontend tree and cleanup still scans `frontend/src`.
void AppSpecPatchPolicyConfig;

export * from "../../../plugins/setta-json-render-app-gen/frontend/src/appSpecPatchStream";
