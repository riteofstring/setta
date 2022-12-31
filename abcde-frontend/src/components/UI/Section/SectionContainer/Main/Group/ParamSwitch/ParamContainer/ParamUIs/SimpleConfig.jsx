import StandardInput from "utils/atoms/input/StandardInput";

export default function SimpleConfig({ options, onChange, savedConfig }) {
  return (
    <div className="flex flex-col justify-items-stretch">
      {options.map((e, idx) => (
        <div className="w-full flex flex-grow justify-between items-center px-3 py-[0.33rem] rounded-full min-h-[36px] hover:bg-[#cbd5e02b]">
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
