import { useEffect, useState } from "react";

import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";

const GPU_FLOW_DOM_CONTROL_HOST_INITIAL_PRIORITY_LIMIT = 32;
const GPU_FLOW_DOM_CONTROL_HOST_PROGRESSIVE_BATCH_SIZE = 4;
const GPU_FLOW_DOM_CONTROL_HOST_CHROME_REPRO_INITIAL_PRIORITY_LIMIT = 8;
const GPU_FLOW_DOM_CONTROL_HOST_CHROME_REPRO_PROGRESSIVE_BATCH_SIZE = 1;
const GPU_FLOW_DOM_CONTROL_HOST_PROGRESSIVE_START_DELAY_MS = 8000;

export function useProgressiveGpuFlowDomControls({
  controls,
  deferPassiveMounting,
  sourceRevision,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly deferPassiveMounting: boolean;
  readonly sourceRevision: string;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  const orderedControls = orderGpuFlowDomControlsForProgressiveMount(controls, {
    deferPassiveMounting,
  });
  const initialPriorityLimit = deferPassiveMounting
    ? GPU_FLOW_DOM_CONTROL_HOST_CHROME_REPRO_INITIAL_PRIORITY_LIMIT
    : GPU_FLOW_DOM_CONTROL_HOST_INITIAL_PRIORITY_LIMIT;
  const progressiveBatchSize = deferPassiveMounting
    ? GPU_FLOW_DOM_CONTROL_HOST_CHROME_REPRO_PROGRESSIVE_BATCH_SIZE
    : GPU_FLOW_DOM_CONTROL_HOST_PROGRESSIVE_BATCH_SIZE;
  const minimumInitialControlCount = countInitialGpuFlowDomControlMountPriority(
    orderedControls,
    { deferPassiveMounting, initialPriorityLimit },
  );
  const initialLimit = Math.min(
    orderedControls.length,
    deferPassiveMounting
      ? minimumInitialControlCount
      : Math.max(progressiveBatchSize, minimumInitialControlCount),
  );
  const [progress, setProgress] = useState(() => ({
    limit: initialLimit,
    sourceRevision,
  }));
  const renderLimit =
    progress.sourceRevision === sourceRevision ? progress.limit : initialLimit;

  useEffect(() => {
    if (
      progress.sourceRevision !== sourceRevision ||
      progress.limit > orderedControls.length
    ) {
      setProgress({ limit: initialLimit, sourceRevision });
    }
  }, [
    initialLimit,
    orderedControls.length,
    progress.limit,
    progress.sourceRevision,
    sourceRevision,
  ]);

  useEffect(() => {
    if (renderLimit >= orderedControls.length) {
      return;
    }
    let cancelled = false;
    let frame = 0;
    const timeout = window.setTimeout(
      () => {
        frame = window.requestAnimationFrame(() => {
          if (cancelled) {
            return;
          }
          setProgress((current) => {
            const currentLimit =
              current.sourceRevision === sourceRevision
                ? current.limit
                : initialLimit;
            return {
              limit: Math.min(
                orderedControls.length,
                currentLimit + progressiveBatchSize,
              ),
              sourceRevision,
            };
          });
        });
      },
      deferPassiveMounting
        ? GPU_FLOW_DOM_CONTROL_HOST_PROGRESSIVE_START_DELAY_MS
        : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
    };
  }, [
    deferPassiveMounting,
    initialLimit,
    orderedControls.length,
    progressiveBatchSize,
    renderLimit,
    sourceRevision,
  ]);
  useProgressiveGpuFlowDomControlHeartbeat(renderLimit < orderedControls.length);

  return renderLimit >= orderedControls.length
    ? orderedControls
    : orderedControls.slice(0, renderLimit);
}

export function isGpuFlowChromeReproActive(): boolean {
  return (
    typeof window !== "undefined" &&
    (
      window as Window & {
        readonly __SETTA_CHROME_REPRO_ACTIVE__?: boolean | undefined;
      }
    ).__SETTA_CHROME_REPRO_ACTIVE__ === true
  );
}

function orderGpuFlowDomControlsForProgressiveMount(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
  {
    deferPassiveMounting,
  }: {
    readonly deferPassiveMounting: boolean;
  },
): readonly GpuRetainedDomControlSourceDescriptor[] {
  if (controls.length <= 1) {
    return controls;
  }
  const priorityControls: GpuRetainedDomControlSourceDescriptor[] = [];
  const remainingControls: GpuRetainedDomControlSourceDescriptor[] = [];
  for (const control of controls) {
    if (
      isInitialGpuFlowDomControlMountPriority(control, {
        deferPassiveMounting,
      })
    ) {
      priorityControls.push(control);
    } else {
      remainingControls.push(control);
    }
  }
  return [...priorityControls, ...remainingControls];
}

function countInitialGpuFlowDomControlMountPriority(
  controls: readonly GpuRetainedDomControlSourceDescriptor[],
  {
    deferPassiveMounting,
    initialPriorityLimit,
  }: {
    readonly deferPassiveMounting: boolean;
    readonly initialPriorityLimit: number;
  },
): number {
  let count = 0;
  for (const control of controls) {
    if (count >= initialPriorityLimit) {
      break;
    }
    if (
      !isInitialGpuFlowDomControlMountPriority(control, {
        deferPassiveMounting,
      })
    ) {
      break;
    }
    count += 1;
  }
  return count;
}

function isInitialGpuFlowDomControlMountPriority(
  control: GpuRetainedDomControlSourceDescriptor,
  {
    deferPassiveMounting,
  }: {
    readonly deferPassiveMounting: boolean;
  },
): boolean {
  return (
    control.active ||
    (!deferPassiveMounting &&
      control.projectionVisibility === "viewport-visible")
  );
}

function useProgressiveGpuFlowDomControlHeartbeat(active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let frame = 0;
    const schedule = () => {
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) {
          schedule();
        }
      });
    };
    schedule();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [active]);
}
