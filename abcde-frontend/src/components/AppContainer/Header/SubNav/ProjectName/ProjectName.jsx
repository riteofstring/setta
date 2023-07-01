import {
  dbSetProjectConfigName,
  dbSetProjectName,
} from "dbRequests/projectName";
import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useAuth } from "models/auth";
import { ConstantInfoView, useSetCurrInfoView } from "models/info/infoView";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { Editable } from "utils/Editable/Editable";
import {
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
} from "utils/Routes/pageLoadTypes";
import { router } from "utils/Routes/router";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  const infoViewHandlers = useSetCurrInfoView(
    ConstantInfoView.OVERVIEW_PROJNAME
  );

  function setName(v) {
    dbSetProjectName(v);
    const username = useAuth.getState().username;
    router.navigate(`${username}/${v}/${configName}`, {
      state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_NAME },
    });
  }

  function setConfigName(v) {
    dbSetProjectConfigName(v);
    const username = useAuth.getState().username;
    router.navigate(`${username}/${name}/${v}`, {
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
          editing: `${editing} text-xl text-slate-900 font-bold `,
          notEditing: `${notEditing} text-xl text-slate-900 font-bold `,
        }}
      />
      <ProjectNameCore
        name={configName}
        setName={setConfigName}
        titleProps={{
          editing: `${editing} text-md text-slate-600 mt-1 mb-4 font-medium`,
          notEditing: `${notEditing} text-md text-slate-600 mt-1 mb-4 font-medium`,
        }}
      />
    </header>
  );
}

function ProjectNameCore({ name, setName, titleProps }) {
  const [localName, setLocalName, onBlur, onCancel] = useEditableOnSubmit(
    name,
    setName
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
