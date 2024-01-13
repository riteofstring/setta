import { Toggle } from "utils/atoms/toggles/Toggle";

export function RunTimeOptions({ sectionId, children }) {
  return (
    <>
      <p className="mt-2 mb-2 text-xs font-semibold uppercase text-runcoder-400">
        Options:
      </p>
      <Option>Test</Option>
    </>
  );
}

function Option({ children }) {
  return (
    <div className="flex items-center gap-4">
      <Toggle />
      <label>{children}</label>
    </div>
  );
}
