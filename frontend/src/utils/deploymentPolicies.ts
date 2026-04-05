import {
  GENERATED_DEFAULT_APP_POLICY,
  createPolicy,
  type Policy,
} from "./generatedTypes";

export function createDefaultAppPolicy(): Policy {
  return createPolicy({ ...GENERATED_DEFAULT_APP_POLICY });
}

export function createDefaultSharePolicy(): Policy {
  return createPolicy();
}

export function resolveAppPolicy(appPolicy: Policy | null | undefined): Policy {
  return appPolicy ?? createDefaultAppPolicy();
}
