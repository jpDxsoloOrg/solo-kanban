"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog, Button } from "@dxsolo/ui";
import type { Sprint } from "@prisma/client";
import { createIssue } from "@/actions/create-issue";
import { deleteSprint } from "@/actions/sprint-actions";
import { formatSprintRange } from "@/lib/sprint-dates";
import { DaysLeft } from "./DaysLeft";
import { IssueRow, type IssueRowIssue, type MoveTarget } from "./IssueRow";
import { SprintFormModal } from "./SprintFormModal";
import { StartSprintDialog } from "./StartSprintDialog";
import { chipClass, focusRingClass, pluralize, sprintStatusClass, sprintStatusLabel } from "./sprint-ui";

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

  const handleDelete = () => {
    const sprint = deleting;
    if (!sprint) return;
    setSprintError(null);
    startDelete(async () => {
      const result = await deleteSprint(sprint.id);
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
          </div>
          {backlogIssues.length > 0 ? (
            <ul className="divide-y divide-border">
              {backlogIssues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} projectId={projectId} moveTargets={moveTargets} />
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

interface SprintSectionProps {
  sprint: BacklogSprint;
  projectId: string;
  moveTargets: MoveTarget[];
  actions: React.ReactNode;
  emptyText: string;
  hint?: string;
  error?: string | null;
}

function SprintSection({ sprint, projectId, moveTargets, actions, emptyText, hint, error }: SprintSectionProps) {
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
            <IssueRow key={issue.id} issue={issue} projectId={projectId} moveTargets={moveTargets} />
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
