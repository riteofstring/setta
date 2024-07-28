import {
  useSetShorcutSetting,
  useShortcutSettings,
} from "state/hooks/settings";

export function ShortcutSettings() {
  const settings = useShortcutSettings();

  return (
    <>
      {settings.map((setting, index) => (
        <ShortcutSetting key={index} setting={setting} />
      ))}
    </>
  );
}

function ShortcutSetting({ setting }) {
  const {
    tempShortcut,
    showSaveButton,
    onFocus,
    onBlur,
    onSaveButtonClick,
    onSaveButtonMouseDown,
    inputRef,
  } = useSetShorcutSetting(setting);

  return (
    <div className="relative -mx-3 flex items-center justify-between rounded-lg px-3 py-1 hover:bg-setta-200/25 dark:hover:bg-setta-800/50">
      <label className="mr-2 break-all text-setta-700 dark:text-setta-100">
        {setting.name}
      </label>
      <input
        type="text"
        value={tempShortcut}
        className="rounded-lg bg-setta-200 px-2 py-1 dark:bg-setta-800  dark:text-setta-50"
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={() => {}}
        ref={inputRef}
      />

      {showSaveButton && (
        <button
          className="dark:hover:bg-setta-850; absolute right-0 mr-4 cursor-pointer rounded-lg bg-setta-300 px-2 py-1 text-xs text-setta-800 hover:bg-setta-400 dark:bg-setta-700 dark:text-setta-200"
          onClick={onSaveButtonClick}
          onMouseDown={onSaveButtonMouseDown}
        >
          Save
        </button>
      )}
    </div>
  );
}
