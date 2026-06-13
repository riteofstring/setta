import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const tau = Math.PI * 2;

export function createSemanticCellAnimationController({
  cellAnimationGraphics,
  nodeContainers,
  nodes,
}) {
  const animatedCellContainerIds = new Set();

  return {
    sync: (activeCellNodes, now) => {
      syncSemanticCellBreathing(activeCellNodes, now);
      if (activeCellNodes.length === 0) {
        cellAnimationGraphics.clear();
        return;
      }
      redrawSemanticCellAnimation({
        cellAnimationGraphics,
        nodes: activeCellNodes,
        now,
      });
    },
  };

  function syncSemanticCellBreathing(activeCellNodes, now) {
    const nextAnimatedCellContainerIds = new Set(activeCellNodes.map((node) => node.id));
    for (const nodeId of animatedCellContainerIds) {
      if (!nextAnimatedCellContainerIds.has(nodeId)) {
        resetSemanticCellContainer(nodeId);
      }
    }
    for (const node of activeCellNodes) {
      const container = nodeContainers.get(node.id);
      if (!container) {
        throw new Error(`semantic cell animation container is missing: ${node.id}`);
      }
      setNodeContainerScaleAroundCenter(container, node, semanticCellBreathScale(node, now));
    }
    animatedCellContainerIds.clear();
    for (const nodeId of nextAnimatedCellContainerIds) {
      animatedCellContainerIds.add(nodeId);
    }
  }

  function resetSemanticCellContainer(nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const container = nodeContainers.get(nodeId);
    if (!node || !container) {
      return;
    }
    setNodeContainerScaleAroundCenter(container, node, 1);
  }
}

export function redrawSemanticCellAnimation({ cellAnimationGraphics, nodes, now }) {
  cellAnimationGraphics.clear();
  for (const node of nodes) {
    drawActiveSemanticCell(cellAnimationGraphics, node, now);
  }
}

export function semanticCellBreathScale(node, now) {
  if (rendererNodeLayer(node) !== "semantic" || node.dismissed) {
    return 1;
  }
  const { breath } = workspaceNeonTheme.semantic.animation;
  const phase = now / breath.periodMs + stableUnitHash(node.id);
  return 1 + Math.sin(phase * tau) * breath.amplitude;
}

export function setNodeContainerScaleAroundCenter(container, node, scale) {
  container.scale.set(scale);
  container.x = node.x + (node.width * (1 - scale)) / 2;
  container.y = node.y + (node.height * (1 - scale)) / 2;
}

function drawActiveSemanticCell(target, node, now) {
  if (rendererNodeLayer(node) !== "semantic") {
    throw new Error(`semantic cell animation received non-semantic node: ${node.id}`);
  }
  const scale = semanticCellBreathScale(node, now);
  const geometry = semanticCellWorldGeometry(node, scale);
  const seed = stableUnitHash(node.id);
  const activityColor =
    workspaceNeonTheme.semantic.activity[node.activity?.kind] ?? node.color ?? 0x38bdf8;
  const dim = node.dismissed ? 0.32 : 1;
  drawCellShimmer(target, { color: activityColor, dim, geometry, now, seed });
  drawDriftingNucleus(target, { color: node.color, dim, geometry, now, seed });
  drawJitteringOrganelles(target, {
    activityColor,
    dim,
    geometry,
    nodeColor: node.color,
    now,
    seed,
  });
}

function semanticCellWorldGeometry(node, scale) {
  const inset = workspaceNeonTheme.semantic.cell.membraneRadiusInset;
  return {
    centerX: node.x + node.width / 2,
    centerY: node.y + node.height / 2,
    radius: (Math.min(node.width, node.height) / 2 - inset) * scale,
  };
}

function drawCellShimmer(target, { color, dim, geometry, now, seed }) {
  const style = workspaceNeonTheme.semantic.animation.shimmer;
  const phase = now / style.periodMs + seed;
  const angle = phase * tau;
  const orbitRadius = geometry.radius + style.orbitGap;
  const beadX = geometry.centerX + Math.cos(angle) * orbitRadius;
  const beadY = geometry.centerY + Math.sin(angle) * orbitRadius;
  target
    .circle(geometry.centerX, geometry.centerY, orbitRadius)
    .stroke({ alpha: style.ringAlpha * dim, color, width: style.ringWidth })
    .circle(beadX, beadY, style.haloRadius)
    .fill({ alpha: style.haloAlpha * dim, color })
    .circle(beadX, beadY, style.beadRadius)
    .fill({ alpha: style.beadAlpha * dim, color: 0xecfeff });
}

function drawDriftingNucleus(target, { color, dim, geometry, now, seed }) {
  const style = workspaceNeonTheme.semantic.animation.nucleus;
  const phase = now / style.periodMs + seed * 0.71;
  const driftX = Math.cos(phase * tau) * style.driftRadius;
  const driftY = Math.sin((phase + 0.19) * tau) * style.driftRadius * 0.82;
  const nucleusX = geometry.centerX - geometry.radius * 0.12 + driftX;
  const nucleusY = geometry.centerY - geometry.radius * 0.1 + driftY;
  const nucleusRadius = geometry.radius * style.ringRadiusRatio;
  target
    .circle(nucleusX, nucleusY, nucleusRadius * 1.5)
    .fill({ alpha: style.ringAlpha * 0.08 * dim, color })
    .circle(nucleusX, nucleusY, nucleusRadius)
    .stroke({ alpha: style.ringAlpha * dim, color, width: style.ringWidth })
    .circle(nucleusX, nucleusY, geometry.radius * style.coreRadiusRatio)
    .fill({ alpha: style.coreAlpha * dim, color: 0xecfeff });
}

function drawJitteringOrganelles(target, { activityColor, dim, geometry, nodeColor, now, seed }) {
  const style = workspaceNeonTheme.semantic.animation.organelle;
  const phase = now / style.periodMs;
  for (let index = 0; index < style.count; index += 1) {
    const baseAngle = seed * tau + index * 1.83 + 0.32;
    const distance = geometry.radius * (0.34 + ((index * 23) % 21) / 100);
    const jitterAngle = (phase * (1.2 + index * 0.17) + seed + index * 0.11) * tau;
    const jitter = Math.sin(jitterAngle) * style.jitterRadius;
    const organelleX = geometry.centerX + Math.cos(baseAngle) * (distance + jitter);
    const organelleY =
      geometry.centerY +
      Math.sin(baseAngle) * (distance - jitter * 0.62) +
      Math.cos(jitterAngle * 0.7) * style.jitterRadius * 0.48;
    target.circle(organelleX, organelleY, Math.max(1.6, geometry.radius * style.radiusRatio)).fill({
      alpha: style.alpha * dim,
      color: index % 2 === 0 ? nodeColor : activityColor,
    });
  }
}

function stableUnitHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}
