import { describe, expect, it } from "vitest";
import {
  createDefaultAppPolicy,
  createDefaultSharePolicy,
  resolveAppPolicy,
} from "./deploymentPolicies";
import {
  GENERATED_DEFAULT_APP_POLICY,
  createSharePolicy,
} from "./generatedTypes";

describe("deploymentPolicies", () => {
  it("reuses generated share defaults", () => {
    expect(createDefaultSharePolicy()).toEqual(createSharePolicy());
  });

  it("reuses generated app defaults", () => {
    expect(createDefaultAppPolicy()).toEqual(GENERATED_DEFAULT_APP_POLICY);
  });

  it("preserves an explicit app policy", () => {
    const policy = createSharePolicy({ allowLLM: true, allowRun: false });

    expect(resolveAppPolicy(policy)).toBe(policy);
  });

  it("falls back to the shared app defaults when no policy is present", () => {
    expect(resolveAppPolicy(null)).toEqual(createDefaultAppPolicy());
    expect(resolveAppPolicy(undefined)).toEqual(createDefaultAppPolicy());
  });
});
