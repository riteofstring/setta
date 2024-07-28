import { Editable } from "components/Utils/Editable";
import { getInfoViewHandlers } from "state/actions/infoView";
import {
  useEditableProjectConfigName,
  useEditableProjectName,
} from "state/hooks/project";
import { CONST_INFO_VIEWS } from "utils/constants";

const editing =
  "flex-1 box-border border-solid border-transparent bg-transparent px-1 [border-width:0_0_2px_0] focus:outline-none focus-visible:border-blue-500";

const notEditing =
  "flex-1 box-border border-solid border-transparent bg-transparent [border-width:0_0_2px_0] px-1 w-full truncate";

export function ProjectName() {
  return (
    <header
      className="mb-2 flex w-full flex-col flex-wrap font-heading  tracking-tight "
      {...getInfoViewHandlers(CONST_INFO_VIEWS.OVERVIEW_PROJNAME)}
    >
      <ProjectNameOnly />
      <ProjectConfigNameOnly />
    </header>
  );
}

function ProjectNameOnly() {
  const [localName, setLocalName, onBlur, onCancel] = useEditableProjectName();

  return (
    <Editable
      titleProps={{
        editing: `${editing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
        notEditing: `${notEditing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
      }}
      value={localName}
      onChange={setLocalName}
      onBlur={onBlur}
      onCancel={onCancel}
    />
  );
}

function ProjectConfigNameOnly() {
  const [localName, setLocalName, onBlur, onCancel] =
    useEditableProjectConfigName();

  return (
    <Editable
      titleProps={{
        editing: `${editing} text-md text-setta-600 dark:text-setta-300 mt-1 mb-2 font-medium`,
        notEditing: `${notEditing} text-md text-setta-600 dark:text-setta-300 mt-1 mb-2 font-medium`,
      }}
      value={localName}
      onChange={setLocalName}
      onBlur={onBlur}
      onCancel={onCancel}
    />
  );
}
