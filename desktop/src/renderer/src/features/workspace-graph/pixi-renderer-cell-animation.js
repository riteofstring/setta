export function createSemanticCellAnimationController({
  cellAnimationGraphics,
  getNode,
  nodeContainers,
}) {
  const animatedCellContainerIds = new Set();

  return {
    sync: () => {
      resetAnimatedCellContainers();
      cellAnimationGraphics.clear();
    },
  };

  function resetAnimatedCellContainers() {
    for (const nodeId of animatedCellContainerIds) {
      resetSemanticCellContainer(nodeId);
    }
    animatedCellContainerIds.clear();
  }

  function resetSemanticCellContainer(nodeId) {
    const node = getNode(nodeId);
    const container = nodeContainers.get(nodeId);
    if (!node || !container) {
      return;
    }
    setNodeContainerScaleAroundCenter(container, node, 1);
  }
}

export function redrawSemanticCellAnimation({ cellAnimationGraphics }) {
  cellAnimationGraphics.clear();
}

export function semanticCellBreathScale() {
  return 1;
}

export function setNodeContainerScaleAroundCenter(container, node, scale) {
  container.scale.set(scale);
  container.x = node.x + (node.width * (1 - scale)) / 2;
  container.y = node.y + (node.height * (1 - scale)) / 2;
}
