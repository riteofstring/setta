import { useProject } from "models/info/project";
import { useProjectConfig } from "models/info/projectConfig";

export function ProjectName() {
  const name = useProject((x) => x.name);
  const configName = useProjectConfig((x) => x.name);
  return (
    <div className="mb-2 flex items-center gap-2 border-solid border-transparent px-1 text-xl [border-width:0_0_2px_0] [&:has(input:focus-visible)]:border-blue-500">
      {/* <BiFile className="text-slate-400" /> */}
      <input
        // id=""
        // name=""
        placeholder={`${configName} / ${name}`}
        // type=""
        // value={value}
        // onChange={onChange}
        // onBlur={onBlur}
        className="flex-grow py-2 font-heading font-bold tracking-tight placeholder-slate-600"
      />
    </div>

    // <h3 className="text-md -mx-2 rounded-lg py-1 px-2 font-logo tracking-tight text-slate-600 hover:bg-slate-200">{`${name} / </h3>
  );
}
