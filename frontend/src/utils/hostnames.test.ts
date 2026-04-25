import { isLocalHostname } from "@setta/app-subsystem-frontend-sdk";
import { describe, expect, it } from "vitest";

describe("isLocalHostname", () => {
  it("accepts common local hostnames", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("::1")).toBe(true);
  });

  it("rejects non-local hostnames", () => {
    expect(isLocalHostname("example.com")).toBe(false);
    expect(isLocalHostname("192.168.0.1")).toBe(false);
  });
});
