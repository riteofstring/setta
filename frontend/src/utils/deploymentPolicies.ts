import { DefaultAppPolicy, createPolicy, type Policy } from "./generatedTypes";

export function createDefaultAppPolicy(): Policy {
  return createPolicy({ ...DefaultAppPolicy });
}

export function createDefaultSharePolicy(): Policy {
  return createPolicy();
}

export function resolveAppPolicy(appPolicy: Policy | null | undefined): Policy {
  return appPolicy ?? createDefaultAppPolicy();
}
