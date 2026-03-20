"use client";

import { ReactNode } from "react";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="grid grid-cols-[260px_1fr] h-screen overflow-hidden">
      <aside className="border-r border-gray-200 bg-gray-50 overflow-y-auto">
        {sidebar}
      </aside>
      <main className="overflow-hidden">{children}</main>
    </div>
  );
}