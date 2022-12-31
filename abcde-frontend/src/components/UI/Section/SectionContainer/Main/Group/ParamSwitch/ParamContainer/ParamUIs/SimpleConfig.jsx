export default function SimpleConfig({ options, onChange, savedConfig }) {
  return options.map((e, idx) => (
    <input
      placeholder={e}
      key={`${e}-${idx}`}
      onChange={(v) => onChange(e, () => v.target.value)}
      value={savedConfig?.[e] ? savedConfig[e] : ""}
    />
  ));
}
