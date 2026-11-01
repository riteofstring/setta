import { WorkspaceWindowSpacesPaneContent } from "./WorkspaceWindowSpacesPaneLayout.js";
import type {
  WorkspaceWindowSpace,
  WorkspaceWindowSpaceRestoreResult,
} from "./windowSpaces.js";
import type {
  WorkspaceWindowingState,
  WorkspaceWindowViewport,
} from "./windowingTypes.js";

export type WorkspaceWindowSpacePending = {
  save?: boolean;
  reorder?: boolean;
  restoreSpaceIds?: readonly string[];
  renameSpaceIds?: readonly string[];
  deleteSpaceIds?: readonly string[];
};

export type WorkspaceWindowSpaceErrors = {
  save?: string | null;
  reorder?: string | null;
  bySpaceId?: Readonly<Record<string, string | null | undefined>>;
};

export type WorkspaceWindowSpacesPaneProps = {
  spaces: readonly WorkspaceWindowSpace[];
  state: WorkspaceWindowingState;
  viewport: WorkspaceWindowViewport;
  onStateChange: (nextState: WorkspaceWindowingState) => void;
  onSave?: () => void;
  onOpenDedicated?: (space: WorkspaceWindowSpace) => void;
  onRename?: (spaceId: string, nextName: string) => void;
  onDelete?: (spaceId: string) => void;
  onReorder?: (nextOrderedIds: readonly string[]) => void;
  onRestore?: (
    space: WorkspaceWindowSpace,
    result: WorkspaceWindowSpaceRestoreResult,
  ) => void;
  layoutEditable?: boolean;
  editing?: boolean;
  pending?: WorkspaceWindowSpacePending;
  errors?: WorkspaceWindowSpaceErrors;
  ariaLabel?: string;
  className?: string;
};

export function WorkspaceWindowSpacesPane(
  props: WorkspaceWindowSpacesPaneProps,
) {
  return <WorkspaceWindowSpacesPaneContent {...props} />;
}
