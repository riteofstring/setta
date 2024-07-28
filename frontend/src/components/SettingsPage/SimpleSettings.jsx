import { useSimpleSettings } from "state/hooks/settings";

export function SimpleSettings() {
  const [settings, handleInputChange] = useSimpleSettings();

  return (
    <>
      {settings.map((setting, index) => (
        <div
          key={index}
          className="-mx-3 flex items-center justify-between rounded-lg px-3 py-1 hover:bg-setta-200/25 dark:hover:bg-setta-800/50"
        >
          <label className="mr-2 break-all text-setta-700 dark:text-setta-100">
            {setting.name}
          </label>
          <input
            type="text"
            value={setting.value}
            onChange={(e) => handleInputChange(index, e.target.value)}
            className="rounded-xl bg-setta-200 px-2 py-1 dark:bg-setta-800  dark:text-setta-50"
          />
        </div>
      ))}
    </>
  );
}
