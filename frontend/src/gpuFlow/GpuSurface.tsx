import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  initializeGpuFlowDevice,
  type GpuFlowDeviceOptions,
  type GpuFlowRuntime,
} from "./gpuDevice";
import {
  applyGpuCanvasSize,
  attachGpuCanvasResizeObserver,
  createGpuFrameScheduler,
  measureGpuCanvasClientSize,
  type GpuCanvasSize,
  type GpuFrameEvent,
  type GpuFrameReason,
  type GpuFrameScheduler,
} from "./gpuRenderer";
import type {
  HtmlInCanvasCanvas,
  HtmlInCanvasPaintEvent,
} from "./htmlInCanvasTypes";

export type GpuSurfaceProps = {
  children?: ReactNode;
  className?: string | undefined;
  deviceOptions?: GpuFlowDeviceOptions | undefined;
  onFrame?:
    | ((runtime: GpuFlowRuntime, event: GpuFrameEvent) => void)
    | undefined;
  onPaint?:
    | ((runtime: GpuFlowRuntime, event: HtmlInCanvasPaintEvent) => void)
    | undefined;
  onReady?: ((runtime: GpuFlowRuntime) => void) | undefined;
  onResize?:
    | ((runtime: GpuFlowRuntime, size: GpuCanvasSize) => void)
    | undefined;
};

export type GpuSurfaceHandle = {
  getRuntime(): GpuFlowRuntime | null;
  requestFrame(reason?: GpuFrameReason): void;
  requestPaint(): void;
};

type GpuSurfaceCallbacks = {
  onFrame: GpuSurfaceProps["onFrame"];
  onPaint: GpuSurfaceProps["onPaint"];
  onReady: GpuSurfaceProps["onReady"];
  onResize: GpuSurfaceProps["onResize"];
};

export const GpuSurface = forwardRef<GpuSurfaceHandle, GpuSurfaceProps>(
  function GpuSurface(
    {
      children,
      className = "setta-gpu-flow__canvas",
      deviceOptions,
      onFrame,
      onPaint,
      onReady,
      onResize,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const runtimeRef = useRef<GpuFlowRuntime | null>(null);
    const schedulerRef = useRef<GpuFrameScheduler | null>(null);
    const pendingFrameReasonsRef = useRef<Set<GpuFrameReason>>(new Set());
    const callbacksRef = useRef<GpuSurfaceCallbacks>({
      onFrame: undefined,
      onPaint: undefined,
      onReady: undefined,
      onResize: undefined,
    });
    const [initError, setInitError] = useState<Error | null>(null);

    useImperativeHandle(ref, () => ({
      getRuntime() {
        return runtimeRef.current;
      },
      requestFrame(reason?: GpuFrameReason) {
        const scheduler = schedulerRef.current;
        if (scheduler) {
          scheduler.requestFrame(reason);
          return;
        }
        pendingFrameReasonsRef.current.add(reason ?? "manual");
      },
      requestPaint() {
        const runtime = runtimeRef.current;
        if (!runtime) {
          return;
        }
        runtime.canvas.requestPaint();
      },
    }));

    useEffect(() => {
      callbacksRef.current = { onFrame, onPaint, onReady, onResize };
    }, [onFrame, onPaint, onReady, onResize]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      let disposed = false;
      let runtime: GpuFlowRuntime | null = null;
      let cleanupRuntime: (() => void) | null = null;

      void initializeGpuFlowDevice(canvas, deviceOptions)
        .then((nextRuntime) => {
          if (disposed) {
            nextRuntime.destroy();
            return;
          }

          runtime = nextRuntime;
          runtimeRef.current = nextRuntime;
          const scheduler = createGpuFrameScheduler({
            onFrame: (event) => {
              callbacksRef.current.onFrame?.(nextRuntime, event);
            },
          });
          schedulerRef.current = scheduler;
          const pendingFrameReasons = [...pendingFrameReasonsRef.current];
          pendingFrameReasonsRef.current.clear();
          for (const reason of pendingFrameReasons) {
            scheduler.requestFrame(reason);
          }
          const initialSize = measureGpuCanvasClientSize(canvas);
          applyGpuCanvasSize(canvas, initialSize);
          callbacksRef.current.onResize?.(nextRuntime, initialSize);
          const detachResizeObserver = attachGpuCanvasResizeObserver(
            canvas,
            (size) => {
              callbacksRef.current.onResize?.(nextRuntime, size);
              scheduler.requestFrame("resize");
            },
          );
          const htmlCanvas = canvas as HtmlInCanvasCanvas;
          htmlCanvas.onpaint = (event) => {
            callbacksRef.current.onPaint?.(
              nextRuntime,
              event as HtmlInCanvasPaintEvent,
            );
            scheduler.requestFrame("paint");
          };

          callbacksRef.current.onReady?.(nextRuntime);
          htmlCanvas.requestPaint();
          scheduler.requestFrame("init");

          cleanupRuntime = () => {
            htmlCanvas.onpaint = null;
            detachResizeObserver();
            scheduler.destroy();
            nextRuntime.destroy();
            if (runtimeRef.current === nextRuntime) {
              runtimeRef.current = null;
            }
            if (schedulerRef.current === scheduler) {
              schedulerRef.current = null;
            }
          };
        })
        .catch((error: unknown) => {
          runtime?.destroy();
          runtime = null;
          runtimeRef.current = null;
          schedulerRef.current = null;
          if (!disposed) {
            setInitError(toError(error));
          }
        });

      return () => {
        disposed = true;
        if (cleanupRuntime) {
          cleanupRuntime();
          return;
        }
        runtime?.destroy();
        runtimeRef.current = null;
        schedulerRef.current = null;
      };
    }, [deviceOptions]);

    if (initError) {
      throw initError;
    }

    return (
      <canvas
        ref={canvasRef}
        className={className}
        data-gpu-flow-surface="true"
        layoutsubtree=""
      >
        {children}
      </canvas>
    );
  },
);

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
