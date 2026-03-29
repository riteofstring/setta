import { describe, expect, it } from "vitest";
import { configureLiveDictAreaPixiStaticScene } from "./LiveDictAreaPixiScene";

describe("configureLiveDictAreaPixiStaticScene", () => {
  it("disables Pixi stage interactivity for the scene-owned dict-area shell", () => {
    const app = {
      canvas: {
        style: {
          pointerEvents: "auto",
        },
      },
      stage: {
        eventMode: "auto",
        interactiveChildren: true,
      },
    };

    configureLiveDictAreaPixiStaticScene(app);

    expect(app.stage.eventMode).toBe("none");
    expect(app.stage.interactiveChildren).toBe(false);
    expect(app.canvas.style.pointerEvents).toBe("none");
  });
});
