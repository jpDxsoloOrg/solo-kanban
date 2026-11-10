"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog, Button } from "@dxsolo/ui";
import type { Sprint } from "@prisma/client";
import { createIssue } from "@/actions/create-issue";
import { deleteSprint, moveIssuesToSprintBulk } from "@/actions/sprint-actions";
import { formatSprintRange } from "@/lib/sprint-dates";
import { DaysLeft } from "./DaysLeft";
import { IssueRow, type IssueRowIssue, type MoveTarget } from "./IssueRow";
import { SprintFormModal } from "./SprintFormModal";
import { StartSprintDialog } from "./StartSprintDialog";
import {
  chipClass,
  focusRingClass,
  nativeSelectClass,
  pluralize,
  sprintStatusClass,
  sprintStatusLabel,
} from "./sprint-ui";

export type BacklogSprint = Sprint & { issues: IssueRowIssue[] };

export interface BacklogViewProps {
  projectId: string;
  activeSprint: BacklogSprint | null;
  /** Planned sprints, oldest first, with their issues. */
  plannedSprints: BacklogSprint[];
  /** Unplanned issues (sprintId = null). */
  backlogIssues: IssueRowIssue[];
}

/**
 * Sprint planning: the active sprint, each planned sprint and the backlog,
 * with per-issue "Move to" controls and planned-sprint actions.
 */
export function BacklogView({ projectId, activeSprint, plannedSprints, backlogIssues }: BacklogViewProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [starting, setStarting] = useState<BacklogSprint | null>(null);
  const [deleting, setDeleting] = useState<BacklogSprint | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [sprintError, setSprintError] = useState<{ sprintId: string; message: string } | null>(null);

  const moveTargets: MoveTarget[] = [
    ...(activeSprint ? [activeSprint] : []),
    ...plannedSprints,
  ].map(({ id, name, status }) => ({ id, name, status }));

  // Bulk selection. Ids that no longer exist (moved into history, deleted
  // elsewhere) are ignored rather than pruned, so a refresh can't clear it.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const allIssues = [
    ...(activeSprint?.issues ?? []),
    ...plannedSprints.flatMap((sprint) => sprint.issues),
    ...backlogIssues,
  ];
  const selected = allIssues.filter((issue) => selectedIds.has(issue.id));
  const setIssuesSelected = (ids: string[], on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const selection: SelectionProps = {
    selectedIds,
    onSelectedChange: (id, on) => setIssuesSelected([id], on),
    onSelectAll: setIssuesSelected,
  };

  const handleDelete = () => {
    const sprint = deleting;
    if (!sprint) return;
    setSprintError(null);
    startDelete(async () => {
      let result: Awaited<ReturnType<typeof deleteSprint>>;
      try {
        result = await deleteSprint(sprint.id);
      } catch (err) {
        // Offline, server down, or a stale tab after a deploy. Thrown out of
        // the transition it would replace the page with the error screen.
        console.error("Failed to delete sprint:", err);
        result = { ok: false, error: "Couldn't delete the sprint. Check your connection and try again." };
      }
      if (!result.ok) {
        setDeleting(null);
        setSprintError({ sprintId: sprint.id, message: result.error });
        return;
      }
      // Close the confirmation once the refreshed list has rendered.
      startDelete(() => {
        router.refresh();
        setDeleting(null);
      });
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 pb-16 pt-2 sm:px-6">
        <header>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-foreground">Backlog</h1>
            <Button intent="primary" onClick={() => setCreating(true)}>
              New sprint
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan upcoming sprints and park work for later.
          </p>
        </header>

        {activeSprint ? (
          <SprintSection
            sprint={activeSprint}
            projectId={projectId}
            moveTargets={moveTargets}
            selection={selection}
            actions={
              <Link
                href={`/projects/${projectId}/board`}
                className={`inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted sm:h-8 ${focusRingClass}`}
              >
                Open board
              </Link>
            }
            emptyText="No issues in this sprint yet."
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            No sprint is active.{" "}
            {plannedSprints.length > 0
              ? "Start a planned sprint below to put it on the board."
              : "Create a sprint to start planning."}
          </p>
        )}

        {plannedSprints.map((sprint) => (
          <SprintSection
            key={sprint.id}
            sprint={sprint}
            projectId={projectId}
            moveTargets={moveTargets}
            selection={selection}
            error={sprintError?.sprintId === sprint.id ? sprintError.message : null}
            hint={
              activeSprint
                ? `Complete ${activeSprint.name} before starting another sprint.`
                : undefined
            }
            actions={
              <>
                <Button
                  intent="secondary"
                  size="sm"
                  className="h-9 sm:h-8"
                  disabled={!!activeSprint}
                  onClick={() => setStarting(sprint)}
                  aria-label={`Start ${sprint.name}`}
                >
                  Start
                </Button>
                <Button
                  intent="ghost"
                  size="sm"
                  className="h-9 sm:h-8"
                  onClick={() => setEditing(sprint)}
                  aria-label={`Edit ${sprint.name}`}
                >
                  Edit
                </Button>
                <Button
                  intent="ghost"
                  size="sm"
                  className="h-9 text-destructive hover:bg-destructive/10 sm:h-8"
                  onClick={() => setDeleting(sprint)}
                  aria-label={`Delete ${sprint.name}`}
                >
                  Delete
                </Button>
              </>
            }
            emptyText="No issues planned yet. Use “Move to…” on a backlog issue to add one."
          />
        ))}

        <section
          aria-labelledby="backlog-heading"
          className="overflow-hidden rounded-lg border border-border bg-background"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-3 sm:px-4">
            <h2 id="backlog-heading" className="text-base font-semibold text-foreground">
              Backlog
            </h2>
            <span className="text-xs text-muted-foreground">
              {pluralize(backlogIssues.length, "issue")}
            </span>
            <SelectAll issues={backlogIssues} selection={selection} label="Backlog" />
          </div>
          {backlogIssues.length > 0 ? (
            <ul className="divide-y divide-border">
              {backlogIssues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  projectId={projectId}
                  moveTargets={moveTargets}
                  selected={selectedIds.has(issue.id)}
                  onSelectedChange={selection.onSelectedChange}
                />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              The backlog is empty. Add ideas here and plan them into a sprint later.
            </p>
          )}
          <AddBacklogIssue projectId={projectId} />
        </section>
      </div>

      {selected.length > 0 && (
        <BulkMoveBar
          projectId={projectId}
          selected={selected}
          moveTargets={moveTargets}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <SprintFormModal open={creating} onClose={() => setCreating(false)} projectId={projectId} />
      <SprintFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        projectId={projectId}
        sprint={editing}
      />
      <StartSprintDialog
        open={starting !== null}
        onClose={() => setStarting(null)}
        projectId={projectId}
        sprint={starting && { ...starting, _count: { issues: starting.issues.length } }}
      />
      <AlertDialog
        open={deleting !== null}
        onClose={() => {
          if (!isDeleting) setDeleting(null);
        }}
        onConfirm={handleDelete}
        title={deleting ? `Delete ${deleting.name}?` : "Delete sprint?"}
        description={
          deleting && deleting.issues.length > 0
            ? `Its ${pluralize(deleting.issues.length, "issue")} will go back to the backlog. This can't be undone.`
            : "This sprint has no issues. This can't be undone."
        }
        confirmLabel="Delete sprint"
        loading={isDeleting}
        className="w-[calc(100%-2rem)]"
      />
    </div>
  );
}

interface SelectionProps {
  selectedIds: ReadonlySet<string>;
  onSelectedChange: (issueId: string, selected: boolean) => void;
  onSelectAll: (issueIds: string[], selected: boolean) => void;
}

/** "Select all" for one section; hidden when the section is empty. */
function SelectAll({
  issues,
  selection,
  label,
}: {
  issues: IssueRowIssue[];
  selection: SelectionProps;
  label: string;
}) {
  if (issues.length === 0) return null;
  const count = issues.filter((issue) => selection.selectedIds.has(issue.id)).length;
  const all = count === issues.length;
  return (
    <label className="ml-auto inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground sm:h-8">
      <input
        type="checkbox"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = count > 0 && !all;
        }}
        onChange={(e) => selection.onSelectAll(issues.map((issue) => issue.id), e.target.checked)}
        aria-label={`Select all issues in ${label}`}
        className="h-4 w-4 cursor-pointer accent-[var(--color-primary)] dark:[color-scheme:dark]"
      />
      Select all
    </label>
  );
}

const BULK_BACKLOG = "__backlog__";

/** Sticky bar that moves every selected issue to one sprint or the backlog. */
function BulkMoveBar({
  projectId,
  selected,
  moveTargets,
  onClear,
}: {
  projectId: string;
  selected: IssueRowIssue[];
  moveTargets: MoveTarget[];
  onClear: () => void;
}) {
  const router = useRouter();
  const selectId = useId();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = [
    { value: BULK_BACKLOG, label: "Backlog" },
    ...moveTargets.map((target) => ({
      value: target.id,
      label: `${target.name}${target.status === "ACTIVE" ? " (active)" : ""}`,
    })),
  ];
  // A refresh may have removed the picked sprint.
  const chosen = options.find((option) => option.value === choice);

  const handleMove = () => {
    if (!chosen || isPending) return;
    const sprintId = chosen.value === BULK_BACKLOG ? null : chosen.value;
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof moveIssuesToSprintBulk>>;
      try {
        result = await moveIssuesToSprintBulk(projectId, selected.map((issue) => issue.id), sprintId);
      } catch (err) {
        console.error("Failed to move issues:", err);
        result = { ok: false, error: "Couldn't move the issues. Check your connection and try again." };
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Clear the selection as the rows land in their new section.
      startTransition(() => {
        router.refresh();
        onClear();
      });
    });
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgb(0_0_0/0.08)] backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-medium text-foreground" aria-live="polite">
          {selected.length} selected
        </p>
        <label htmlFor={selectId} className="sr-only">
          Move selected issues to
        </label>
        <select
          id={selectId}
          value={chosen?.value ?? ""}
          onChange={(e) => {
            setChoice(e.target.value);
            setError(null);
          }}
          disabled={isPending}
          className={`${nativeSelectClass} h-9 min-w-0 flex-1 pl-2 pr-1 text-sm sm:max-w-56`}
        >
          <option value="">Move to…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          intent="primary"
          size="sm"
          className="h-9"
          disabled={!chosen || isPending}
          onClick={handleMove}
        >
          {isPending ? "Moving…" : `Move ${selected.length}`}
        </Button>
        <Button intent="ghost" size="sm" className="h-9" disabled={isPending} onClick={onClear}>
          Clear
        </Button>
      </div>
      {error && (
        <p role="alert" className="mx-auto mt-2 max-w-4xl text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface SprintSectionProps {
  sprint: BacklogSprint;
  projectId: string;
  moveTargets: MoveTarget[];
  selection: SelectionProps;
  actions: React.ReactNode;
  emptyText: string;
  hint?: string;
  error?: string | null;
}

function SprintSection({
  sprint,
  projectId,
  moveTargets,
  selection,
  actions,
  emptyText,
  hint,
  error,
}: SprintSectionProps) {
  const headingId = `sprint-${sprint.id}-heading`;
  const range = formatSprintRange(sprint.startDate, sprint.endDate);
  const isActive = sprint.status === "ACTIVE";

  return (
    <section
      aria-labelledby={headingId}
      className={`overflow-hidden rounded-lg border bg-background ${
        isActive ? "border-primary/40" : "border-border"
      }`}
    >
      <div className="flex flex-col gap-2 border-b border-border bg-muted/40 px-3 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={headingId} className="text-base font-semibold text-foreground [overflow-wrap:anywhere]">
              <Link
                href={`/projects/${projectId}/sprints/${sprint.id}`}
                className={`rounded hover:underline ${focusRingClass}`}
              >
                {sprint.name}
              </Link>
            </h2>
            <span className={`${chipClass} rounded-full ${sprintStatusClass[sprint.status]}`}>
              {sprintStatusLabel[sprint.status]}
            </span>
            <span className="text-xs text-muted-foreground">{pluralize(sprint.issues.length, "issue")}</span>
            <SelectAll issues={sprint.issues} selection={selection} label={sprint.name} />
          </div>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            <span>{range || "No dates set"}</span>
            {isActive && <DaysLeft endDate={sprint.endDate} />}
          </p>
          {sprint.goal && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {sprint.goal}
            </p>
          )}
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
      </div>

      {error && (
        <p role="alert" className="border-b border-border px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {sprint.issues.length > 0 ? (
        <ul className="divide-y divide-border">
          {sprint.issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              projectId={projectId}
              moveTargets={moveTargets}
              selected={selection.selectedIds.has(issue.id)}
              onSelectedChange={selection.onSelectedChange}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-center text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}

function AddBacklogIssue({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isPending) return;

    setError(null);
    startTransition(async () => {
      try {
        await createIssue({ projectId, title: trimmed, sprintId: null });
        // Clear the field as the new row appears.
        startTransition(() => {
          router.refresh();
          setTitle("");
        });
      } catch (err) {
        console.error("Failed to create issue:", err);
        setError("Couldn't add the issue. Please try again.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-muted/20 px-3 py-3 sm:px-4">
      <label htmlFor="backlog-new-issue" className="sr-only">
        New backlog issue title
      </label>
      <div className="flex gap-2">
        <input
          id="backlog-new-issue"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add an issue to the backlog…"
          // readOnly (not disabled) keeps focus, so several issues can be added in a row.
          readOnly={isPending}
          aria-busy={isPending}
          autoComplete="off"
          enterKeyHint="done"
          className="h-10 min-w-0 flex-1 rounded-md border border-input-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background read-only:opacity-70"
        />
        <Button type="submit" intent="primary" disabled={isPending || !title.trim()}>
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
