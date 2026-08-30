import {
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { SectionDndContext } from "../dnd/SectionDndContext";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import { WorkspaceSectionSurface } from "../section/WorkspaceSectionSurface";
import { useWorkspaceFocusVisibility } from "../styles/workspaceFocusVisibility";
import { useWorkspaceScopeClassName } from "../styles/workspaceScope";
import { useWorkspaceHost } from "../workspaceHostContext";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";

type StandaloneWorkspaceSectionSurfaceHeaderProps = Omit<
  ComponentPropsWithoutRef<"header">,
  "children" | "ref"
> & {
  "data-testid"?: string;
};

export type StandaloneWorkspaceSectionSurfaceProps = {
  sectionId: string;

  ariaLabel?: string;
  className?: string;
  headerActions?: ReactNode;
  headerProps?: StandaloneWorkspaceSectionSurfaceHeaderProps;
};

function joinClassNames(
  ...classNames: ReadonlyArray<string | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}

export function StandaloneWorkspaceSectionSurface({
  ariaLabel,
  className,
  headerActions,
  headerProps,
  sectionId,
}: StandaloneWorkspaceSectionSurfaceProps) {
  return (
    <SectionDndContext>
      <StandaloneWorkspaceSectionSurfaceRoot
        ariaLabel={ariaLabel}
        className={className}
        headerActions={headerActions}
        headerProps={headerProps}
        sectionId={sectionId}
      />
    </SectionDndContext>
  );
}

function StandaloneWorkspaceSectionSurfaceRoot({
  ariaLabel,
  className,
  headerActions,
  headerProps,
  sectionId,
}: StandaloneWorkspaceSectionSurfaceProps) {
  const host = useWorkspaceHost();
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const sectionName = useWorkspaceDocument(
    (state) => getSectionOrThrow(state, sectionId).name,
  );
  useWorkspaceFocusVisibility(rootRef);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      throw new Error(
        "Standalone workspace section surface root did not mount.",
      );
    }
    return registerWorkspaceHostElement(host, root);
  }, [host]);

  return (
    <div
      aria-label={ariaLabel ?? sectionName}
      className={joinClassNames(
        workspaceScopeClassName,
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        className,
      )}
      data-section-id={sectionId}
      data-testid="standalone-workspace-section-surface"
      data-workspace-standalone-section-surface="true"
      ref={rootRef}
      role="region"
    >
      <WorkspaceSectionSurface
        className="flex min-h-0 flex-1"
        headerActions={headerActions}
        headerProps={headerProps}
        includeDescendants
        sectionId={sectionId}
      />
    </div>
  );
}
