"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { IssueStatus } from "@prisma/client";
import type { Epic, Sprint } from "@prisma/client";
import { Column } from "./Column";
import type { IssueWithRelations, SprintWithCounts } from "@/types";
import { SprintHeader } from "@/components/sprints/SprintHeader";
import { moveIssue } from "@/actions/move-issue";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { BOARD_COLUMNS, STATUS_DOT_CLASSES, STATUS_LABELS, columnDomId } from "./columns";
import { holdLiveRefresh } from "@/components/live/live-refresh-hold";
import { useServerState } from "@/components/live/useServerState";

const COLUMNS = BOARD_COLUMNS;

/**
 * The status tab picked on phones, per sprint, so coming back to the board
 * (a client-side navigation remounts it) keeps the user on the column they
 * were looking at. It is only written from event handlers, so server render
 * and hydration always start on "Open".
 */
const lastActiveStatus = new Map<string, IssueStatus>();

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  /** Column the toast's "Show" action switches to (phones). */
  status?: IssueStatus;
}

interface BoardProps {
  /** Every issue in the active sprint (unfiltered). */
  issues: IssueWithRelations[];
  projectId: string;
  epics: Epic[];
  /** Epic id from the ?epic= filter; applied here so sprint stats stay whole. */
  epicFilter: string | null;
  /** The active sprint this board shows. */
  sprint: Sprint;
  /** Planned sprints, offered as roll-over targets when completing the sprint. */
  plannedSprints: SprintWithCounts[];
}

export function Board({
  issues: initialIssues,
  projectId,
  epics,
  epicFilter,
  sprint,
  plannedSprints,
}: BoardProps) {
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);
  // Follows refreshed server data (live updates from other tabs/devices,
  // revalidation), except while an optimistic move is saving.
  const [issues, setIssues, skipPendingServerIssues] = useServerState(initialIssues, isMoving);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCreateInOpen, setShowCreateInOpen] = useState(false);
  const [activeStatus, setActiveStatusState] = useState<IssueStatus>(
    () => lastActiveStatus.get(sprint.id) ?? "OPEN"
  );
  const [toast, setToast] = useState<Toast | null>(null);

  const setActiveStatus = useCallback(
    (status: IssueStatus) => {
      lastActiveStatus.set(sprint.id, status);
      setActiveStatusState(status);
    },
    [sprint.id]
  );

  const showToast = useCallback((next: Omit<Toast, "id">) => {
    setToast({ ...next, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), toast.tone === "error" ? 6000 : 4000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const shortcuts = useMemo(
    () => [
      {
        key: "?",
        shift: true,
        handler: () => setShowShortcuts(true),
      },
      {
        key: "Escape",
        handler: () => {
          if (showShortcuts) setShowShortcuts(false);
        },
        ignoreInputs: false,
      },
      {
        key: "n",
        handler: () => {
          // On phones only the selected column is visible.
          setActiveStatus("OPEN");
          setShowCreateInOpen(true);
        },
      },
    ],
    [showShortcuts, setActiveStatus]
  );
  useKeyboardShortcuts(shortcuts);

  const handleSelectIssue = useCallback(
    (issue: IssueWithRelations) => {
      router.push(`/projects/${projectId}/issues/${issue.number}`);
    },
    [router, projectId]
  );

  /** Optimistically moves a card; resolves false if nothing was saved. */
  const handleMoveIssue = useCallback(
    async (issueId: string, newStatus: IssueStatus, newOrder: number): Promise<boolean> => {
      if (isMoving) return false;
      setIsMoving(true);
      // No live refresh until the move is saved: it would show the card's
      // old position for a moment.
      const releaseLiveRefresh = holdLiveRefresh();

      const previousIssues = issues;

      setIssues((prev) => {
        const issue = prev.find((i) => i.id === issueId);
        if (!issue) return prev;

        const without = prev.filter((i) => i.id !== issueId);
        const targetColumnIssues = without
          .filter((i) => i.status === newStatus)
          .sort((a, b) => a.order - b.order);

        const clampedOrder = Math.min(newOrder, targetColumnIssues.length);

        targetColumnIssues.splice(clampedOrder, 0, {
          ...issue,
          status: newStatus,
          order: clampedOrder,
        });

        const reindexed = targetColumnIssues.map((item, index) => ({
          ...item,
          order: index,
        }));

        const otherIssues = without.filter((i) => i.status !== newStatus);
        return [...otherIssues, ...reindexed];
      });

      try {
        await moveIssue(issueId, newStatus, newOrder);
        // Server data that arrived while saving may predate the move; the
        // next live refresh brings the saved positions.
        skipPendingServerIssues();
        return true;
      } catch (error) {
        console.error("Failed to move issue:", error);
        setIssues(previousIssues);
        const issue = previousIssues.find((i) => i.id === issueId);
        showToast({
          tone: "error",
          message: `Couldn't move ${issue ? `#${issue.number}` : "the issue"}. Please try again.`,
        });
        return false;
      } finally {
        setIsMoving(false);
        releaseLiveRefresh();
      }
    },
    [issues, isMoving, setIssues, skipPendingServerIssues, showToast]
  );

  /** "Move" menu: append the card to the end of another column. */
  const handleMoveToStatus = useCallback(
    async (issueId: string, status: IssueStatus) => {
      const issue = issues.find((i) => i.id === issueId);
      if (!issue || issue.status === status || isMoving) return;

      // End of the whole column, ignoring the epic filter.
      const order = issues.filter((i) => i.status === status).length;
      const saved = handleMoveIssue(issueId, status, order);

      showToast({
        tone: "info",
        message: `Moved #${issue.number} to ${STATUS_LABELS[status]}`,
        status,
      });

      // Keep keyboard focus on the moved card when its column is visible,
      // otherwise on the tab of the column it went to (phones).
      requestAnimationFrame(() => {
        const trigger = document.querySelector<HTMLElement>(
          `[data-move-trigger="${issueId}"]`
        );
        if (trigger && trigger.getClientRects().length > 0) trigger.focus();
        else document.getElementById(`board-tab-${status}`)?.focus();
      });

      await saved;
    },
    [issues, isMoving, handleMoveIssue, showToast]
  );

  const handleIssueCreated = useCallback(
    (issue: IssueWithRelations) => {
      // The revalidated board data may already include it.
      setIssues((prev) => (prev.some((i) => i.id === issue.id) ? prev : [...prev, issue]));
    },
    [setIssues]
  );

  const issuesByStatus = COLUMNS.map((col) => {
    const columnIssues = issues
      .filter((issue) => issue.status === col.status)
      .sort((a, b) => a.order - b.order);
    return {
      ...col,
      totalCount: columnIssues.length,
      issues: epicFilter
        ? columnIssues.filter((issue) => issue.epicId === epicFilter)
        : columnIssues,
    };
  });

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const index = COLUMNS.findIndex((col) => col.status === activeStatus);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % COLUMNS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + COLUMNS.length) % COLUMNS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = COLUMNS.length - 1;
    else return;

    e.preventDefault();
    const status = COLUMNS[next].status;
    setActiveStatus(status);
    document.getElementById(`board-tab-${status}`)?.focus();
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <SprintHeader
        sprint={sprint}
        issues={issues}
        projectId={projectId}
        plannedSprints={plannedSprints}
      />

      {/* Phones: one column at a time, picked from a segmented tab bar */}
      <div className="shrink-0 px-3 pt-3 md:hidden">
        <div
          role="tablist"
          aria-label="Board columns"
          onKeyDown={handleTabKeyDown}
          className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none]"
        >
          {issuesByStatus.map((col) => {
            const selected = col.status === activeStatus;
            return (
              <button
                key={col.status}
                id={`board-tab-${col.status}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={columnDomId(col.status)}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveStatus(col.status)}
                className={`flex h-9 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`hidden h-1.5 w-1.5 shrink-0 rounded-full min-[400px]:inline-block ${STATUS_DOT_CLASSES[col.status]}`}
                />
                {col.label}
                <span
                  className={`tabular-nums ${selected ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {col.issues.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3 md:overflow-x-auto md:p-4">
        <div className="h-full md:grid md:grid-cols-4 md:gap-4 md:min-w-[800px]">
          {issuesByStatus.map((col) => (
            <Column
              key={col.status}
              status={col.status}
              label={col.label}
              issues={col.issues}
              totalCount={col.totalCount}
              sprintId={sprint.id}
              onMoveIssue={handleMoveIssue}
              onSelectIssue={handleSelectIssue}
              projectId={projectId}
              epics={epics}
              onIssueCreated={handleIssueCreated}
              onMoveToStatus={handleMoveToStatus}
              moveDisabled={isMoving}
              className={col.status === activeStatus ? "" : "max-md:hidden"}
              {...(col.status === "OPEN" && {
                showCreateForm: showCreateInOpen,
                onCreateFormChange: setShowCreateInOpen,
              })}
            />
          ))}
        </div>
      </div>

      {/* Move confirmations and errors */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${
              toast.tone === "error"
                ? "border-destructive/40 bg-background text-destructive"
                : "border-border bg-foreground text-background"
            }`}
          >
            <span className="min-w-0 wrap-anywhere">{toast.message}</span>
            {toast.status && toast.status !== activeStatus && (
              <button
                type="button"
                onClick={() => {
                  if (toast.status) setActiveStatus(toast.status);
                  setToast(null);
                }}
                className="-my-1 shrink-0 rounded px-2 py-1 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                Show
              </button>
            )}
          </div>
        )}
      </div>

      <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
