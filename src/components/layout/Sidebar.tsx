"use client";

import { Button } from "@dxsolo/ui";

interface SidebarProps {
  projectName: string;
  epicCount: number;
  issueCount: number;
}

export function Sidebar({ projectName, epicCount, issueCount }: SidebarProps) {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold">{projectName}</h1>
        <p className="text-sm text-gray-500">
          {epicCount} epics, {issueCount} issues
        </p>
      </div>

      <nav className="flex flex-col gap-1">
        <Button intent="ghost" className="justify-start w-full">
          Board
        </Button>
        <Button intent="ghost" className="justify-start w-full">
          Backlog
        </Button>
        <Button intent="ghost" className="justify-start w-full">
          Settings
        </Button>
      </nav>

      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Epics
        </h2>
        <p className="text-sm text-gray-500">
          Epic filters coming in Part 5.
        </p>
      </div>
    </div>
  );
}