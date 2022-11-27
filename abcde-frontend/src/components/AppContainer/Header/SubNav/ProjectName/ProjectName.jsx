import { useStoreState } from "easy-peasy";

export function ProjectName() {
  const name = useStoreState((x) => x.project.name);
  const configName = useStoreState((x) => x.projectConfig.name);
  return <h3 className="text-[#00B5D8]">{`${name} / ${configName}`}</h3>;
}
