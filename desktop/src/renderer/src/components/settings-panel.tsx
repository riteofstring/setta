import { KeyRound, Settings2 } from "lucide-react";

import { CodexAccountPanel } from "./codex-account-panel";

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
        </article>
      </div>
    </section>
  );
}
