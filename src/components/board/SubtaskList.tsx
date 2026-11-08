"use client";

import { useState, useRef } from "react";
import type { Subtask } from "@prisma/client";
import { toggleSubtask, addSubtask, deleteSubtask } from "@/actions/subtask-actions";
import { Button, Checkbox, Input } from "@dxsolo/ui";

interface SubtaskListProps {
  issueId: string;
  subtasks: Subtask[];
}

export function SubtaskList({ issueId, subtasks: initialSubtasks }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState(() =>
    [...initialSubtasks].sort((a, b) => a.order - b.order)
  );
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const completed = subtasks.filter((s) => s.completed).length;

  const handleToggle = async (subtaskId: string, checked: boolean) => {
    // Optimistic update
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, completed: checked } : s))
    );
    setError(null);

    try {
      await toggleSubtask(subtaskId, checked);
    } catch (err) {
      console.error("Failed to toggle subtask:", err);
      // Rollback
      setSubtasks((prev) =>
        prev.map((s) => (s.id === subtaskId ? { ...s, completed: !checked } : s))
      );
      setError("Couldn't update the subtask. Please try again.");
    }
  };

  const handleAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    setIsAdding(true);
    setError(null);
    try {
      const created = await addSubtask(issueId, trimmed, subtasks.length);
      setSubtasks((prev) => [...prev, created]);
      setNewTitle("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Failed to add subtask:", err);
      setError("Couldn't add the subtask. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (subtaskId: string) => {
    const previous = subtasks;
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));
    setError(null);

    try {
      await deleteSubtask(subtaskId);
    } catch (err) {
      console.error("Failed to delete subtask:", err);
      setSubtasks(previous);
      setError("Couldn't delete the subtask. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      {/* Header with progress */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-foreground">Subtasks</h4>
        {subtasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {completed}/{subtasks.length} done
          </span>
        )}
      </div>

      {/* Progress bar */}
      {subtasks.length > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${(completed / subtasks.length) * 100}%` }}
          />
        </div>
      )}

      {/* Subtask items */}
      <div className="flex flex-col gap-1">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className="group -mx-2 flex min-h-10 items-center gap-2 rounded px-2 py-1 hover:bg-muted pointer-fine:min-h-8"
          >
            <div className="min-w-0 flex-1 wrap-anywhere">
              <Checkbox
                checked={subtask.completed}
                onChange={(e) => handleToggle(subtask.id, e.target.checked)}
                label={subtask.title}
                className={`shrink-0 ${subtask.completed ? "opacity-50" : ""}`}
              />
            </div>
            <button
              type="button"
              onClick={() => handleDelete(subtask.id)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-xs text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:h-7 pointer-fine:w-7 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              aria-label={`Delete subtask: ${subtask.title}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Add subtask input */}
      <div className="flex items-center gap-2 mt-2">
        <div className="min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a subtask..."
            aria-label="New subtask"
            disabled={isAdding}
          />
        </div>
        <Button
          intent="secondary"
          className="shrink-0"
          onClick={handleAdd}
          disabled={isAdding || !newTitle.trim()}
        >
          {isAdding ? "Adding..." : "Add"}
        </Button>
      </div>
    </div>
  );
}
