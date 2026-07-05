import { Container, Graphics, Rectangle } from "pixi.js";

import { drawPortVisualState, portKey, portLocalPosition } from "./pixi-renderer-helpers";

export function createWorkflowGraphPortContainer({
  drawingEdgeActive,
  node,
  port,
  portHitRadiusScreen,
  portVisuals,
  portVisualStates,
  setPortVisualState,
}) {
  const position = portLocalPosition(node, port.id);
  const container = new Container();
  container.x = position.x;
  container.y = position.y;
  container.eventMode = "static";
  container.cursor = port.role === "source" ? "crosshair" : "copy";
  container.hitArea = new Rectangle(
    -portHitRadiusScreen,
    -portHitRadiusScreen,
    portHitRadiusScreen * 2,
    portHitRadiusScreen * 2,
  );
  const visual = new Graphics();
  const key = portKey(node.id, port.id);
  portVisuals.set(key, visual);
  container.addChild(visual);
  portVisualStates.set(key, "idle");
  drawPortVisualState(visual, port, "idle");
  container.on("pointerover", () => {
    if (!drawingEdgeActive()) {
      setPortVisualState(node.id, port.id, "hover");
    }
  });
  container.on("pointerout", () => {
    if (!drawingEdgeActive()) {
      setPortVisualState(node.id, port.id, "idle");
    }
  });
  return container;
}
