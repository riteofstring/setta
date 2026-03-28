import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "components/Section/Container/sectionContainerDefaultRenderers";
import { memo, type ComponentProps } from "react";
import { LoadingSpinner } from "../LoadingSpinner";
import { NotFound } from "../NotFound/NotFound";
import {
  StandaloneManagedChatBlockedSurface,
  StandaloneProjectSurfaceRouteBoundary,
} from "./StandaloneProjectSurfaceRouteBoundary";

export type StandaloneProjectSurfacePageBoundaryProps = Omit<
  ComponentProps<typeof StandaloneProjectSurfaceRouteBoundary>,
  "renderCoreBody" | "renderNestedSections"
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
      renderCoreBody={renderDefaultSectionContainerCoreBody}
      renderNestedSections={renderDefaultSectionContainerNestedSections}
    />
  );
}

export const StandaloneProjectSurfacePageBoundary = memo(
  _StandaloneProjectSurfacePageBoundary,
);
