import { Container, Graphics } from "pixi.js";

export function createWorkflowGraphLayers({ stage, viewport }) {
  const labelLayer = new Container();
  labelLayer.eventMode = "none";
  labelLayer.interactiveChildren = false;

  const backgroundLayer = new Container();
  const edgeLayer = new Container();
  const edgeLabelLayer = new Container();
  const nodeLayer = new Container();
  const interactionLayer = new Container();
  const effectsLayer = new Container();
  edgeLabelLayer.eventMode = "none";
  edgeLabelLayer.interactiveChildren = false;

  const edgeGraphics = new Graphics();
  const temporaryEdgeGraphics = new Graphics();
  const marqueeGraphics = new Graphics();
  const grid = new Graphics();
  const glow = new Graphics();

  stage.addChild(viewport, labelLayer);
  viewport.addChild(backgroundLayer, edgeLayer, nodeLayer, interactionLayer, effectsLayer);
  backgroundLayer.addChild(grid);
  edgeLayer.addChild(edgeGraphics, edgeLabelLayer);
  interactionLayer.addChild(marqueeGraphics, temporaryEdgeGraphics);
  effectsLayer.addChild(glow);

  return {
    edgeGraphics,
    edgeLabelLayer,
    glow,
    grid,
    labelLayer,
    marqueeGraphics,
    nodeLayer,
    temporaryEdgeGraphics,
  };
}
