import { useEditableOnSubmit } from "hooks/useEditableOnSubmit";
import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";
import { Editable } from "utils/Editable/Editable";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  const setName = useProject((x) => x.setName);
  const setConfigName = useProjectConfig((x) => x.setName);

  const editing =
    "flex-1 box-border border-solid border-transparent bg-transparent px-1 [border-width:0_0_2px_0] focus:outline-none focus-visible:border-blue-500";

  const notEditing =
    "flex-1 box-border border-solid border-transparent bg-transparent [border-width:0_0_2px_0] px-1 w-full truncate";

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-col flex-wrap font-heading  tracking-tight ">
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
      </div>
    </div>
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
