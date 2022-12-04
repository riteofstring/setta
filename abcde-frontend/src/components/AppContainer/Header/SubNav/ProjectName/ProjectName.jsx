import { useStoreState } from "easy-peasy";
import { useProjectConfig } from "models/info/projectConfig";

export function ProjectName() {
  const name = useStoreState((x) => x.project.name);
  const configName = useProjectConfig((x) => x.name);
  return <span className="text-[#00B5D8]">{`${name} / ${configName}`}</span>;
}
