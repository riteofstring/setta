import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return (
    <>
      <span className="h-100 w-[5px] border-l border-slate-200 pr-3" />
      <h3 className="font-heading text-sm font-bold text-slate-600">{`${name} / ${configName}`}</h3>
    </>
  );
}
