import { useStoreState } from "easy-peasy";

export function ProjectName() {
  const name = useStoreState((x) => x.project.name);
  return <span className="text-[#00B5D8]">{name}</span>;
}
