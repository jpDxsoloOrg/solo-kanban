"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Modal,
  Button,
  Select,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
} from "@dxsolo/ui";
import type { IssueWithRelations } from "@/types";
import { IssueStatus, IssuePriority } from "@prisma/client";
import { updateIssue } from "@/actions/update-issue";
import { MarkdownPreview } from "./MarkdownPreview";
import { SubtaskList } from "./SubtaskList";

interface IssueDetailModalProps {
  issue: IssueWithRelations;
  onClose: () => void;
  onUpdate: (updated: IssueWithRelations) => void;
}

const statusOptions: { value: IssueStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "DONE", label: "Done" },
];

const priorityOptions: { value: IssuePriority; label: string }[] = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const priorityBadgeIntent: Record<IssuePriority, "danger" | "warning" | "info" | "default"> = {
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "default",
};

export function IssueDetailModal({ issue, onClose, onUpdate }: IssueDetailModalProps) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [status, setStatus] = useState(issue.status);
  const [priority, setPriority] = useState(issue.priority);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track latest values for flush-on-unmount
  const latestFieldsRef = useRef({ title, description, status, priority });
  useEffect(() => {
    latestFieldsRef.current = { title, description, status, priority };
  }, [title, description, status, priority]);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (fields: Partial<{ title: string; description: string; status: IssueStatus; priority: IssuePriority }>) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const updated = await updateIssue(issue.id, fields);
          onUpdate({ ...issue, ...updated });
        } catch (error) {
          console.error("Failed to save:", error);
        } finally {
          setIsSaving(false);
        }
      }, 500);
    },
    [issue, onUpdate]
  );

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const fields = latestFieldsRef.current;
        updateIssue(issue.id, fields).catch(console.error);
      }
    };
  }, [issue.id]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    debouncedSave({ title: newTitle });
  };

  const handleDescriptionChange = (newDescription: string) => {
    setDescription(newDescription);
    debouncedSave({ description: newDescription });
  };

  const handleStatusChange = (newStatus: IssueStatus) => {
    setStatus(newStatus);
    debouncedSave({ status: newStatus });
  };

  const handlePriorityChange = (newPriority: IssuePriority) => {
    setPriority(newPriority);
    debouncedSave({ priority: newPriority });
  };

  return (
    <Modal open onClose={onClose} title="" className="max-w-2xl">
      <div className="flex flex-col gap-6">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="text-xl font-semibold bg-transparent border-none outline-none w-full placeholder-gray-400 focus:ring-0"
          placeholder="Issue title"
        />

        {/* Metadata row */}
        <div className="flex items-center gap-4 flex-wrap">
          <Select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
            label="Status"
            className="w-auto"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>

          <Select
            value={priority}
            onChange={(e) => handlePriorityChange(e.target.value as IssuePriority)}
            label="Priority"
            className="w-auto"
          >
            {priorityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>

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

          {isSaving && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
        </div>

        {/* Description: tabbed write/preview */}
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="write">
            <Textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Add a description... (supports markdown)"
              className="min-h-[200px] font-mono"
            />
          </TabsContent>

          <TabsContent value="preview">
            <div className="min-h-[200px] p-3 border border-border rounded-md bg-background">
              {description ? (
                <MarkdownPreview content={description} />
              ) : (
                <p className="text-sm text-muted-foreground">Nothing to preview</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Subtasks */}
        <SubtaskList issueId={issue.id} subtasks={issue.subtasks} />

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
          <span>Created {new Date(issue.createdAt).toLocaleDateString()}</span>
          <span>Updated {new Date(issue.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </Modal>
  );
}