import { dbSetProjectConfigName, dbSetProjectName } from "requests/projectName";
import { useProject, useProjectConfig } from "state/definitions";
import { getInfoViewHandlers } from "state/hooks";
import { useEditableOnSubmit } from "state/hooks";
import { constInfoViews } from "utils/constants";
import { Editable } from "utils/Editable/Editable";
import {
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
} from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  const infoViewHandlers = getInfoViewHandlers(
    constInfoViews.OVERVIEW_PROJNAME,
  );

  async function setName(v) {
    await dbSetProjectName(v);
    router.navigate(`${v}/${configName}`, {
      state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_NAME },
    });
  }

  async function setConfigName(v) {
    await dbSetProjectConfigName(v);
    router.navigate(`${name}/${v}`, {
      state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_CONFIG_NAME },
    });
  }

  const editing =
    "flex-1 box-border border-solid border-transparent bg-transparent px-1 [border-width:0_0_2px_0] focus:outline-none focus-visible:border-blue-500";

  const notEditing =
    "flex-1 box-border border-solid border-transparent bg-transparent [border-width:0_0_2px_0] px-1 w-full truncate";

  return (
    <header
      className="mb-2 flex w-full flex-col flex-wrap font-heading  tracking-tight "
      {...infoViewHandlers}
    >
      <ProjectNameCore
        name={name}
        setName={setName}
        titleProps={{
          editing: `${editing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
          notEditing: `${notEditing} text-xl text-setta-900 dark:text-setta-50 font-bold `,
        }}
      />
      <ProjectNameCore
        name={configName}
        setName={setConfigName}
        titleProps={{
          editing: `${editing} text-md text-setta-600 dark:text-setta-300 mt-1 mb-2 font-medium`,
          notEditing: `${notEditing} text-md text-setta-600 dark:text-setta-300 mt-1 mb-2 font-medium`,
        }}
      />
    </header>
  );
}

function ProjectNameCore({ name, setName, titleProps }) {
  const [localName, setLocalName, onBlur, onCancel] = useEditableOnSubmit(
    name,
    setName,
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
