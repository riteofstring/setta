import type {
  WorkflowGraphCameraChange,
  WorkflowGraphCameraState,
  WorkflowGraphGraph,
  WorkflowGraphNodePositionSaveSettlement,
  WorkflowGraphRenderer,
  WorkflowGraphRendererHandlers,
  createWorkflowGraphRenderer,
} from "./pixi-renderer";
import { isWorkflowGraphRendererInitAbort } from "./workflow-graph-renderer-lifecycle";
import type { WorkspaceTrajectoryFrameSnapshot } from "./workspace-trajectory-store";

export type GraphSurfaceControllerState =
  | "active"
  | "creating"
  | "destroyed"
  | "destroying"
  | "mounted"
  | "suspended";

export interface GraphSurfaceControllerConfigureOptions {
  animationEnabled: boolean;
  captureCameraState: (camera: WorkflowGraphCameraState) => void;
  debugEnabled: boolean;
  handlers: WorkflowGraphRendererHandlers;
  initialCameraState: WorkflowGraphCameraState | null;
  noteCameraMovement?: (() => void) | null;
  reduceMotion: boolean;
}

export interface GraphSurfaceControllerSnapshot {
  activeRequested: boolean;
  creationCount: number;
  destroyCount: number;
  generation: number;
  hasHost: boolean;
  hasPendingScene: boolean;
  hasPendingTrajectory: boolean;
  rendererReady: boolean;
  staleCallbackCount: number;
  state: GraphSurfaceControllerState;
  surfaceId: string;
  transferCount: number;
}

type WorkflowGraphRendererFactory = typeof createWorkflowGraphRenderer;
type WorkflowGraphRendererLoader = () => Promise<{
  createWorkflowGraphRenderer: WorkflowGraphRendererFactory;
}>;

interface WorkflowGraphSurfaceControllerDependencies {
  loadRenderer?: WorkflowGraphRendererLoader;
}

interface WorkflowGraphUpdateTarget {
  settleNodePositionSave: (settlement: WorkflowGraphNodePositionSaveSettlement) => void;
  updateGraph: (graph: WorkflowGraphGraph) => void;
  updateTrajectoryRuntime: (frame: WorkspaceTrajectoryFrameSnapshot) => void;
}

const controllersBySurfaceId = new Map<string, WorkflowGraphSurfaceController>();

export function workflowGraphSurfaceControllerForSurface(
  surfaceId: string,
  dependencies: WorkflowGraphSurfaceControllerDependencies = {},
): WorkflowGraphSurfaceController {
  const existing = controllersBySurfaceId.get(surfaceId);
  if (existing && !existing.destroyed) {
    return existing;
  }
  if (existing?.destroyed) {
    controllersBySurfaceId.delete(surfaceId);
  }
  const controller = new WorkflowGraphSurfaceController(surfaceId, dependencies);
  controllersBySurfaceId.set(surfaceId, controller);
  return controller;
}

export function destroyWorkflowGraphSurfaceController(surfaceId: string): void {
  const controller = controllersBySurfaceId.get(surfaceId);
  if (!controller) {
    return;
  }
  controller.destroy();
  controllersBySurfaceId.delete(surfaceId);
}

export class WorkflowGraphSurfaceController implements WorkflowGraphUpdateTarget {
  private abortController: AbortController | null = null;
  private activeRequested = false;
  private config: GraphSurfaceControllerConfigureOptions | null = null;
  private creationCount = 0;
  private capturedCameraState: WorkflowGraphCameraState | null = null;
  private destroyCount = 0;
  private generation = 0;
  private host: HTMLElement | null = null;
  private latestCameraState: WorkflowGraphCameraState | null = null;
  private pendingScene: WorkflowGraphGraph | null = null;
  private pendingTrajectory: WorkspaceTrajectoryFrameSnapshot | null = null;
  private renderer: WorkflowGraphRenderer | null = null;
  private staleCallbackCount = 0;
  private stateValue: GraphSurfaceControllerState = "suspended";
  private transferCount = 0;
  private readonly loadRenderer: WorkflowGraphRendererLoader;

  constructor(
    readonly surfaceId: string,
    {
      loadRenderer = defaultWorkflowGraphRendererLoader,
    }: WorkflowGraphSurfaceControllerDependencies = {},
  ) {
    const existing = controllersBySurfaceId.get(surfaceId);
    if (existing && !existing.destroyed) {
      throw new Error(`workflow graph surface controller already exists for ${surfaceId}`);
    }
    this.loadRenderer = loadRenderer;
    controllersBySurfaceId.set(surfaceId, this);
  }

  get destroyed(): boolean {
    return this.stateValue === "destroyed";
  }

  state(): GraphSurfaceControllerState {
    return this.stateValue;
  }

  snapshot(): GraphSurfaceControllerSnapshot {
    return {
      activeRequested: this.activeRequested,
      creationCount: this.creationCount,
      destroyCount: this.destroyCount,
      generation: this.generation,
      hasHost: this.host !== null,
      hasPendingScene: this.pendingScene !== null,
      hasPendingTrajectory: this.pendingTrajectory !== null,
      rendererReady: this.renderer !== null,
      staleCallbackCount: this.staleCallbackCount,
      state: this.stateValue,
      surfaceId: this.surfaceId,
      transferCount: this.transferCount,
    };
  }

  configure(options: GraphSurfaceControllerConfigureOptions): void {
    this.ensureUsable();
    this.config = options;
    if (this.latestCameraState === null) {
      this.latestCameraState = cloneCameraState(options.initialCameraState);
    }
    if (this.capturedCameraState === null) {
      this.capturedCameraState = cloneCameraState(options.initialCameraState);
    }
    this.renderer?.setHandlers(this.rendererHandlers(options.handlers));
    this.ensureRenderer();
  }

  mount(host: HTMLElement): void {
    this.ensureUsable();
    if (this.host !== null && this.host !== host) {
      this.transferHost(host);
      return;
    }
    this.host = host;
    if (this.stateValue === "suspended") {
      this.stateValue = "mounted";
    }
    this.ensureRenderer();
  }

  transferHost(nextHost: HTMLElement): void {
    this.ensureUsable();
    if (this.host === nextHost) {
      return;
    }
    this.host = nextHost;
    this.transferCount += 1;
    this.renderer?.transferHost(nextHost);
    this.ensureRenderer();
  }

  activate(): void {
    this.ensureUsable();
    this.activeRequested = true;
    this.renderer?.activate();
    if (this.renderer !== null) {
      this.stateValue = "active";
    }
    this.ensureRenderer();
  }

  suspend(): void {
    if (this.destroyed || this.stateValue === "destroying") {
      return;
    }
    this.activeRequested = false;
    this.renderer?.suspend();
    this.stateValue = this.host === null ? "suspended" : "mounted";
  }

  resize(): void {
    this.renderer?.resize();
  }

  settleNodePositionSave(settlement: WorkflowGraphNodePositionSaveSettlement): void {
    this.renderer?.settleNodePositionSave(settlement);
  }

  updateGraph(graph: WorkflowGraphGraph): void {
    this.updateScene(graph);
  }

  updateScene(graph: WorkflowGraphGraph): void {
    if (this.destroyed || this.stateValue === "destroying") {
      return;
    }
    this.pendingScene = graph;
    if (this.renderer === null) {
      this.ensureRenderer();
      return;
    }
    this.renderer.updateGraph(graph);
  }

  updateTrajectoryRuntime(frame: WorkspaceTrajectoryFrameSnapshot): void {
    this.updateTrajectory(frame);
  }

  updateTrajectory(frame: WorkspaceTrajectoryFrameSnapshot): void {
    if (this.destroyed || this.stateValue === "destroying") {
      return;
    }
    this.pendingTrajectory = frame;
    if (this.renderer === null) {
      this.ensureRenderer();
      return;
    }
    this.renderer.updateTrajectoryRuntime(frame);
  }

  cameraState(): WorkflowGraphCameraState | null {
    return cloneCameraState(
      this.renderer?.cameraState() ??
        this.latestCameraState ??
        this.config?.initialCameraState ??
        null,
    );
  }

  setHandlers(handlers: WorkflowGraphRendererHandlers): void {
    if (this.config === null) {
      return;
    }
    this.config = {
      ...this.config,
      handlers,
    };
    this.renderer?.setHandlers(this.rendererHandlers(handlers));
  }

  destroy(): void {
    if (this.stateValue === "destroyed" || this.stateValue === "destroying") {
      return;
    }
    this.stateValue = "destroying";
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
    this.pendingScene = null;
    this.pendingTrajectory = null;
    this.destroyRenderer();
    this.host = null;
    this.activeRequested = false;
    this.stateValue = "destroyed";
    if (controllersBySurfaceId.get(this.surfaceId) === this) {
      controllersBySurfaceId.delete(this.surfaceId);
    }
  }

  private ensureRenderer(): void {
    if (
      this.renderer !== null ||
      this.abortController !== null ||
      this.host === null ||
      this.config === null ||
      this.pendingScene === null ||
      this.stateValue === "destroyed" ||
      this.stateValue === "destroying"
    ) {
      return;
    }
    const generation = this.generation;
    const abortController = new AbortController();
    const config = this.config;
    const graph = this.pendingScene;
    const host = this.host;
    this.abortController = abortController;
    this.creationCount += 1;
    this.stateValue = "creating";
    void this.loadRenderer()
      .then(({ createWorkflowGraphRenderer }) =>
        createWorkflowGraphRenderer({
          abortSignal: abortController.signal,
          animationEnabled: config.animationEnabled,
          debugEnabled: config.debugEnabled,
          debugSurfaceId: this.surfaceId,
          graph,
          host,
          initialCameraState: config.initialCameraState,
          reduceMotion: config.reduceMotion,
          ...this.rendererHandlers(config.handlers),
        }),
      )
      .then((renderer) => {
        this.completeRendererCreation(renderer, generation, host, graph);
      })
      .catch((error: unknown) => {
        this.handleRendererCreationFailure(error, generation);
      });
  }

  private completeRendererCreation(
    renderer: WorkflowGraphRenderer,
    generation: number,
    initialHost: HTMLElement,
    initialGraph: WorkflowGraphGraph,
  ): void {
    if (!this.generationMatches(generation) || this.stateValue === "destroying") {
      this.destroyStaleCreatedRenderer(renderer);
      return;
    }
    this.commitCreatedRenderer(renderer);
    this.transferCreatedRendererHost(renderer, initialHost);
    this.flushQueuedRendererUpdates(renderer, initialGraph);
    this.applyCreatedRendererActivity(renderer);
  }

  private destroyStaleCreatedRenderer(renderer: WorkflowGraphRenderer): void {
    this.staleCallbackCount += 1;
    renderer.destroy();
  }

  private commitCreatedRenderer(renderer: WorkflowGraphRenderer): void {
    this.abortController = null;
    this.renderer = renderer;
    if (this.config !== null) {
      renderer.setHandlers(this.rendererHandlers(this.config.handlers));
    }
  }

  private transferCreatedRendererHost(
    renderer: WorkflowGraphRenderer,
    initialHost: HTMLElement,
  ): void {
    if (this.host !== null && this.host !== initialHost) {
      renderer.transferHost(this.host);
    }
  }

  private flushQueuedRendererUpdates(
    renderer: WorkflowGraphRenderer,
    initialGraph: WorkflowGraphGraph,
  ): void {
    if (this.pendingScene !== null && this.pendingScene !== initialGraph) {
      renderer.updateGraph(this.pendingScene);
    }
    if (this.pendingTrajectory !== null) {
      renderer.updateTrajectoryRuntime(this.pendingTrajectory);
    }
  }

  private applyCreatedRendererActivity(renderer: WorkflowGraphRenderer): void {
    if (this.activeRequested) {
      renderer.activate();
      this.stateValue = "active";
      return;
    }
    renderer.suspend();
    this.stateValue = this.host === null ? "suspended" : "mounted";
  }

  private handleRendererCreationFailure(error: unknown, generation: number): void {
    if (!this.generationMatches(generation)) {
      this.staleCallbackCount += 1;
      return;
    }
    this.abortController = null;
    if (isWorkflowGraphRendererInitAbort(error)) {
      return;
    }
    this.stateValue = this.host === null ? "suspended" : "mounted";
    console.error("Failed to initialize workflow graph surface controller", error);
  }

  private destroyRenderer(): void {
    const renderer = this.renderer;
    this.renderer = null;
    if (!renderer) {
      return;
    }
    const camera = renderer.cameraState();
    this.captureSettledCameraState(camera);
    renderer.destroy();
    this.destroyCount += 1;
  }

  private rendererHandlers(handlers: WorkflowGraphRendererHandlers): WorkflowGraphRendererHandlers {
    return {
      ...handlers,
      onCameraStateChange: (camera, change) => {
        this.handleRendererCameraStateChange(camera, change);
      },
    };
  }

  private handleRendererCameraStateChange(
    camera: WorkflowGraphCameraState,
    change: WorkflowGraphCameraChange | undefined,
  ): void {
    this.latestCameraState = cloneCameraState(camera);
    if (change?.cameraMotion === "moving") {
      this.config?.noteCameraMovement?.();
      return;
    }
    this.captureSettledCameraState(camera);
  }

  private captureSettledCameraState(camera: WorkflowGraphCameraState): void {
    const nextCameraState = { ...camera };
    this.latestCameraState = nextCameraState;
    if (cameraStatesEqual(this.capturedCameraState, nextCameraState)) {
      return;
    }
    this.capturedCameraState = nextCameraState;
    this.config?.captureCameraState({ ...nextCameraState });
  }

  private generationMatches(generation: number): boolean {
    return this.generation === generation && this.stateValue !== "destroyed";
  }

  private ensureUsable(): void {
    if (this.destroyed || this.stateValue === "destroying") {
      throw new Error(`workflow graph surface controller ${this.surfaceId} is destroyed`);
    }
  }
}

function defaultWorkflowGraphRendererLoader() {
  return import("./pixi-renderer");
}

function cloneCameraState(
  camera: WorkflowGraphCameraState | null | undefined,
): WorkflowGraphCameraState | null {
  return camera === null || camera === undefined ? null : { ...camera };
}

function cameraStatesEqual(
  left: WorkflowGraphCameraState | null,
  right: WorkflowGraphCameraState | null,
) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.x === right.x &&
      left.y === right.y &&
      left.zoom === right.zoom)
  );
}
