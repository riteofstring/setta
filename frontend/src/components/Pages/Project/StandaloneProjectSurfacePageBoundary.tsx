import { memo, type ComponentProps } from "react";
import { SectionContainerAreaDictBoundary } from "components/Section/Container/SectionContainerAreaDictBoundary";
import type { SectionContainerAreaDictProps } from "components/Section/Container/sectionContainerAreaView";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import {
  StandaloneManagedChatBlockedSurface,
  StandaloneProjectSurfaceRouteBoundary,
} from "./StandaloneProjectSurfaceRouteBoundary";

function renderStandaloneProjectSurfacePageDictArea(
  props: SectionContainerAreaDictProps,
) {
  return <SectionContainerAreaDictBoundary {...props} />;
}

export type StandaloneProjectSurfacePageBoundaryProps = Omit<
  ComponentProps<typeof StandaloneProjectSurfaceRouteBoundary>,
  "renderDictArea"
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

  return (
    <StandaloneProjectSurfaceRouteBoundary
      {...routeBoundaryProps}
      renderDictArea={renderStandaloneProjectSurfacePageDictArea}
    />
  );
}

export const StandaloneProjectSurfacePageBoundary = memo(
  _StandaloneProjectSurfacePageBoundary,
);
