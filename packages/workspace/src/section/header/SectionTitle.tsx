import { useWorkspaceCapabilities } from "../../document/capabilities";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { setSectionName } from "../../document/sectionMutations";
import { useWorkspaceDocument } from "../../document/stores";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip";
import { Editable } from "./Editable";
import { useEditableOnSubmit } from "./useEditableOnSubmit";

// The reference's `SectionTitle`, trimmed to the slice: renaming is gated by
// `canEditStructure`; the fixed presentation renders when editing is not allowed. The
// backend name-validation pipeline and its error chrome stayed application-side with the
// generated naming rules; a host that rejects a rename reported through the document-change
// callback re-loads its authoritative document.
export type SectionTitleClassNames = {
  editing?: string;
  notEditing?: string;
  fixed?: string;
};

type SectionTitleProps = {
  sectionId: string;
  titleProps: SectionTitleClassNames;
};

export function SectionTitle({ sectionId, titleProps }: SectionTitleProps) {
  const sectionName = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId).name);
  const canEditStructure = useWorkspaceCapabilities((x) => x.canEditStructure);

  // As the reference, both title presentations attach the tooltip handlers so holding the
  // tooltip key while hovering shows the full name of a truncated title.
  if (canEditStructure) {
    return (
      <EditableTitle sectionId={sectionId} sectionName={sectionName} titleProps={titleProps} />
    );
  }
  return (
    <h2 className={titleProps.fixed} {...getWorkspaceTooltipHandlers({ content: sectionName })}>
      {sectionName}
    </h2>
  );
}

function EditableTitle({
  sectionId,
  sectionName,
  titleProps,
}: {
  sectionId: string;
  sectionName: string;
  titleProps: SectionTitleClassNames;
}) {
  const normalizeName = (value: string) => value.trim();
  const editable = useEditableOnSubmit(
    sectionName,
    (name) => setSectionName(sectionId, name),
    () => true,
    normalizeName,
  );

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <Editable
        value={editable.inputValue}
        onChange={editable.onChange}
        onBlur={editable.onBlur}
        onKeyDown={editable.onKeyDown}
        titleProps={titleProps}
        blurTriggeredByEscapeKey={editable.blurTriggeredByEscapeKey}
        {...getWorkspaceTooltipHandlers({ content: sectionName })}
      />
    </div>
  );
}
