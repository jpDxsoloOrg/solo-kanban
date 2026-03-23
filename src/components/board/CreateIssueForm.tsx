"use client";

import { useState, useRef, useEffect } from "react";
import { Input, Button, Select } from "@dxsolo/ui";
import type { IssueStatus, Epic } from "@prisma/client";
import { createIssue } from "@/actions/create-issue";
import type { IssueWithRelations } from "@/types";

interface CreateIssueFormProps {
  projectId: string;
  status: IssueStatus;
  epics: Epic[];
  onCreated: (issue: IssueWithRelations) => void;
  onCancel: () => void;
}

export function CreateIssueForm({
  projectId,
  status,
  epics,
  onCreated,
  onCancel,
}: CreateIssueFormProps) {
  const [title, setTitle] = useState("");
  const [epicId, setEpicId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setIsCreating(true);
    try {
      const issue = await createIssue(projectId, trimmed, status, epicId || undefined);
      onCreated(issue);
      setTitle("");
      setEpicId("");
    } catch (error) {
      console.error("Failed to create issue:", error);
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
        disabled={isCreating}
      />
      {epics.length > 0 && (
        <Select
          value={epicId}
          onChange={(e) => setEpicId(e.target.value)}
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
      <div className="flex justify-end gap-2">
        <Button intent="ghost" size="sm" onClick={onCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          intent="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={isCreating || !title.trim()}
        >
          {isCreating ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}