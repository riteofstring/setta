import { Container, Graphics, Rectangle } from "pixi.js";

import {
  drawNodeActivityMarker,
  drawNodeDiagnosticMarker,
  syncNodeBodyGraphic,
} from "./pixi-renderer-node-geometry";

export function createWorkflowGraphNodeContainer({
  node,
  nodeActivityMarkers,
  nodeBodies,
  nodeDiagnosticMarkers,
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

  const body = new Graphics();
  syncNodeBodyGraphic(body, node, nodeGeometry);
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
  nodeDiagnosticMarkers.set(node.id, diagnosticMarker);
  const activityMarker = new Graphics();
  drawNodeActivityMarker(activityMarker, node);
  nodeActivityMarkers.set(node.id, activityMarker);
  nodeOutlines.set(node.id, { hoverOutline, selectedOutline });

  const nodeGraphics = [
    shadow,
    body,
    activityMarker,
    hoverOutline,
    selectedOutline,
    diagnosticMarker,
  ];
  container.addChild(...nodeGraphics, ...portContainers);
  body.on("pointerover", onPointerOver);
  body.on("pointerout", onPointerOut);

  return container;
}
