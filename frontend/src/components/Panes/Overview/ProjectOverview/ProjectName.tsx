import { Editable } from "components/Utils/Editable";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useNavigate } from "react-router-dom";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import { route_set_project_config_name } from "utils/generatedEndpoints";
import { validateProjectNameInput } from "utils/nameValidation";

const editing =
  "flex-1 box-border [border-width:0_0_1px_0] border-solid bg-transparent focus:border-blue-300 focus-visible:ring-0 focus-visible:outline-none w-full ";

const notEditing =
  "flex-1 box-border border-b border-solid border-transparent bg-transparent focus-visible:border-blue-300 focus-visible:ring-0 focus-visible:outline-none w-full truncate";

export function ProjectName() {
  return (
    <header
      className="mb-2 flex w-full flex-col flex-wrap   tracking-tight "
      {...getFloatingBoxHandlers({
        content:
          "Your Project's Name and Config Name, editable all in one spot!",
      })}
    >
      <ProjectNameOnly />
    </header>
  );
}

function ProjectNameOnly() {
  const {
    inputValue: localName,
    onChange,
    onBlur,
    onKeyDown,
    blurTriggeredByEscapeKey,
  } = useEditableProjectName();
  const validationError = validateProjectNameInput(localName);
  let errorClassName = "";
  if (validationError) {
    errorClassName = "border-red-400 text-red-600 dark:text-red-300";
  }

  return (
    <>
      <Editable
        titleProps={{
          editing: `${editing} text-xl text-setta-900 dark:text-setta-50 font-bold ${errorClassName}`,
          notEditing: `${notEditing} text-xl text-setta-900 dark:text-setta-50 font-bold ${errorClassName}`,
        }}
        value={localName}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        blurTriggeredByEscapeKey={blurTriggeredByEscapeKey}
      />
      {validationError && (
        <p className="mt-1 text-xs text-red-500">{validationError}</p>
      )}
    </>
  );
}

function useEditableProjectName() {
  const { projectConfigId, name } = useProjectState((x) => ({
    projectConfigId: x.projectConfig.id,
    name: x.projectConfig.name,
  }));
  const navigate = useNavigate();
  async function condition(v: string) {
    const validationError = validateProjectNameInput(v);
    if (validationError) {
      return false;
    }
    const res = await route_set_project_config_name({
      projectConfigId,
      newName: v,
    });
    return res200(res);
  }
  async function onSetName(v: string) {
    navigate(pathRelativeToProject(v), {
      state: { pageLoadType: PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME },
    });
  }

  return useEditableOnSubmit(name, onSetName, condition);
}
