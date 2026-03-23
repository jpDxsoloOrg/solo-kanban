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
  const [subtasks, setSubtasks] = useState(initialSubtasks.sort((a, b) => a.order - b.order));
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const completed = subtasks.filter((s) => s.completed).length;

  const handleToggle = async (subtaskId: string, checked: boolean) => {
    // Optimistic update
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, completed: checked } : s))
    );

    try {
      await toggleSubtask(subtaskId, checked);
    } catch (error) {
      console.error("Failed to toggle subtask:", error);
      // Rollback
      setSubtasks((prev) =>
        prev.map((s) => (s.id === subtaskId ? { ...s, completed: !checked } : s))
      );
    }
  };

  const handleAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    setIsAdding(true);
    try {
      const created = await addSubtask(issueId, trimmed, subtasks.length);
      setSubtasks((prev) => [...prev, created]);
      setNewTitle("");
      inputRef.current?.focus();
    } catch (error) {
      console.error("Failed to add subtask:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (subtaskId: string) => {
    const previous = subtasks;
    setSubtasks((prev) => prev.filter((s) => s.id !== subtaskId));

    try {
      await deleteSubtask(subtaskId);
    } catch (error) {
      console.error("Failed to delete subtask:", error);
      setSubtasks(previous);
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
            className="flex items-center gap-2 group py-1 px-2 rounded hover:bg-muted"
          >
            <Checkbox
              checked={subtask.completed}
              onChange={(e) => handleToggle(subtask.id, e.target.checked)}
              label={subtask.title}
              className={subtask.completed ? "opacity-50" : ""}
            />
            <span className="flex-1" />
            <button
              onClick={() => handleDelete(subtask.id)}
              className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity text-xs"
              aria-label={`Delete subtask: ${subtask.title}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add subtask input */}
      <div className="flex items-center gap-2 mt-2">
        <Input
          ref={inputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a subtask..."
          disabled={isAdding}
        />
        <Button
          intent="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={isAdding || !newTitle.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}