import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

export function profileGpuFlowReactElement(
  id: string,
  children: ReactNode,
): ReactNode {
  if (!isGpuFlowReactProfilerEnabled()) {
    return children;
  }
  return (
    <Profiler id={id} onRender={recordGpuFlowReactProfile}>
      {children}
    </Profiler>
  );
}

const recordGpuFlowReactProfile: ProfilerOnRenderCallback = (...args) => {
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
    // Diagnostic profiling must never affect runtime rendering.
  }
};

function isGpuFlowReactProfilerEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    (
      window as typeof window & {
        __SETTA_GPU_FLOW_REACT_PROFILER__?: boolean;
      }
    ).__SETTA_GPU_FLOW_REACT_PROFILER__ === true
  );
}
