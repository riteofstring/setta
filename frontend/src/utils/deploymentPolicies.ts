import {
  createDefaultAppPolicy as createGeneratedDefaultAppPolicy,
  createSharePolicy,
  type SharePolicy,
} from "./generatedTypes";

export const createDefaultAppPolicy = createGeneratedDefaultAppPolicy;

export function createDefaultSharePolicy(): SharePolicy {
  return createSharePolicy();
}

export function resolveAppPolicy(
  appPolicy: SharePolicy | null | undefined,
): SharePolicy {
  return appPolicy ?? createDefaultAppPolicy();
}
