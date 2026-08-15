import { BuiltInItemNameEditor } from "../controls/name/ItemNameEditor";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { hasWorkspaceItemPresentation } from "../document/itemPresentation";
import { setItemLabel } from "../document/itemPresentationMutations";
import { useItemSelectionModeForControl } from "../document/itemSelectionMode";
import { BuiltInItemValueControl } from "./BuiltInItemValueControl";
import type { ItemRowRenderContext } from "./ItemListContext";
import { WorkspaceItemHelp } from "./WorkspaceItemHelp";

export function BuiltInItemRowContent({ context }: { context: ItemRowRenderContext }) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  const isSelectingItems = useItemSelectionModeForControl();
  if (!hasWorkspaceItemPresentation(context.item)) {
    throw new Error(
      `Custom item ${context.sectionId}/${context.item.id} requires a registered row renderer.`,
    );
  }
  const { control, helpText, label } = context.item.presentation;
  const hasHelp = !isSelectingItems && Boolean(helpText?.trim());
  const isGroup = control.kind === "group";
  return (
    <>
      <BuiltInItemNameEditor
        sectionId={context.sectionId}
        itemId={context.item.id}
        name={label}
        language="python"
        hasChildren={isGroup}
        disabled={!canEditStructure}
        onNameChange={(nextLabel) => setItemLabel(context.sectionId, context.item.id, nextLabel)}
        reserveEndControlSpace={hasHelp}
      />
      {hasHelp && helpText ? (
        <WorkspaceItemHelp helpText={helpText} isGroup={isGroup} itemLabel={label} />
      ) : null}
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
