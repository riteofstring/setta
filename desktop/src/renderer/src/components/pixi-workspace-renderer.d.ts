interface CreatePixiWorkspaceRendererOptions {
  debugEnabled: boolean;
  host: HTMLElement;
  reactRenderCount: () => number;
}

interface PixiWorkspaceRenderer {
  destroy: () => void;
}

export function createPixiWorkspaceRenderer(
  options: CreatePixiWorkspaceRendererOptions,
): Promise<PixiWorkspaceRenderer>;
