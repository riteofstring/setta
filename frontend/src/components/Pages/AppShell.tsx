import type { ReactNode } from "react";

type AppShellProps = {
  isLoading: boolean;
  loadingContent: ReactNode;
  children: ReactNode;
};

export function AppShell({
  isLoading,
  loadingContent,
  children,
}: AppShellProps) {
  if (isLoading) {
    return (
      <div className="app-shell flex min-h-screen min-w-full flex-col items-center justify-center px-6">
        {loadingContent}
      </div>
    );
  }

  return (
    <div className="app-base flex min-h-0 min-w-full flex-1 flex-col bg-setta-light dark:bg-setta-dark">
      {children}
    </div>
  );
}
