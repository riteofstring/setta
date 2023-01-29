import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return (
    <>
      <span className="w-[5px] h-100 border-l border-gray-200 pr-3" />
      <h3 className="font-heading font-bold text-gray-600 text-sm">{`${name} / ${configName}`}</h3>
    </>
  );
}
