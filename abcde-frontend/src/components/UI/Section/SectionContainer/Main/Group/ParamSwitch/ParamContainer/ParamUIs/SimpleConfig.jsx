import { StandardInput } from "utils/atoms/input/StandardInput";

export function SimpleConfig({ options, onChange, savedConfig }) {
  return (
    <div className="mt-1 flex flex-col">
      {options.map((e, idx) => (
        <div
          className="flex min-h-[36px] flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]"
          key={`SimpleConfig-${idx}`}
        >
          <h2 className="font-heading text-xs font-black text-gray-600">{e}</h2>
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
