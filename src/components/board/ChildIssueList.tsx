"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@dxsolo/ui";
import type { ChildIssueSummary } from "@/types";
import {
  createChildIssue,
  reorderChildIssue,
  setChildIssueDone,
} from "@/actions/child-issue-actions";
import { holdLiveRefresh } from "@/components/live/live-refresh-hold";
import { useServerState } from "@/components/live/useServerState";
import {
  chipClass,
  issueStatusClass,
  issueStatusLabel,
  priorityClass,
  priorityLabel,
} from "@/components/sprints/sprint-ui";
import { STATUS_LABELS } from "./columns";
import { MAX_ISSUE_TITLE_LENGTH } from "@/lib/limits";

interface ChildIssueListProps {
  /** The parent issue. */
  parentId: string;
  projectId: string;
  /** Its child issues (subtasks). */
  childIssues: ChildIssueSummary[];
}

const sortChildren = (list: ChildIssueSummary[]) =>
  [...list].sort((a, b) => a.childOrder - b.childOrder || a.number - b.number);

/**
 * The "Subtasks" section of an issue: its child issues, each a full issue
 * of its own. Tick one to mark it done (or open again), open it to see
 * everything, reorder with the arrows, or add a new one by title.
 */
export function ChildIssueList({ parentId, projectId, childIssues }: ChildIssueListProps) {
  const router = useRouter();
  const sortedServerChildren = useMemo(() => sortChildren(childIssues), [childIssues]);
  const [saving, setSaving] = useState(0);
  // Follows refreshed server data, except while one of its own changes saves.
  const [children, setChildren, skipPendingServerChildren] = useServerState(
    sortedServerChildren,
    saving > 0
  );
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; number?: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const done = children.filter((child) => child.status === "DONE").length;

  /** Runs one save; live refreshes wait until it's done (see SubtaskList). */
  const trackSave = async <T,>(request: () => Promise<T>): Promise<T> => {
    setSaving((n) => n + 1);
    const releaseLiveRefresh = holdLiveRefresh();
    try {
      const result = await request();
      skipPendingServerChildren();
      return result;
    } finally {
      setSaving((n) => n - 1);
      releaseLiveRefresh();
    }
  };

  const handleToggle = async (child: ChildIssueSummary, checked: boolean) => {
    const previous = children;
    setChildren((prev) =>
      prev.map((c) => (c.id === child.id ? { ...c, status: checked ? "DONE" : "OPEN" } : c))
    );
    setError(null);
    setNotice(null);
    try {
      const result = await trackSave(() => setChildIssueDone(child.id, checked));
      if (!result.ok) throw new Error(result.error);
      const moved = result.data.autoMoves.find((move) => move.parentId === parentId);
      if (moved) setNotice({ text: `All set: this issue moved to ${STATUS_LABELS[moved.to]}.` });
      // The parent's own status may have changed.
      router.refresh();
    } catch (err) {
      console.error("Failed to update subtask:", err);
      setChildren(previous);
      setError("Couldn't update the subtask. Please try again.");
    }
  };

  const handleMove = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= children.length) return;
    const previous = children;
    const next = [...children];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setChildren(next.map((child, position) => ({ ...child, childOrder: position })));
    setError(null);
    try {
      const result = await trackSave(() => reorderChildIssue(moved.id, target));
      if (!result.ok) throw new Error(result.error);
      // Keep focus on the arrow that was pressed, now on the moved row.
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-child-move="${moved.id}:${delta}"]:not(:disabled)`)
          ?.focus();
      });
    } catch (err) {
      console.error("Failed to reorder subtask:", err);
      setChildren(previous);
      setError("Couldn't reorder the subtasks. Please try again.");
    }
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || isAdding) return;
    setIsAdding(true);
    setError(null);
    setNotice(null);
    try {
      const result = await trackSave(() => createChildIssue(parentId, title));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const child = result.data;
      setChildren((prev) => (prev.some((c) => c.id === child.id) ? prev : [...prev, child]));
      setNewTitle("");
      setNotice({ text: `Added #${child.number}.`, number: child.number });
      inputRef.current?.focus();
    } catch (err) {
      console.error("Failed to add subtask:", err);
      setError("Couldn't add the subtask. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section aria-labelledby={`subtasks-${parentId}`}>
      <div className="mb-2 flex items-center justify-between">
        <h4 id={`subtasks-${parentId}`} className="text-sm font-medium text-foreground">
          Subtasks
        </h4>
        {children.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {done}/{children.length} done
          </span>
        )}
      </div>

      {children.length > 0 && (
        <div
          className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Subtasks done"
          aria-valuemin={0}
          aria-valuemax={children.length}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-300"
            style={{ width: `${(done / children.length) * 100}%` }}
          />
        </div>
      )}

      {children.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {children.map((child, index) => {
            const isDone = child.status === "DONE";
            return (
              <li key={child.id} className="group flex min-h-11 items-center gap-2 px-2 py-1.5 pointer-fine:min-h-9">
                <label className="-my-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center pointer-fine:h-7 pointer-fine:w-7">
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={(e) => void handleToggle(child, e.target.checked)}
                    aria-label={`Done: #${child.number} ${child.title}`}
                    className="h-4 w-4 cursor-pointer accent-[var(--color-primary)] dark:[color-scheme:dark]"
                  />
                </label>
                <Link
                  href={`/projects/${projectId}/issues/${child.number}`}
                  className={`min-w-0 flex-1 rounded-sm py-0.5 text-sm [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isDone ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  <span className="font-normal text-muted-foreground">#{child.number}</span>{" "}
                  {child.title}
                </Link>
                <span className={`${chipClass} hidden shrink-0 sm:inline-flex ${priorityClass[child.priority]}`}>
                  {priorityLabel[child.priority]}
                </span>
                <span className={`${chipClass} shrink-0 ${issueStatusClass[child.status]}`}>
                  {issueStatusLabel[child.status]}
                </span>
                <span className="flex shrink-0 items-center [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                  <MoveButton
                    label={`Move #${child.number} up`}
                    dataKey={`${child.id}:-1`}
                    disabled={index === 0}
                    onClick={() => void handleMove(index, -1)}
                    path="M4 10l4-4 4 4"
                  />
                  <MoveButton
                    label={`Move #${child.number} down`}
                    dataKey={`${child.id}:1`}
                    disabled={index === children.length - 1}
                    onClick={() => void handleMove(index, 1)}
                    path="M4 6l4 4 4-4"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <p aria-live="polite" className="mt-2 text-xs text-muted-foreground empty:hidden">
        {notice && (
          <>
            {notice.text}{" "}
            {notice.number !== undefined && (
              <Link
                href={`/projects/${projectId}/issues/${notice.number}`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Open #{notice.number} to add details
              </Link>
            )}
          </>
        )}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder="Add a subtask..."
            aria-label="New subtask title"
            maxLength={MAX_ISSUE_TITLE_LENGTH}
            disabled={isAdding}
          />
        </div>
        <Button
          intent="secondary"
          className="shrink-0"
          onClick={() => void handleAdd()}
          disabled={isAdding || !newTitle.trim()}
        >
          {isAdding ? "Adding..." : "Add"}
        </Button>
      </div>
    </section>
  );
}

function MoveButton({
  label,
  dataKey,
  disabled,
  onClick,
  path,
}: {
  label: string;
  dataKey: string;
  disabled: boolean;
  onClick: () => void;
  path: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-child-move={dataKey}
      className="inline-flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 pointer-fine:h-7 pointer-fine:w-7"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}
