import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return <h3 className="text-[#00B5D8]">{`${name} / ${configName}`}</h3>;
}
