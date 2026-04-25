import { describe, expect, it } from "vitest";
import { apiVersion, register } from "../src/index";

describe("setta-watch-code frontend registration", () => {
  it("exports the current plugin frontend API version", () => {
    expect(apiVersion).toBe(1);
  });

  it("loads without registering duplicate host-owned UI during staged extraction", () => {
    expect(() => register({})).not.toThrow();
  });
});
