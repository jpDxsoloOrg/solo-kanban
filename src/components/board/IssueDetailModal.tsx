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
import { LocalDate } from "@/components/common/LocalDate";

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

interface EditableFields {
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
}

const priorityOptions: { value: IssuePriority; label: string }[] = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export function IssueDetailModal({ issue, onClose, onUpdate }: IssueDetailModalProps) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [status, setStatus] = useState(issue.status);
  const [priority, setPriority] = useState(issue.priority);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Fields edited since the last save. Merged, so quick successive edits
  // (a title, then the priority) are all saved, not just the last one.
  const unsavedFieldsRef = useRef<Partial<EditableFields>>({});

  /** Save the unsaved fields now (cancelling the debounce timer). */
  const save = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const fields = unsavedFieldsRef.current;
    if (Object.keys(fields).length === 0) return;
    unsavedFieldsRef.current = {};

    setIsSaving(true);
    try {
      const updated = await updateIssue(issue.id, fields);
      onUpdate({ ...issue, ...updated });
      setSaveError(null);
    } catch (error) {
      console.error("Failed to save:", error);
      // Retry these with the next edit; newer values win.
      unsavedFieldsRef.current = { ...fields, ...unsavedFieldsRef.current };
      setSaveError("Couldn't save your changes. Keep editing to retry.");
    } finally {
      setIsSaving(false);
    }
  }, [issue, onUpdate]);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (fields: Partial<EditableFields>) => {
      unsavedFieldsRef.current = { ...unsavedFieldsRef.current, ...fields };
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void save();
      }, 500);
    },
    [save]
  );

  // Closing saves right away, before the page re-reads the issue.
  const handleClose = () => {
    void save();
    onClose();
  };

  // Flush a pending save if the modal goes away some other way (navigation).
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      const fields = unsavedFieldsRef.current;
      if (Object.keys(fields).length > 0) {
        unsavedFieldsRef.current = {};
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
    <Modal open onClose={handleClose} title={`Edit #${issue.number}`} className="max-w-2xl">
      {/* Close button: phones have little backdrop left to tap */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:top-4 sm:right-4 pointer-fine:h-8 pointer-fine:w-8"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="flex flex-col gap-5 sm:gap-6">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          aria-label="Issue title"
          className="w-full min-w-0 rounded-sm bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-xl"
          placeholder="Issue title"
        />

        {/* Metadata row */}
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
          <Select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
            label="Status"
            className="sm:w-auto"
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
            className="sm:w-auto"
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
              className="col-span-2 min-w-0 max-w-full justify-self-start"
              title={issue.epic.name}
              style={{
                backgroundColor: `${issue.epic.color}20`,
                color: issue.epic.color,
              }}
            >
              <span className="min-w-0 truncate">{issue.epic.name}</span>
            </Badge>
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
              aria-label="Description"
              className="min-h-[160px] font-mono sm:min-h-[200px]"
            />
          </TabsContent>

          <TabsContent value="preview">
            <div className="min-h-[160px] rounded-md border border-border bg-background p-3 sm:min-h-[200px]">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Created <LocalDate date={issue.createdAt} />
            </span>
            <span>
              Updated <LocalDate date={issue.updatedAt} />
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span
              aria-live="polite"
              className={`text-xs ${saveError ? "text-destructive" : "text-muted-foreground"}`}
            >
              {saveError ?? (isSaving ? "Saving..." : "")}
            </span>
            <Button intent="primary" size="sm" className="h-9 shrink-0 pointer-fine:h-8" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
