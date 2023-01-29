import { StandardInput } from "utils/atoms/input/StandardInput";

export function SimpleConfig({ options, onChange, savedConfig }) {
  return (
    <div className="flex flex-col mt-1">
      {options.map((e, idx) => (
        <div
          className="flex flex-grow justify-between items-center px-3 py-[0.33rem] rounded-full min-h-[36px] hover:bg-[#cbd5e02b]"
          key={`SimpleConfig-${idx}`}
        >
          <h2 className="text-xs font-black font-heading text-gray-600">{e}</h2>
          <StandardInput
            twClasses="justify-end"
            placeholder={e}
            key={`${e}-${idx}`}
            onChange={(v) => onChange(e, () => v.target.value)}
            value={savedConfig?.[e] ? savedConfig[e] : ""}
          />
        </div>
      ))}
    </div>
  );
}
