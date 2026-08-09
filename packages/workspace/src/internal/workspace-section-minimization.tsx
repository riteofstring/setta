import type { ReactNode } from "react";

import type { SectionMinimizeScope } from "./workspace-section-contract.js";

export function SectionStateLabels({
  detached,
  isMinimized,
  locked,
  minimizeScope,
}: Readonly<{
  detached: boolean;
  isMinimized: boolean;
  locked: boolean;
  minimizeScope: SectionMinimizeScope;
}>) {
  return (
    <>
      {locked ? <span className="setta-workspace__section-state">Locked</span> : null}
      {isMinimized ? (
        <span className="setta-workspace__section-state">
          {minimizeScope === "subtree" ? "Minimized subtree" : "Minimized"}
        </span>
      ) : null}
      {detached ? <span className="setta-workspace__section-state">Detached</span> : null}
    </>
  );
}

export function sectionMinimizeTargetIds(
  minimizeScope: SectionMinimizeScope,
  contentId: string,
  descendantRegionId: string,
): string {
  return minimizeScope === "subtree" ? `${contentId} ${descendantRegionId}` : contentId;
}

export function SectionDescendantRegion({
  children,
  collapsed,
  descendantRegionId,
  minimizeScope,
  sectionId,
}: Readonly<{
  children: ReactNode;
  collapsed: boolean;
  descendantRegionId: string;
  minimizeScope: SectionMinimizeScope;
  sectionId: string;
}>): ReactNode {
  if (minimizeScope === "body") {
    return children;
  }
  return (
    <div
      className="setta-workspace__section-descendants"
      data-workspace-section-descendants={sectionId}
      hidden={collapsed}
      id={descendantRegionId}
    >
      {collapsed ? null : children}
    </div>
  );
}
