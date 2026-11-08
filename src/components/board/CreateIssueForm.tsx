"use client";

import { useState, useRef, useEffect } from "react";
import { Input, Button, Select } from "@dxsolo/ui";
import type { IssueStatus, Epic } from "@prisma/client";
import { createIssue } from "@/actions/create-issue";
import type { IssueWithRelations } from "@/types";

interface CreateIssueFormProps {
  projectId: string;
  /** Sprint to create the issue in; null creates it in the backlog. */
  sprintId: string | null;
  status: IssueStatus;
  epics: Epic[];
  onCreated: (issue: IssueWithRelations) => void;
  onCancel: () => void;
}

export function CreateIssueForm({
  projectId,
  sprintId,
  status,
  epics,
  onCreated,
  onCancel,
}: CreateIssueFormProps) {
  const [title, setTitle] = useState("");
  const [epicId, setEpicId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setIsCreating(true);
    setError(null);
    try {
      const issue = await createIssue({
        projectId,
        title: trimmed,
        status,
        epicId: epicId || null,
        sprintId,
      });
      onCreated(issue);
      setTitle("");
      setEpicId("");
    } catch (error) {
      console.error("Failed to create issue:", error);
      setError("Couldn't create the issue. Reload the board and try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2 rounded-lg border border-border bg-background">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Issue title..."
        aria-label="New issue title"
        disabled={isCreating}
      />
      {epics.length > 0 && (
        <Select
          value={epicId}
          onChange={(e) => setEpicId(e.target.value)}
          aria-label="Epic"
          disabled={isCreating}
        >
          <option value="">No epic</option>
          {epics.map((epic) => (
            <option key={epic.id} value={epic.id}>
              {epic.name}
            </option>
          ))}
        </Select>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button intent="ghost" size="sm" className="h-9 pointer-fine:h-8" onClick={onCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          intent="primary"
          size="sm"
          className="h-9 pointer-fine:h-8"
          onClick={handleSubmit}
          disabled={isCreating || !title.trim()}
        >
          {isCreating ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}