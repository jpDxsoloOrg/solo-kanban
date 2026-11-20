"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Badge } from "@dxsolo/ui";
import type { CommentWithReplies, IssueWithRelations, SprintWithCounts } from "@/types";
import type { Epic, Sprint } from "@prisma/client";
import { IssuePriority } from "@prisma/client";
import { IssueDetailModal } from "./IssueDetailModal";
import { MarkdownPreview } from "./MarkdownPreview";
import { SubtaskList } from "./SubtaskList";
import { ChildIssueList } from "./ChildIssueList";
import { LocalDate } from "@/components/common/LocalDate";
import { STATUS_LABELS } from "./columns";
import { getIssue } from "@/actions/get-issue";
import { IssueSprintField } from "@/components/sprints/IssueSprintField";
import { CommentThread } from "@/components/comments/CommentThread";
import { useServerState } from "@/components/live/useServerState";

const priorityLabel: Record<IssuePriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const priorityClass: Record<IssuePriority, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  LOW: "bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-300",
};

interface IssueViewProps {
  issue: IssueWithRelations;
  projectId: string;
  /** Top-level comments with their replies, oldest first. */
  comments: CommentWithReplies[];
  /** ACTIVE and PLANNED sprints the issue can be moved into. */
  sprints: SprintWithCounts[];
  /** The project's epics, for the edit dialog's epic picker. */
  epics: Epic[];
}

export function IssueView({ issue: serverIssue, projectId, comments, sprints, epics }: IssueViewProps) {
  const [editing, setEditing] = useState(false);
  // Follows refreshed server data (live updates from other tabs/devices),
  // but not while the edit modal is open: it works on this copy.
  const [issue, setIssue, skipPendingServerIssue] = useServerState(serverIssue, editing);

  const handleSprintChange = (sprint: Sprint | null) => {
    setIssue((prev) => ({ ...prev, sprintId: sprint?.id ?? null, sprint }));
  };

  const handleClose = async () => {
    // The modal kept this copy up to date while it was open, and the fetch
    // below picks up subtask changes made in it; data from refreshes that
    // happened meanwhile may be older.
    skipPendingServerIssue();
    setEditing(false);
    try {
      const fresh = await getIssue(issue.id);
      if (fresh) setIssue(fresh);
    } catch (error) {
      console.error("Failed to refresh issue:", error);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-4 sm:p-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-muted-foreground sm:mb-4">
        <Link
          href={`/projects/${projectId}/board`}
          className="-mx-1 inline-flex min-h-9 items-center rounded px-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Back to board
        </Link>
        {issue.parent && (
          <>
            <span aria-hidden="true" className="px-1">/</span>
            <Link
              href={`/projects/${projectId}/issues/${issue.parent.number}`}
              className="-mx-1 inline-flex min-h-9 min-w-0 max-w-full items-center gap-1 rounded px-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`Parent: #${issue.parent.number} ${issue.parent.title}`}
            >
              <span className="shrink-0 font-medium text-foreground/80">#{issue.parent.number}</span>
              <span className="truncate">{issue.parent.title}</span>
            </Link>
            <span aria-hidden="true" className="px-1">/</span>
            <span aria-current="page">#{issue.number}</span>
          </>
        )}
      </nav>

      <div className="mb-4 flex items-start justify-between gap-3 sm:gap-4">
        <h1 className="min-w-0 text-xl font-semibold leading-tight wrap-anywhere sm:text-2xl">
          <span className="text-muted-foreground font-normal">#{issue.number}</span>{" "}
          {issue.title}
        </h1>
        <Button intent="secondary" className="shrink-0" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>

      <div className="mb-6 flex min-w-0 flex-wrap items-center gap-2">
        {issue.parent && (
          <Badge intent="default" className="shrink-0">
            Subtask of #{issue.parent.number}
          </Badge>
        )}
        <Badge intent="default">{STATUS_LABELS[issue.status]}</Badge>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${priorityClass[issue.priority]}`}
        >
          {priorityLabel[issue.priority]}
        </span>
        {issue.epic && (
          <Badge
            intent="primary"
            className="min-w-0 max-w-full"
            title={issue.epic.name}
            style={{
              backgroundColor: `${issue.epic.color}20`,
              color: issue.epic.color,
            }}
          >
            <span className="min-w-0 truncate">{issue.epic.name}</span>
          </Badge>
        )}
        <IssueSprintField
          issue={issue}
          sprints={sprints}
          projectId={projectId}
          onChange={handleSprintChange}
        />
      </div>

      <div className="mb-8 rounded-md border border-border bg-background p-3 sm:p-4">
        {issue.description ? (
          <MarkdownPreview content={issue.description} />
        ) : (
          <p className="text-sm text-muted-foreground">No description</p>
        )}
      </div>

      <div className="flex flex-col gap-6 empty:hidden">
        {/* One level only: a subtask can't have subtasks. */}
        {!issue.parent && (
          <ChildIssueList
            parentId={issue.id}
            projectId={projectId}
            childIssues={issue.children ?? []}
          />
        )}
        {issue.subtasks.length > 0 && (
          <SubtaskList
            issueId={issue.id}
            subtasks={issue.subtasks}
            heading="Checklist (old subtasks)"
            allowAdd={false}
          />
        )}
      </div>

      <CommentThread issueId={issue.id} initialComments={comments} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>
          Created <LocalDate date={issue.createdAt} />
        </span>
        <span>
          Updated <LocalDate date={issue.updatedAt} />
        </span>
      </div>

      {editing && (
        <IssueDetailModal
          issue={issue}
          projectId={projectId}
          epics={epics}
          onClose={handleClose}
          onUpdate={(updated) => setIssue(updated)}
        />
      )}
      </div>
    </div>
  );
}
