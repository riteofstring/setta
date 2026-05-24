import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

export function profileProjectGpuReactElement(
  id: string,
  children: ReactNode,
): ReactNode {
  if (!isProjectGpuReactProfilerEnabled()) {
    return children;
  }
  return (
    <Profiler id={id} onRender={recordProjectGpuReactProfile}>
      {children}
    </Profiler>
  );
}

const recordProjectGpuReactProfile: ProfilerOnRenderCallback = (...args) => {
  const [id, phase, actualDuration, baseDuration, startTime, commitTime] = args;
  try {
    performance.measure(`setta.gpuFlow.react-profile id=${id} phase=${phase}`, {
      detail: {
        actualDuration,
        baseDuration,
        commitTime,
        id,
        phase,
      },
      duration: actualDuration,
      start: startTime,
    } as PerformanceMeasureOptions);
  } catch {
    // Diagnostic profiling must not affect rendering.
  }
};

function isProjectGpuReactProfilerEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_REACT_PROFILER__?: boolean;
      }
    ).__SETTA_GPU_FLOW_REACT_PROFILER__ === true
  );
}
