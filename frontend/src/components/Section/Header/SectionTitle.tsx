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
  | {
      title: string;
      titleProps: SectionTitleStyleProps;
      editable?: {
        onRename: (value: string) => void;
        condition?: (value: string) => boolean | Promise<boolean>;
      };
    };

export function SectionTitle(props: SectionTitleProps) {
  if ("sectionId" in props) {
    const { sectionId, titleProps } = props;
    const { sectionName, titleIsEditable } = useTitleIsEditable(sectionId);

    if (titleIsEditable) {
      const editableTitleProps = getEditableTitleProps(titleProps);
      return (
        <EditableTitle
          title={sectionName}
          onRename={(value: string) => setSectionName(sectionId, value)}
          condition={(value: string) => !getSiblingHasName(sectionId, value)}
          titleProps={editableTitleProps}
          {...getFloatingBoxHandlers({ title: sectionName })}
        />
      );
    }
    return (
      <FixedTitle
        sectionName={sectionName}
        className={titleProps.fixed ?? titleProps.notEditing ?? ""}
        {...getFloatingBoxHandlers({ title: sectionName })}
      />
    );
  }

  const { title, titleProps, editable } = props;
  if (editable) {
    const editableTitleProps = getEditableTitleProps(titleProps);
    const condition = editable.condition ?? (() => true);
    return (
      <EditableTitle
        title={title}
        onRename={editable.onRename}
        condition={condition}
        titleProps={editableTitleProps}
        {...getFloatingBoxHandlers({ title })}
      />
    );
  }

  if (titleProps.fixed) {
    return (
      <FixedTitle
        sectionName={title}
        className={titleProps.fixed}
        {...getFloatingBoxHandlers({ title })}
      />
    );
  }

  return (
    <FixedTitle
      sectionName={title}
      className={titleProps.notEditing ?? ""}
      {...getFloatingBoxHandlers({ title })}
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
  title,
  onRename,
  condition,
  titleProps,
  onMouseEnter,
  onMouseLeave,
}: {
  title: string;
  onRename: (value: string) => void;
  condition: (value: string) => boolean | Promise<boolean>;
  titleProps: SectionTitleEditableProps;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { inputValue, onChange, onBlur, onKeyDown, blurTriggeredByEscapeKey } =
    useEditableOnSubmit(title, onRename, condition);

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
