import type { HandleProps } from "gpuFlow/flowTypes";
import { canConnectHandleFamilies } from "state/actions/chatSharedHandleIds";

type ProjectGpuHandleConnectionProps = Pick<
  HandleProps,
  "isConnectionCandidateAllowed" | "pointerUpSnapRadius"
>;

const PROJECT_REVERSE_START_POINTER_UP_SNAP_RADIUS = 80;
const projectHandleConnectionProps = new Map<
  string,
  ProjectGpuHandleConnectionProps
>();
const projectReverseStartConnectionProps = new Map<
  string,
  ProjectGpuHandleConnectionProps
>();

export function getProjectGpuHandleConnectionProps(
  startHandleId: string,
): ProjectGpuHandleConnectionProps {
  const cached = projectHandleConnectionProps.get(startHandleId);
  if (cached) {
    return cached;
  }
  const props: ProjectGpuHandleConnectionProps = {
    isConnectionCandidateAllowed: (candidate) =>
      canConnectHandleFamilies(startHandleId, candidate.handleId),
  };
  projectHandleConnectionProps.set(startHandleId, props);
  return props;
}

export function getProjectGpuReverseStartHandleConnectionProps(
  startHandleId: string,
): ProjectGpuHandleConnectionProps {
  const cached = projectReverseStartConnectionProps.get(startHandleId);
  if (cached) {
    return cached;
  }
  const props: ProjectGpuHandleConnectionProps = {
    ...getProjectGpuHandleConnectionProps(startHandleId),
    pointerUpSnapRadius: PROJECT_REVERSE_START_POINTER_UP_SNAP_RADIUS,
  };
  projectReverseStartConnectionProps.set(startHandleId, props);
  return props;
}
