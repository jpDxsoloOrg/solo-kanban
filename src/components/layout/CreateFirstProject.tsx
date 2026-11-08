"use client";

import { useState } from "react";
import { Button, Input, Card, CardContent } from "@dxsolo/ui";
import { createProject } from "@/actions/project-actions";
import { todayInputValue } from "@/lib/sprint-dates";
import { isNavigationError } from "./navigation-error";

export function CreateFirstProject() {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    setError(null);
    try {
      // The browser's date, so Sprint 1 starts on the user's day.
      await createProject(trimmed, undefined, todayInputValue());
    } catch (error) {
      // createProject redirects to the new board on success.
      if (isNavigationError(error)) return;
      console.error("Failed to create project:", error);
      setError("Couldn't create the project. Please try again.");
      setIsCreating(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Welcome to Solo Kanban</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first project to get started.
          </p>
        </div>
        <Input
          label="Project Name"
          placeholder="My Project"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          intent="primary"
          onClick={handleCreate}
          disabled={isCreating || !name.trim()}
          className="w-full"
        >
          {isCreating ? "Creating..." : "Create Project"}
        </Button>
      </CardContent>
    </Card>
  );
}