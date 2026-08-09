import { ItemNameEditor } from "../controls/name/ItemNameEditor";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { hasWorkspaceItemPresentation } from "../document/itemPresentation";
import { setItemLabel } from "../document/itemPresentationMutations";
import { BuiltInItemValueControl } from "./BuiltInItemValueControl";
import type { ItemRowRenderContext } from "./ItemListContext";

export function BuiltInItemRowContent({ context }: { context: ItemRowRenderContext }) {
  const canEditStructure = useWorkspaceCapabilities((state) => state.canEditStructure);
  if (!hasWorkspaceItemPresentation(context.item)) {
    throw new Error(
      `Custom item ${context.sectionId}/${context.item.id} requires a registered row renderer.`,
    );
  }
  const { control, label } = context.item.presentation;
  return (
    <>
      <ItemNameEditor
        sectionId={context.sectionId}
        itemId={context.item.id}
        name={label}
        language="python"
        hasChildren={control.kind === "group"}
        disabled={!canEditStructure}
        onNameChange={(nextLabel) => setItemLabel(context.sectionId, context.item.id, nextLabel)}
      />
      {control.kind === "group" ? null : (
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
