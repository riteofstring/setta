import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceCreationCommands,
  getWorkspaceMenuActions,
  registerWorkspaceCreationCommands,
  registerWorkspaceMenuActions,
} from "./workspaceMenuRegistry";

afterEach(() => {
  registerWorkspaceCreationCommands([]);
  registerWorkspaceMenuActions([]);
});

describe("workspace menu registries", () => {
  it("normalizes and replaces creation commands without retaining the caller array", () => {
    const createSection = vi.fn();
    const commands = [
      {
        id: "host-note",
        label: "  Host note  ",
        group: "  Host  ",
        createSection,
      },
    ];

    registerWorkspaceCreationCommands(commands);
    commands.length = 0;

    expect(getWorkspaceCreationCommands()).toEqual([
      expect.objectContaining({ id: "host-note", label: "Host note", group: "Host" }),
    ]);
    expect(Object.isFrozen(getWorkspaceCreationCommands()[0])).toBe(true);

    registerWorkspaceCreationCommands([]);
    expect(getWorkspaceCreationCommands()).toEqual([]);
  });

  it("partitions typed actions by scope and replaces the prior registration", () => {
    const paneAction = vi.fn();
    const itemAction = vi.fn();
    registerWorkspaceMenuActions([
      { id: "pane-report", scope: "pane", label: "Pane report", onSelect: paneAction },
      { id: "item-report", scope: "item", label: "Item report", onSelect: itemAction },
    ]);

    expect(getWorkspaceMenuActions("pane").map((action) => action.id)).toEqual(["pane-report"]);
    expect(getWorkspaceMenuActions("item").map((action) => action.id)).toEqual(["item-report"]);
    expect(getWorkspaceMenuActions("section")).toEqual([]);

    registerWorkspaceMenuActions([]);
    expect(getWorkspaceMenuActions("pane")).toEqual([]);
  });

  it("rejects malformed and duplicate extension definitions specifically", () => {
    expect(() =>
      registerWorkspaceCreationCommands([
        { id: "bad id", label: "Bad", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/invalid id/);
    expect(() =>
      registerWorkspaceCreationCommands([
        { id: "same", label: "One", group: "Host", createSection: vi.fn() },
        { id: "same", label: "Two", group: "Host", createSection: vi.fn() },
      ]),
    ).toThrow(/duplicate id same/);
    expect(() =>
      registerWorkspaceMenuActions([
        { id: "empty-label", scope: "section", label: "  ", onSelect: vi.fn() },
      ]),
    ).toThrow(/non-empty label/);
  });
});
