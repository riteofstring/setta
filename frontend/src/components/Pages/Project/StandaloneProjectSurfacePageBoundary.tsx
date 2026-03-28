import { memo, type ComponentProps } from "react";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import {
  StandaloneManagedChatBlockedSurface,
  StandaloneProjectSurfaceRouteBoundary,
} from "./StandaloneProjectSurfaceRouteBoundary";

export type StandaloneProjectSurfacePageBoundaryProps = ComponentProps<
  typeof StandaloneProjectSurfaceRouteBoundary
> & {
  doneLoading: boolean;
  is404: boolean;
  shouldBlockStandaloneManagedChat: boolean;
};

function _StandaloneProjectSurfacePageBoundary({
  doneLoading,
  is404,
  shouldBlockStandaloneManagedChat,
  ...routeBoundaryProps
}: StandaloneProjectSurfacePageBoundaryProps) {
  if (!doneLoading) {
    return <LoadingSpinner />;
  }

  if (is404) {
    return <NotFound />;
  }

  if (shouldBlockStandaloneManagedChat) {
    return <StandaloneManagedChatBlockedSurface />;
  }

  return <StandaloneProjectSurfaceRouteBoundary {...routeBoundaryProps} />;
}

export const StandaloneProjectSurfacePageBoundary = memo(
  _StandaloneProjectSurfacePageBoundary,
);
