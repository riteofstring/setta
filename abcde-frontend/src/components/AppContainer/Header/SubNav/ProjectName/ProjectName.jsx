import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return (
    <input
      // id=""
      // name=""
      placeholder={`${configName} / ${name}`}
      // type=""
      // value={value}
      // onChange={onChange}
      // onBlur={onBlur}
      className="mb-2 border-solid border-transparent py-2 px-1 font-heading text-xl font-bold tracking-tight placeholder-slate-600 [border-width:0_0_2px_0] focus-visible:border-blue-500"
    />
  );
}
