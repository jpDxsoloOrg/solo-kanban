"use client";

import { useState } from "react";
import { Button, Input, Card, CardContent } from "@dxsolo/ui";
import { createProject } from "@/actions/project-actions";

export function CreateFirstProject() {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsCreating(true);
    try {
      await createProject(trimmed);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsCreating(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardContent className="flex flex-col gap-4 p-6">
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