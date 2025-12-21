import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  getSectionChildren,
  getSectionCore,
} from "state/actions/sectionInfos";
import { useNodeInternals, useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { route_set_section_name } from "utils/generatedEndpoints";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";

type SectionTitleEditableProps = {
  editing: string;
  notEditing: string;
  fixed?: string;
};

type SectionTitleStyleProps = {
  editing?: string;
  notEditing?: string;
  fixed?: string;
};

type SectionTitleProps =
  | { sectionId: string; titleProps: SectionTitleStyleProps }
  | { title: string; titleProps: { fixed: string } };

export function SectionTitle(props: SectionTitleProps) {
  if ("title" in props) {
    return (
      <FixedTitle
        sectionName={props.title}
        className={props.titleProps.fixed}
        {...getFloatingBoxHandlers({ title: props.title })}
      />
    );
  }

  const { sectionId, titleProps } = props;
  const { sectionName, titleIsEditable } = useTitleIsEditable(sectionId);

  if (titleIsEditable) {
    const editableTitleProps = getEditableTitleProps(titleProps);
    return (
      <EditableTitle
        sectionId={sectionId}
        sectionName={sectionName}
        titleProps={editableTitleProps}
        {...getFloatingBoxHandlers({ title: sectionName })}
      />
    );
  }
  return (
    <FixedTitle
      sectionName={sectionName}
      className={titleProps.fixed ?? titleProps.notEditing}
      {...getFloatingBoxHandlers({ title: sectionName })}
    />
  );
}

function FixedTitle({
  sectionName,
  className,
  onMouseEnter,
  onMouseLeave,
}: {
  sectionName: string;
  className: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <h2
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {sectionName}
    </h2>
  );
}

function EditableTitle({
  sectionId,
  sectionName,
  titleProps,
  onMouseEnter,
  onMouseLeave,
}: {
  sectionId: string;
  sectionName: string;
  titleProps: SectionTitleEditableProps;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  function onTitleInputChange(value: string) {
    setSectionName(sectionId, value);
  }

  function condition(value: string) {
    return !getSiblingHasName(sectionId, value);
  }

  const { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey } =
    useEditableOnSubmit(sectionName, onTitleInputChange, condition);

  return (
    <Editable
      value={inputValue}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      titleProps={titleProps}
      doubleClickToEdit={true}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      blurTriggeredByEscapeKey={blurTriggeredByEscapeKey}
    />
  );
}

function setSectionName(sectionId: string, name: string) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const section = state.sections[sectionId];
      if (!section) {
        return;
      }
      section.name = name;
    },
    send: (frontendOpId) =>
      route_set_section_name({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        name,
        frontendOpId,
      }),
  });
}

function useTitleIsEditable(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);

    const uneditableTypes: Array<SectionType> = [
      SectionTypeEnum.GlobalVariables,
      SectionTypeEnum.GenPythonCode,
    ];

    const s = getSectionCore(x, sectionId);

    return {
      sectionName: s.name,
      titleIsEditable: !uneditableTypes.includes(impl.type),
    };
  });
}

function getEditableTitleProps(
  titleProps: SectionTitleStyleProps,
): SectionTitleEditableProps {
  return {
    editing: titleProps.editing ?? titleProps.fixed ?? "",
    notEditing: titleProps.notEditing ?? titleProps.fixed ?? "",
    fixed: titleProps.fixed,
  };
}

function getSiblingHasName(sectionId: string, newName: string) {
  const state = useProjectState.getState();
  const parentId = state.parentSectionMap[sectionId];
  let siblingIds: Iterable<string>;
  if (parentId) {
    siblingIds = getSectionChildren(state, parentId);
  } else {
    siblingIds = useNodeInternals.getState().x.keys();
  }
  for (const s of siblingIds) {
    if (state.sections[s]?.name === newName) {
      return true;
    }
  }
  return false;
}
