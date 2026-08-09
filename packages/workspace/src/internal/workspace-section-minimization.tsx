import type { ReactNode } from "react";

import type { SectionMinimizeScope } from "./workspace-section-contract.js";

const lockedStateIcon = (
  <svg aria-hidden="true" className="setta-workspace__section-state-icon" viewBox="0 0 20 20">
    <rect height="8" rx="1.5" width="11" x="4.5" y="8.5" />
    <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
  </svg>
);

const minimizedStateIcon = (
  <svg aria-hidden="true" className="setta-workspace__section-state-icon" viewBox="0 0 20 20">
    <path d="M4 12.5h12" />
    <path d="m7 8 3-3 3 3" />
  </svg>
);

const detachedStateIcon = (
  <svg aria-hidden="true" className="setta-workspace__section-state-icon" viewBox="0 0 20 20">
    <rect height="9" rx="1.5" width="9" x="3.5" y="7.5" />
    <path d="M8 4.5h8v8" />
  </svg>
);

function SectionStateCue({ icon, label }: Readonly<{ icon: ReactNode; label: string }>) {
  return (
    <span className="setta-workspace__section-state">
      {icon}
      <span className="setta-workspace__visually-hidden">{label}</span>
    </span>
  );
}

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
      {locked ? <SectionStateCue icon={lockedStateIcon} label="Locked" /> : null}
      {isMinimized ? (
        <SectionStateCue
          icon={minimizedStateIcon}
          label={minimizeScope === "subtree" ? "Minimized subtree" : "Minimized"}
        />
      ) : null}
      {detached ? <SectionStateCue icon={detachedStateIcon} label="Detached" /> : null}
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
