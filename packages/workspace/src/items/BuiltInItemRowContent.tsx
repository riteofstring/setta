import { BuiltInItemNameEditor } from "../controls/name/ItemNameEditor.js";
import { useWorkspaceCapabilities } from "../document/capabilities.js";
import { hasWorkspaceItemPresentation } from "../document/itemPresentation.js";
import { setItemLabel } from "../document/itemPresentationMutations.js";
import { BuiltInItemValueControl } from "./BuiltInItemValueControl.js";
import type { ItemRowRenderContext } from "./ItemListContext.js";
import { WorkspaceItemLabel } from "./WorkspaceItemLabel.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";

export function BuiltInItemRowContent({
  context,
}: {
  context: ItemRowRenderContext;
}) {
  const host = useWorkspaceHost();
  const canEditStructure = useWorkspaceCapabilities(
    (state) => state.canEditStructure,
  );
  if (!hasWorkspaceItemPresentation(context.item)) {
    throw new Error(
      `Custom item ${context.sectionId}/${context.item.id} requires a registered row renderer.`,
    );
  }
  const { control, label, labelEditable } = context.item.presentation;
  const isGroup = control.kind === "group";
  return (
    <>
      {labelEditable ? (
        <BuiltInItemNameEditor
          sectionId={context.sectionId}
          itemId={context.item.id}
          name={label}
          language="python"
          hasChildren={isGroup}
          disabled={!canEditStructure}
          onNameChange={(nextLabel) =>
            setItemLabel(host, context.sectionId, context.item.id, nextLabel)
          }
          reserveEndControlSpace={false}
        />
      ) : (
        <WorkspaceItemLabel
          className="truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200"
          data-workspace-static-item-label="true"
          isGroup={isGroup}
        >
          {label}
        </WorkspaceItemLabel>
      )}
      {isGroup ? null : (
        <BuiltInItemValueControl
          sectionId={context.sectionId}
          itemId={context.item.id}
          label={label}
          control={control}
        />
      )}
    </>
  );
}
