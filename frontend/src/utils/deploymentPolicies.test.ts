import { describe, expect, it } from "vitest";
import {
  createDefaultAppPolicy,
  createDefaultSharePolicy,
  resolveAppPolicy,
} from "./deploymentPolicies";
import { DefaultAppPolicy, createPolicy } from "./generatedTypes";

describe("deploymentPolicies", () => {
  it("reuses generated share defaults", () => {
    expect(createDefaultSharePolicy()).toEqual(createPolicy());
  });

  it("reuses generated app defaults", () => {
    expect(createDefaultAppPolicy()).toEqual(DefaultAppPolicy);
  });

  it("preserves an explicit app policy", () => {
    const policy = createPolicy({ allowLLM: true, allowRun: false });

    expect(resolveAppPolicy(policy)).toBe(policy);
  });

  it("falls back to the shared app defaults when no policy is present", () => {
    expect(resolveAppPolicy(null)).toEqual(createDefaultAppPolicy());
    expect(resolveAppPolicy(undefined)).toEqual(createDefaultAppPolicy());
  });
});
