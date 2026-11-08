"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Badge } from "@dxsolo/ui";
import type { CommentWithReplies, IssueWithRelations, SprintWithCounts } from "@/types";
import type { Sprint } from "@prisma/client";
import { IssuePriority } from "@prisma/client";
import { IssueDetailModal } from "./IssueDetailModal";
import { MarkdownPreview } from "./MarkdownPreview";
import { SubtaskList } from "./SubtaskList";
import { LocalDate } from "./LocalDate";
import { STATUS_LABELS } from "./columns";
import { getIssue } from "@/actions/get-issue";
import { IssueSprintField } from "@/components/sprints/IssueSprintField";
import { CommentThread } from "@/components/comments/CommentThread";

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
}

export function IssueView({ issue: initial, projectId, comments, sprints }: IssueViewProps) {
  const [issue, setIssue] = useState(initial);
  const [editing, setEditing] = useState(false);
  // Bumped after the edit modal closes so the page's subtask list picks up
  // subtasks added or toggled inside the modal.
  const [subtasksVersion, setSubtasksVersion] = useState(0);

  const handleSprintChange = (sprint: Sprint | null) => {
    setIssue((prev) => ({ ...prev, sprintId: sprint?.id ?? null, sprint }));
  };

  const handleClose = async () => {
    setEditing(false);
    try {
      const fresh = await getIssue(issue.id);
      if (fresh) {
        setIssue(fresh);
        setSubtasksVersion((v) => v + 1);
      }
    } catch (error) {
      console.error("Failed to refresh issue:", error);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-4 sm:p-6">
      <div className="mb-3 sm:mb-4">
        <Link
          href={`/projects/${projectId}/board`}
          className="-mx-1 inline-flex min-h-9 items-center rounded px-1 text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Back to board
        </Link>
      </div>

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

      <SubtaskList key={subtasksVersion} issueId={issue.id} subtasks={issue.subtasks} />

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
          onClose={handleClose}
          onUpdate={(updated) => setIssue(updated)}
        />
      )}
      </div>
    </div>
  );
}
