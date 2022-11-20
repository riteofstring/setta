import { useStoreState } from "easy-peasy";

export function ProjectName() {
  const name = useStoreState((x) => x.project.name);
  const configName = useStoreState((x) => x.projectConfig.name);
  return <span className="text-[#00B5D8]">{`${name} / ${configName}`}</span>;
}
