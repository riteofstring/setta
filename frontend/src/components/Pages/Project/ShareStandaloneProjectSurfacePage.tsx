import type { ComponentProps } from "react";
import { ShareStandaloneProjectSurfacePageBoundary } from "./ShareStandaloneProjectSurfacePageBoundary";

export type ShareStandaloneProjectSurfacePageProps = ComponentProps<
  typeof ShareStandaloneProjectSurfacePageBoundary
>;

export function ShareStandaloneProjectSurfacePage(
  props: ShareStandaloneProjectSurfacePageProps,
) {
  return <ShareStandaloneProjectSurfacePageBoundary {...props} />;
}
