import {
  GENERATED_DEFAULT_APP_POLICY,
  createSharePolicy,
  type SharePolicy,
} from "./generatedTypes";

export function createDefaultAppPolicy(): SharePolicy {
  return createSharePolicy({ ...GENERATED_DEFAULT_APP_POLICY });
}

export function createDefaultSharePolicy(): SharePolicy {
  return createSharePolicy();
}

export function resolveAppPolicy(
  appPolicy: SharePolicy | null | undefined,
): SharePolicy {
  return appPolicy ?? createDefaultAppPolicy();
}
