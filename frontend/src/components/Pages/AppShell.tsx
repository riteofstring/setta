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
  const titleBar = (
    <div className="setta-titlebar bg-setta-100 dark:bg-setta-900" />
  );

  if (isLoading) {
    return (
      <div className="app-shell setta-titlebar-offset flex min-h-screen min-w-full flex-col items-center justify-center px-6">
        {titleBar}
        {loadingContent}
      </div>
    );
  }

  return (
    <div className="app-base setta-titlebar-offset flex min-h-0 min-w-full flex-1 flex-col bg-setta-light dark:bg-setta-dark">
      {titleBar}
      {children}
    </div>
  );
}
