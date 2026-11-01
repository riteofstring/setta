import { useWorkspaceCapabilities } from "../../document/capabilities.js";
import { getSectionOrThrow } from "../../document/documentSelectors.js";
import { setSectionName } from "../../document/sectionMutations.js";
import { useWorkspaceDocument } from "../../document/stores.js";
import { getWorkspaceTooltipHandlers } from "../../tooltip/WorkspaceTooltip.js";
import { Editable } from "./Editable.js";
import { useEditableOnSubmit } from "./useEditableOnSubmit.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";

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
  const host = useWorkspaceHost();
  const sectionName = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).name,
  );
  const canEditStructure = useWorkspaceCapabilities((x) => x.canEditStructure);

  if (canEditStructure) {
    return (
      <EditableTitle
        sectionId={sectionId}
        sectionName={sectionName}
        titleProps={titleProps}
      />
    );
  }
  return (
    <h2
      className={titleProps.fixed}
      {...getWorkspaceTooltipHandlers(host, { content: sectionName })}
    >
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
  const host = useWorkspaceHost();
  const normalizeName = (value: string) => value.trim();
  const editable = useEditableOnSubmit(
    sectionName,
    (name) => setSectionName(host, sectionId, name),
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
        restoreFocusAfterKeyboardSubmit={
          editable.restoreFocusAfterKeyboardSubmit
        }
        {...getWorkspaceTooltipHandlers(host, { content: sectionName })}
      />
    </div>
  );
}
