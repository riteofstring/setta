import { dbSetProjectConfigName, dbSetProjectName } from "requests/projectName";
import { getInfoViewHandlers } from "state/actions/infoView";
import { useProject, useProjectConfig } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { constInfoViews } from "utils/constants";
import { Editable } from "utils/Editable/Editable";
import {
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
} from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

const editing =
  "flex-1 box-border border-solid border-transparent bg-transparent px-1 [border-width:0_0_2px_0] focus:outline-none focus-visible:border-blue-500";

const notEditing =
  "flex-1 box-border border-solid border-transparent bg-transparent [border-width:0_0_2px_0] px-1 w-full truncate";

export function ProjectName() {
  const infoViewHandlers = getInfoViewHandlers(
    constInfoViews.OVERVIEW_PROJNAME,
  );

  return (
    <header
      className="mb-2 flex w-full flex-col flex-wrap font-heading  tracking-tight "
      {...infoViewHandlers}
    >
      <ProjectNameOnly />
      <ProjectConfigNameOnly />
    </header>
  );
}

function ProjectNameOnly() {
  const name = useProject((x) => x.name);
  async function condition(v) {
    const res = await dbSetProjectName(v);
    return res.status === 200;
  }
  async function onSetName(v) {
    const configName = useProjectConfig.getState().name;
    router.navigate(`${v}/${configName}`, {
      state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_NAME },
    });
  }

  return (
    <ProjectNameCore
      name={name}
      onSetName={onSetName}
      condition={condition}
      titleProps={{
        editing: `${editing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
        notEditing: `${notEditing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
      }}
    />
  );
}

function ProjectConfigNameOnly() {
  const name = useProjectConfig((x) => x.name);
  async function condition(v) {
    const res = await dbSetProjectConfigName(v);
    return res.status === 200;
  }
  async function onSetName(v) {
    const projectName = useProject.getState().name;
    router.navigate(`${projectName}/${v}`, {
      state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG_NAME },
    });
  }

  return (
    <ProjectNameCore
      name={name}
      onSetName={onSetName}
      condition={condition}
      titleProps={{
        editing: `${editing} text-md text-setta-600 dark:text-setta-300 mt-1 mb-2 font-medium`,
        notEditing: `${notEditing} text-md text-setta-600 dark:text-setta-300 mt-1 mb-2 font-medium`,
      }}
    />
  );
}

function ProjectNameCore({ name, onSetName, condition, titleProps }) {
  const [localName, setLocalName, onBlur, onCancel] = useEditableOnSubmit(
    name,
    onSetName,
    condition,
  );

  return (
    <Editable
      titleProps={titleProps}
      value={localName}
      onChange={setLocalName}
      onBlur={onBlur}
      onCancel={onCancel}
    />
  );
}
