import { Container, Graphics } from "pixi.js";
import {
  createWorkspaceBackdropGradient,
  createWorkspaceVignetteGradient,
} from "./pixi-renderer-node-geometry";

export function createWorkflowGraphRendererLayers({ app, foundationStyle, viewport }) {
  const backdrop = new Graphics();
  const backdropGradient = createWorkspaceBackdropGradient(foundationStyle);
  backdrop.eventMode = "none";
  backdrop.interactiveChildren = false;
  const vignette = new Graphics();
  const vignetteGradient = createWorkspaceVignetteGradient();
  vignette.eventMode = "none";
  vignette.interactiveChildren = false;
  const labelLayer = new Container();
  labelLayer.eventMode = "none";
  labelLayer.interactiveChildren = false;
  app.stage.addChild(backdrop, viewport, vignette, labelLayer);

  const backgroundLayer = new Container();
  const edgeLayer = new Container();
  const edgeLabelLayer = new Container();
  const nodeGlowLayer = new Container();
  const nodeLayer = new Container();
  const trajectoryLayer = new Container();
  const interactionLayer = new Container();
  const effectsLayer = new Container();
  edgeLabelLayer.eventMode = "none";
  edgeLabelLayer.interactiveChildren = false;
  nodeGlowLayer.eventMode = "none";
  nodeGlowLayer.interactiveChildren = false;
  trajectoryLayer.eventMode = "none";
  trajectoryLayer.interactiveChildren = false;
  viewport.addChild(
    backgroundLayer,
    edgeLayer,
    nodeGlowLayer,
    nodeLayer,
    trajectoryLayer,
    interactionLayer,
    effectsLayer,
  );

  const edgeGraphics = new Graphics();
  const edgeFlowGraphics = new Graphics();
  const edgeHighlightGraphics = new Graphics();
  const cellAnimationGraphics = new Graphics();
  const temporaryEdgeGraphics = new Graphics();
  const marqueeGraphics = new Graphics();
  const grid = new Graphics();
  const staticGlow = new Graphics();
  const animatedGlow = new Graphics();
  // Neon node glow removed (2026-06-21): the BlurFilter passes on the glow and
  // edge layers were recomputed across the viewport every frame, which made
  // pan/zoom GPU-bound ("under water") — the long-standing pan/zoom regression.
  // Edges now render crisp with no blur, and the glow layers are not rendered.
  const filteredGraphics = [];
  staticGlow.visible = false;
  animatedGlow.visible = false;

  edgeFlowGraphics.blendMode = "add";
  edgeFlowGraphics.eventMode = "none";
  cellAnimationGraphics.blendMode = "add";
  cellAnimationGraphics.eventMode = "none";
  backgroundLayer.addChild(grid);
  edgeLayer.addChild(edgeGraphics, edgeFlowGraphics, edgeHighlightGraphics, edgeLabelLayer);
  nodeGlowLayer.addChild(staticGlow, animatedGlow);
  effectsLayer.addChild(cellAnimationGraphics);
  interactionLayer.addChild(marqueeGraphics, temporaryEdgeGraphics);

  return {
    animatedGlow,
    backdrop,
    backdropGradient,
    backgroundLayer,
    cellAnimationGraphics,
    edgeFlowGraphics,
    edgeGraphics,
    edgeHighlightGraphics,
    edgeLabelLayer,
    edgeLayer,
    effectsLayer,
    filteredGraphics,
    grid,
    interactionLayer,
    labelLayer,
    marqueeGraphics,
    nodeGlowLayer,
    nodeLayer,
    staticGlow,
    temporaryEdgeGraphics,
    trajectoryLayer,
    vignette,
    vignetteGradient,
  };
}
