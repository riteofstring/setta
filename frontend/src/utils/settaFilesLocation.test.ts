import { describe, expect, it } from "vitest";
import {
  chooseWorkspaceHistorySettaFilesLocation,
  normalizeSettaFilesLocation,
} from "./settaFilesLocation";

describe("settaFilesLocation", () => {
  it("normalizes setta files location values", () => {
    expect(normalizeSettaFilesLocation(undefined)).toBe("auto");
    expect(normalizeSettaFilesLocation("  GLOBAL ")).toBe("global");
    expect(normalizeSettaFilesLocation("nope")).toBe("auto");
  });

  it("stores auto in history when requested is auto", () => {
    expect(
      chooseWorkspaceHistorySettaFilesLocation({
        requested: "auto",
        resolved: "global",
      }),
    ).toBe("auto");
  });

  it("stores resolved value when requested is explicit", () => {
    expect(
      chooseWorkspaceHistorySettaFilesLocation({
        requested: "global",
        resolved: "local",
      }),
    ).toBe("local");
  });

  it("falls back to requested explicit value when resolved is missing", () => {
    expect(
      chooseWorkspaceHistorySettaFilesLocation({
        requested: "global",
        resolved: null,
      }),
    ).toBe("global");
  });

  it("falls back to requested explicit value when resolved location is invalid", () => {
    expect(
      chooseWorkspaceHistorySettaFilesLocation({
        requested: "global",
        resolved: "auto",
      }),
    ).toBe("global");
  });
});
