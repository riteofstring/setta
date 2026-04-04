import { createSharePolicy, type SharePolicy } from "./generatedTypes";

const APP_POLICY_DEFAULT_OVERRIDES: Partial<SharePolicy> = {
  allowVariantChanges: false,
  allowLayoutChanges: false,
  allowRun: true,
};

export function createDefaultSharePolicy(): SharePolicy {
  return createSharePolicy();
}

export function createDefaultAppPolicy(): SharePolicy {
  return createSharePolicy(APP_POLICY_DEFAULT_OVERRIDES);
}

export function resolveAppPolicy(
  appPolicy: SharePolicy | null | undefined,
): SharePolicy {
  return appPolicy ?? createDefaultAppPolicy();
}
