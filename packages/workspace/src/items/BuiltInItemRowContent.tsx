import { BuiltInItemNameEditor } from "../controls/name/ItemNameEditor";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { hasWorkspaceItemPresentation } from "../document/itemPresentation";
import { setItemLabel } from "../document/itemPresentationMutations";
import { BuiltInItemValueControl } from "./BuiltInItemValueControl";
import type { ItemRowRenderContext } from "./ItemListContext";
import { WorkspaceItemLabel } from "./WorkspaceItemLabel";

export function BuiltInItemRowContent({ context }: { context: ItemRowRenderContext }) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
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
          onNameChange={(nextLabel) => setItemLabel(context.sectionId, context.item.id, nextLabel)}
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
