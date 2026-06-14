import { Container, Graphics, Rectangle } from "pixi.js";

import { drawNodeDiagnosticMarker } from "./pixi-renderer-node-geometry";

export function createWorkflowGraphNodeContainer({
  node,
  nodeBodies,
  nodeGeometry,
  nodeOutlines,
  nodeShadows,
  onPointerOut,
  onPointerOver,
  portContainers,
}) {
  const container = new Container();
  container.x = node.x;
  container.y = node.y;

  const body = new Graphics(nodeGeometry.nodeBodyContextFor(node));
  body.eventMode = "static";
  body.cursor = "grab";
  body.hitArea = new Rectangle(0, 0, node.width, node.height);
  nodeBodies.set(node.id, body);

  const shadow = new Graphics(nodeGeometry.nodeShadowContextFor(node));
  nodeShadows.set(node.id, shadow);
  const hoverOutline = new Graphics(nodeGeometry.nodeOutlineContextFor(node, "hovered"));
  hoverOutline.visible = false;
  const selectedOutline = new Graphics(nodeGeometry.nodeOutlineContextFor(node, "selected"));
  selectedOutline.visible = false;
  const diagnosticMarker = new Graphics();
  drawNodeDiagnosticMarker(diagnosticMarker, node);
  nodeOutlines.set(node.id, { hoverOutline, selectedOutline });

  const nodeGraphics = [shadow, body, hoverOutline, selectedOutline, diagnosticMarker];
  container.addChild(...nodeGraphics, ...portContainers);
  body.on("pointerover", onPointerOver);
  body.on("pointerout", onPointerOut);

  return container;
}
