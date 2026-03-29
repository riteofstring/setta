import { describe, expect, it } from "vitest";
import {
  getProjectChatBootPointerCandidates,
  recordProjectChatPointerDownLocation,
  recordProjectChatPointerUpLocation,
  resetProjectChatBootPointerLocations,
  setProjectChatBootPointerLocations,
} from "./projectChatWindowingPointerTracking";

describe("projectChatWindowingPointerTracking", () => {
  it("returns pointer candidates in pointerup then pointerdown order", () => {
    resetProjectChatBootPointerLocations();
    recordProjectChatPointerDownLocation({ x: 10, y: 20 });
    recordProjectChatPointerUpLocation({ x: 30, y: 40 });

    expect(getProjectChatBootPointerCandidates()).toEqual([
      { x: 30, y: 40 },
      { x: 10, y: 20 },
    ]);
  });

  it("clones stored points and clears them on reset", () => {
    const downPoint = { x: 50, y: 60 };
    const upPoint = { x: 70, y: 80 };
    setProjectChatBootPointerLocations({
      lastPointerDownLocation: downPoint,
      lastPointerUpLocation: upPoint,
    });
    downPoint.x = 0;
    upPoint.y = 0;

    const candidates = getProjectChatBootPointerCandidates();
    expect(candidates).toEqual([
      { x: 70, y: 80 },
      { x: 50, y: 60 },
    ]);

    candidates[0]!.x = -1;
    expect(getProjectChatBootPointerCandidates()).toEqual([
      { x: 70, y: 80 },
      { x: 50, y: 60 },
    ]);

    resetProjectChatBootPointerLocations();
    expect(getProjectChatBootPointerCandidates()).toEqual([]);
  });
});
