"use client";

import { ReactNode, useState } from "react";
import { Button } from "@dxsolo/ui";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className={`grid h-screen overflow-hidden transition-[grid-template-columns] duration-200 ${
        sidebarOpen ? "grid-cols-[260px_1fr]" : "grid-cols-[0px_1fr]"
      }`}
    >
      <aside
        className={`border-r border-gray-200 bg-gray-50 overflow-y-auto overflow-x-hidden transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {sidebar}
      </aside>
      <main className="overflow-hidden relative">
        {/* Sidebar toggle */}
        <Button
          intent="ghost"
          className="absolute top-2 left-2 z-10"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? "◀" : "▶"}
        </Button>
        <div className="h-full pt-10">{children}</div>
      </main>
    </div>
  );
}