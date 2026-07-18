import { BitmapText } from "pixi.js";

export function createWorkspaceEdgeLabelManager({
  BitmapTextClass = BitmapText,
  edgeLabelLayer,
  fontFamily,
  fontSize,
  validateGlyphs,
}) {
  const labels = new Map();

  return {
    count: () => labels.size,
    destroyAll: () => {
      for (const edgeId of [...labels.keys()]) {
        releaseLabel(edgeId);
      }
    },
    labels: () => labels,
    sync: (edgesWithEndpoints) => {
      const counts = emptyEdgeLabelCounts();
      const retainedEdgeIds = new Set();
      for (const item of edgesWithEndpoints) {
        const result = syncLabel(item);
        counts[result] += 1;
        if (result !== "removed") {
          retainedEdgeIds.add(item.edge.id);
        }
      }
      for (const edgeId of [...labels.keys()]) {
        if (!retainedEdgeIds.has(edgeId)) {
          releaseLabel(edgeId);
          counts.removed += 1;
        }
      }
      return counts;
    },
  };

  function syncLabel({ edge, end, start }) {
    const labelText = edge.label ?? "";
    const existing = labels.get(edge.id);
    if (labelText === "") {
      if (!existing) {
        return "absent";
      }
      releaseLabel(edge.id);
      return "removed";
    }

    validateGlyphs(`edge ${edge.id}`, labelText);
    const signature = edgeLabelSignature(edge, start, end, {
      fontFamily,
      fontSize,
    });
    if (!existing) {
      labels.set(edge.id, acquireLabel(signature));
      return "added";
    }
    if (edgeLabelSignaturesEqual(existing.signature, signature)) {
      return "retained";
    }
    applyLabelSignature(existing.label, signature);
    existing.signature = signature;
    return "updated";
  }

  function acquireLabel(signature) {
    const label = new BitmapTextClass({
      anchor: 0.5,
      style: {
        align: "center",
        fill: 0xcbd5e1,
        fontFamily: signature.fontFamily,
        fontSize: signature.fontSize,
      },
      text: signature.text,
    });
    label.eventMode = "none";
    label.roundPixels = true;
    applyLabelSignature(label, signature);
    edgeLabelLayer.addChild(label);
    return { label, signature };
  }

  function releaseLabel(edgeId) {
    const existing = labels.get(edgeId);
    if (!existing) {
      return;
    }
    existing.label.removeFromParent();
    existing.label.destroy();
    labels.delete(edgeId);
  }
}

function edgeLabelPosition(start, end) {
  return {
    x: Math.round((start.x + end.x) / 2),
    y: Math.round((start.y + end.y) / 2 - 10),
  };
}

function applyLabelSignature(label, signature) {
  label.text = signature.text;
  label.style.fontFamily = signature.fontFamily;
  label.style.fontSize = signature.fontSize;
  label.position.set(signature.x, signature.y);
}

function edgeLabelSignature(edge, start, end, { fontFamily, fontSize }) {
  const position = edgeLabelPosition(start, end);
  return {
    fontFamily,
    fontSize,
    text: edge.label ?? "",
    x: position.x,
    y: position.y,
  };
}

function edgeLabelSignaturesEqual(left, right) {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.text === right.text &&
    left.x === right.x &&
    left.y === right.y
  );
}

function emptyEdgeLabelCounts() {
  return {
    absent: 0,
    added: 0,
    removed: 0,
    retained: 0,
    updated: 0,
  };
}
