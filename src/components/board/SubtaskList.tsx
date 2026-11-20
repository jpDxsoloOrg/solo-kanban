"use client";

import { useState, useRef, useMemo } from "react";
import type { Subtask } from "@prisma/client";
import {
  toggleSubtask,
  addSubtask,
  deleteSubtask,
  updateSubtaskDescription,
} from "@/actions/subtask-actions";
import { Button, Checkbox, Input, Textarea } from "@dxsolo/ui";
import { MarkdownPreview } from "./MarkdownPreview";
import { holdLiveRefresh } from "@/components/live/live-refresh-hold";
import { useServerState } from "@/components/live/useServerState";

interface SubtaskListProps {
  issueId: string;
  subtasks: Subtask[];
  /** Section heading. */
  heading?: string;
  /** Show the "Add a subtask" form (off for the legacy checklist). */
  allowAdd?: boolean;
}

/**
 * The legacy checklist. Subtasks are now child issues (ChildIssueList);
 * existing checklist items show here until they are converted.
 */
export function SubtaskList({
  issueId,
  subtasks: serverSubtasks,
  heading = "Subtasks",
  allowAdd = true,
}: SubtaskListProps) {
  const sortedServerSubtasks = useMemo(
    () => [...serverSubtasks].sort((a, b) => a.order - b.order),
    [serverSubtasks]
  );
  // Number of add/toggle/delete requests still saving.
  const [saving, setSaving] = useState(0);
  // Follows refreshed server data (live updates from other tabs/devices),
  // except while one of this list's own changes is saving.
  const [subtasks, setSubtasks, skipPendingServerSubtasks] = useServerState(
    sortedServerSubtasks,
    saving > 0
  );
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [showNewDescription, setShowNewDescription] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const completed = subtasks.filter((s) => s.completed).length;

  /**
   * Runs one of this list's saves. Until it's done, live refreshes wait and
   * server data that arrives anyway is set aside: it may predate the save.
   */
  const trackSave = async <T,>(request: () => Promise<T>): Promise<T> => {
    setSaving((n) => n + 1);
    const releaseLiveRefresh = holdLiveRefresh();
    try {
      const result = await request();
      skipPendingServerSubtasks();
      return result;
    } finally {
      setSaving((n) => n - 1);
      releaseLiveRefresh();
    }
  };

  const handleToggle = async (subtaskId: string, checked: boolean) => {
    // Optimistic update
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, completed: checked } : s))
    );
    setError(null);

    try {
      await trackSave(() => toggleSubtask(subtaskId, checked));
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
      const description = showNewDescription ? newDescription : null;
      const created = await trackSave(() =>
        addSubtask(issueId, trimmed, subtasks.length, description)
      );
      setSubtasks((prev) => (prev.some((s) => s.id === created.id) ? prev : [...prev, created]));
      setNewTitle("");
      setNewDescription("");
      setShowNewDescription(false);
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
      await trackSave(() => deleteSubtask(subtaskId));
    } catch (err) {
      console.error("Failed to delete subtask:", err);
      setSubtasks(previous);
      setError("Couldn't delete the subtask. Please try again.");
    }
  };

  /** Saves a subtask's description; resolves false (and shows an error) on failure. */
  const handleSaveDescription = async (subtaskId: string, description: string) => {
    setError(null);
    try {
      const updated = await trackSave(() => updateSubtaskDescription(subtaskId, description));
      setSubtasks((prev) =>
        prev.map((s) => (s.id === subtaskId ? { ...s, description: updated.description } : s))
      );
      return true;
    } catch (err) {
      console.error("Failed to save subtask description:", err);
      setError("Couldn't save the description. Please try again.");
      return false;
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
        <h4 className="text-sm font-medium text-foreground">{heading}</h4>
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
          <SubtaskItem
            key={subtask.id}
            subtask={subtask}
            onToggle={(checked) => handleToggle(subtask.id, checked)}
            onDelete={() => handleDelete(subtask.id)}
            onSaveDescription={(description) => handleSaveDescription(subtask.id, description)}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Add subtask input */}
      {allowAdd && (
      <>
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
      {showNewDescription ? (
        <Textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Description (optional, supports markdown)"
          aria-label="New subtask description"
          disabled={isAdding}
          maxLength={MAX_DESCRIPTION_LENGTH}
          className="mt-2 min-h-[96px] font-mono"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNewDescription(true)}
          className="mt-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          + Add a description
        </button>
      )}
      </>
      )}
    </div>
  );
}

/** Same cap as the server (MAX_SUBTASK_DESCRIPTION_LENGTH). */
const MAX_DESCRIPTION_LENGTH = 20_000;

interface SubtaskItemProps {
  subtask: Subtask;
  onToggle: (checked: boolean) => void;
  onDelete: () => void;
  /** Resolves true once saved. */
  onSaveDescription: (description: string) => Promise<boolean>;
}

/**
 * One checklist row. The title stays short; a subtask with a description
 * shows a quiet notes icon, and opening the row shows the description as
 * markdown with an editor.
 */
function SubtaskItem({ subtask, onToggle, onDelete, onSaveDescription }: SubtaskItemProps) {
  const hasDescription = Boolean(subtask.description);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const startEditing = () => {
    setDraft(subtask.description ?? "");
    setEditing(true);
  };

  const handleToggleOpen = () => {
    if (open) {
      setOpen(false);
      setEditing(false);
      return;
    }
    setOpen(true);
    // Nothing to read yet: go straight to writing one.
    if (!hasDescription) startEditing();
  };

  const handleSave = async () => {
    setSavingDescription(true);
    const saved = await onSaveDescription(draft);
    setSavingDescription(false);
    if (!saved) return;
    setEditing(false);
    if (!draft.trim()) setOpen(false);
  };

  const handleCancel = () => {
    setEditing(false);
    if (!hasDescription) setOpen(false);
  };

  const panelId = `subtask-description-${subtask.id}`;

  return (
    <div>
      <div className="group -mx-2 flex min-h-10 items-center gap-2 rounded px-2 py-1 hover:bg-muted pointer-fine:min-h-8">
        <div className="min-w-0 flex-1 wrap-anywhere">
          <Checkbox
            checked={subtask.completed}
            onChange={(e) => onToggle(e.target.checked)}
            label={subtask.title}
            className={`shrink-0 ${subtask.completed ? "opacity-50" : ""}`}
          />
        </div>
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          title={hasDescription ? (open ? "Hide description" : "Show description") : "Add a description"}
          aria-label={`${hasDescription ? (open ? "Hide" : "Show") : "Add"} description: ${subtask.title}`}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:h-7 pointer-fine:w-7 ${
            hasDescription || open
              ? subtask.completed
                ? "opacity-50"
                : "opacity-70"
              : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {hasDescription ? (
              <path d="M3 4h10M3 8h10M3 12h6" />
            ) : (
              <path d="M8 3.5v9M3.5 8h9" />
            )}
          </svg>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-xs text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:h-7 pointer-fine:w-7 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          aria-label={`Delete subtask: ${subtask.title}`}
        >
          ✕
        </button>
      </div>

      {open && (
        <div id={panelId} className="mb-2 ml-6 mt-1 border-l-2 border-border pl-3">
          {editing ? (
            <div className="flex flex-col gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    handleCancel();
                  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleSave();
                  }
                }}
                placeholder="Add a description... (supports markdown)"
                aria-label={`Description for ${subtask.title}`}
                disabled={savingDescription}
                maxLength={MAX_DESCRIPTION_LENGTH}
                autoFocus
                className="min-h-[120px] font-mono"
              />
              <div className="flex justify-end gap-2">
                <Button intent="ghost" size="sm" onClick={handleCancel} disabled={savingDescription}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSave()} disabled={savingDescription}>
                  {savingDescription ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {subtask.description ? (
                <MarkdownPreview content={subtask.description} />
              ) : (
                <p className="text-sm text-muted-foreground">No description</p>
              )}
              <div>
                <button
                  type="button"
                  onClick={startEditing}
                  className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Edit description
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
