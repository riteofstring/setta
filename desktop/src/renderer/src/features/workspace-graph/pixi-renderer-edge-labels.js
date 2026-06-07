import { BitmapText } from "pixi.js";

export function drawEdgeLabel(layer, edge, start, end, options) {
  const labelText = edge.label ?? "";
  if (labelText === "") {
    return;
  }
  options.validateGlyphs(`edge ${edge.id}`, labelText);
  const label = new BitmapText({
    anchor: 0.5,
    style: {
      align: "center",
      fill: 0xcbd5e1,
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
    },
    text: labelText,
  });
  const position = edgeLabelPosition(start, end);
  label.eventMode = "none";
  label.position.set(position.x, position.y);
  label.roundPixels = true;
  layer.addChild(label);
}

function edgeLabelPosition(start, end) {
  return {
    x: Math.round((start.x + end.x) / 2),
    y: Math.round((start.y + end.y) / 2 - 10),
  };
}
