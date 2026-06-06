import { KeyRound, Settings2, Terminal } from "lucide-react";
import { useState } from "react";

import { CodexAccountPanel } from "./codex-account-panel";
import {
  readTerminalDisplaySettings,
  resetTerminalDisplaySettings,
  terminalThemeOptions,
  writeTerminalDisplaySettings,
  type TerminalDisplaySettings,
  type TerminalThemeId,
} from "../niri-workspace/terminal-display-settings";

export function SettingsPanel() {
  return (
    <section
      className="flex h-full min-h-0 flex-col bg-zinc-800 text-zinc-100"
      data-testid="settings-panel"
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b border-zinc-700 px-2">
        <Settings2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <h1 className="truncate text-xs font-semibold">Settings</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <article className="mx-auto grid w-full max-w-3xl gap-3">
          <header className="flex h-8 items-center gap-2 text-zinc-400">
            <KeyRound className="h-4 w-4" />
            <h2 className="text-xs font-semibold tracking-wide text-zinc-300">Codex Account</h2>
          </header>
          <CodexAccountPanel />
          <TerminalDisplaySettingsPanel />
        </article>
      </div>
    </section>
  );
}

function TerminalDisplaySettingsPanel() {
  const [settings, setSettings] = useState(() => readTerminalDisplaySettings());

  function update(next: Partial<TerminalDisplaySettings>) {
    setSettings((current) => writeTerminalDisplaySettings({ ...current, ...next }));
  }

  return (
    <section className="grid gap-3 border-t border-zinc-700 pt-3">
      <header className="flex h-8 items-center gap-2 text-zinc-400">
        <Terminal className="h-4 w-4" />
        <h2 className="text-xs font-semibold tracking-wide text-zinc-300">Terminal</h2>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-300">
          Theme
          <select
            className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-blue-400"
            value={settings.themeId}
            onChange={(event) => update({ themeId: event.currentTarget.value as TerminalThemeId })}
          >
            {terminalThemeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-300">
          Font Size
          <input
            className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-blue-400"
            min={10}
            max={22}
            type="number"
            value={settings.fontSize}
            onChange={(event) => update({ fontSize: Number(event.currentTarget.value) })}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-300">
          Font Family
          <input
            className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-blue-400"
            value={settings.fontFamily}
            onChange={(event) => update({ fontFamily: event.currentTarget.value })}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-300">
          Scrollback
          <input
            className="h-8 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-blue-400"
            min={100}
            max={10000}
            step={100}
            type="number"
            value={settings.scrollback}
            onChange={(event) => update({ scrollback: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
      <div>
        <button
          className="h-7 rounded-sm border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
          type="button"
          onClick={() => setSettings(resetTerminalDisplaySettings())}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
