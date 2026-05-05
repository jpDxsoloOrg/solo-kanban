"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Badge } from "@dxsolo/ui";
import type { IssueWithRelations } from "@/types";
import { IssueStatus, IssuePriority } from "@prisma/client";
import { IssueDetailModal } from "./IssueDetailModal";
import { MarkdownPreview } from "./MarkdownPreview";
import { SubtaskList } from "./SubtaskList";
import { getIssue } from "@/actions/get-issue";

const statusLabel: Record<IssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  DONE: "Done",
};

const priorityLabel: Record<IssuePriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const priorityClass: Record<IssuePriority, string> = {
  URGENT: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-gray-100 text-gray-500",
};

interface IssueViewProps {
  issue: IssueWithRelations;
  projectId: string;
}

export function IssueView({ issue: initial, projectId }: IssueViewProps) {
  const [issue, setIssue] = useState(initial);
  const [editing, setEditing] = useState(false);

  const handleClose = async () => {
    setEditing(false);
    try {
      const fresh = await getIssue(issue.id);
      if (fresh) setIssue(fresh);
    } catch (error) {
      console.error("Failed to refresh issue:", error);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <Link
          href={`/projects/${projectId}/board`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to board
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-4">
        <h1 className="text-2xl font-semibold leading-tight">
          <span className="text-muted-foreground font-normal">#{issue.number}</span>{" "}
          {issue.title}
        </h1>
        <Button intent="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-6">
        <Badge intent="default">{statusLabel[issue.status]}</Badge>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${priorityClass[issue.priority]}`}
        >
          {priorityLabel[issue.priority]}
        </span>
        {issue.epic && (
          <Badge
            intent="primary"
            style={{
              backgroundColor: `${issue.epic.color}20`,
              color: issue.epic.color,
            }}
          >
            {issue.epic.name}
          </Badge>
        )}
      </div>

      <div className="mb-8 p-4 border border-border rounded-md bg-background">
        {issue.description ? (
          <MarkdownPreview content={issue.description} />
        ) : (
          <p className="text-sm text-muted-foreground">No description</p>
        )}
      </div>

      <SubtaskList issueId={issue.id} subtasks={issue.subtasks} />

      <div className="mt-8 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>Created {new Date(issue.createdAt).toLocaleDateString()}</span>
        <span>Updated {new Date(issue.updatedAt).toLocaleDateString()}</span>
      </div>

      {editing && (
        <IssueDetailModal
          issue={issue}
          onClose={handleClose}
          onUpdate={(updated) => setIssue(updated)}
        />
      )}
    </div>
  );
}
