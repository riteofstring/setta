import { KeyRound } from "lucide-react";

import { CodexAccountPanel } from "./codex-account-panel";

export function CodexAccountSettings() {
  return (
    <article className="grid gap-3" data-testid="codex-account-settings">
      <header className="flex h-8 items-center gap-2 text-muted-foreground">
        <KeyRound className="h-4 w-4" />
        <h2 className="text-xs font-semibold tracking-wide text-foreground">Codex Account</h2>
      </header>
      <CodexAccountPanel />
    </article>
  );
}
