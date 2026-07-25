export interface AgentShaderPalette {
  background: [number, number, number];
  primary: [number, number, number];
  secondary: [number, number, number];
  tertiary: [number, number, number];
}

export function resolveAgentShaderPalette(root: HTMLElement): AgentShaderPalette {
  const probe = root.ownerDocument.createElement("span");
  probe.ariaHidden = "true";
  probe.style.cssText = "position:fixed;pointer-events:none;visibility:hidden";
  (root.ownerDocument.body ?? root).appendChild(probe);

  const canvas = root.ownerDocument.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    probe.remove();
    throw new Error("Canvas color conversion is unavailable.");
  }

  try {
    return {
      background: resolveCssVariable(probe, context, "--workspace-surface"),
      primary: resolveCssVariable(probe, context, "--accent-cyan"),
      secondary: resolveCssVariable(probe, context, "--accent-violet"),
      tertiary: resolveCssVariable(probe, context, "--accent-magenta"),
    };
  } finally {
    probe.remove();
  }
}

function resolveCssVariable(
  probe: HTMLElement,
  context: CanvasRenderingContext2D,
  property: string,
): [number, number, number] {
  probe.style.color = `var(${property})`;
  const value = getComputedStyle(probe).color;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const color = context.getImageData(0, 0, 1, 1).data;
  return [color[0]! / 255, color[1]! / 255, color[2]! / 255];
}
