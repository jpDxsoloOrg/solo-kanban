"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Modal,
  Button,
  Select,
  Input,
  ColorPicker,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
} from "@dxsolo/ui";
import type { IssueWithRelations } from "@/types";
import type { Epic } from "@prisma/client";
import { IssueStatus, IssuePriority } from "@prisma/client";
import { updateIssue } from "@/actions/update-issue";
import { createEpic } from "@/actions/epic-actions";
import { MarkdownPreview } from "./MarkdownPreview";
import { SubtaskList } from "./SubtaskList";
import { LocalDate } from "@/components/common/LocalDate";
import { useSavedCopyAt } from "@/components/pwa/saved-copy";

interface IssueDetailModalProps {
  issue: IssueWithRelations;
  projectId: string;
  /** The project's epics, for the epic picker. */
  epics: Epic[];
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
  epicId: string | null;
}

/** Epic picker value that opens the "new epic" form. */
const NEW_EPIC = "__new__";
const DEFAULT_EPIC_COLOR = "#6366f1";
const MAX_EPIC_NAME_LENGTH = 200;

const priorityOptions: { value: IssuePriority; label: string }[] = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

export function IssueDetailModal({ issue, projectId, epics, onClose, onUpdate }: IssueDetailModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [status, setStatus] = useState(issue.status);
  const [priority, setPriority] = useState(issue.priority);
  const [epicId, setEpicId] = useState<string | null>(issue.epicId);
  // Epics created in this dialog, until the page's list catches up.
  const [createdEpics, setCreatedEpics] = useState<Epic[]>([]);
  const [newEpicOpen, setNewEpicOpen] = useState(false);
  const [newEpicName, setNewEpicName] = useState("");
  const [newEpicColor, setNewEpicColor] = useState(DEFAULT_EPIC_COLOR);
  const [creatingEpic, setCreatingEpic] = useState(false);
  const [epicError, setEpicError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Closing was stopped by a failed save: offer to close without saving.
  const [closeFailed, setCloseFailed] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Fields edited since the last save. Merged, so quick successive edits
  // (a title, then the priority) are all saved, not just the last one.
  const unsavedFieldsRef = useRef<Partial<EditableFields>>({});
  // Saves still waiting for the server; closing waits for them.
  const inFlightRef = useRef(new Set<Promise<boolean>>());
  const closingRef = useRef(false);
  // A saved copy (served offline by the service worker) shows old data:
  // saving its fields would overwrite newer changes made elsewhere.
  const isSavedCopy = useSavedCopyAt() !== null;

  /**
   * Save the unsaved fields now (cancelling the debounce timer). Resolves
   * false if the save failed; the fields are then kept for a retry.
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const fields = unsavedFieldsRef.current;
    if (Object.keys(fields).length === 0) return true;
    unsavedFieldsRef.current = {};
    if (isSavedCopy) return true;

    setIsSaving(true);
    const request = (async () => {
      try {
        const updated = await updateIssue(issue.id, fields);
        onUpdate({ ...issue, ...updated });
        setSaveError(null);
        setCloseFailed(false);
        return true;
      } catch (error) {
        console.error("Failed to save:", error);
        // Retry these with the next edit (or Done); newer values win.
        unsavedFieldsRef.current = { ...fields, ...unsavedFieldsRef.current };
        setSaveError("Couldn't save your changes. Keep editing or press Done to retry.");
        return false;
      } finally {
        setIsSaving(false);
      }
    })();
    inFlightRef.current.add(request);
    try {
      return await request;
    } finally {
      inFlightRef.current.delete(request);
    }
  }, [issue, onUpdate, isSavedCopy]);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (fields: Partial<EditableFields>) => {
      if (isSavedCopy) return;
      unsavedFieldsRef.current = { ...unsavedFieldsRef.current, ...fields };
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void save();
      }, 500);
    },
    [save, isSavedCopy]
  );

  // Closing saves right away, before the page re-reads the issue. If that
  // fails the modal stays open with the error, so nothing typed is lost.
  const handleClose = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      // A save that's already running may fail and hand its fields back.
      while (inFlightRef.current.size > 0) await Promise.all(inFlightRef.current);
      if (await save()) onClose();
      else setCloseFailed(true);
    } finally {
      closingRef.current = false;
    }
  };

  const handleDiscard = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
    unsavedFieldsRef.current = {};
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

  const epicOptions = [
    ...epics,
    ...createdEpics.filter((created) => !epics.some((epic) => epic.id === created.id)),
  ].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const selectedEpic = epicOptions.find((epic) => epic.id === epicId) ?? null;

  const handleEpicChange = (value: string) => {
    if (value === NEW_EPIC) {
      setNewEpicOpen(true);
      setEpicError(null);
      return;
    }
    setNewEpicOpen(false);
    const next = value || null;
    setEpicId(next);
    debouncedSave({ epicId: next });
  };

  const cancelNewEpic = () => {
    setNewEpicOpen(false);
    setNewEpicName("");
    setNewEpicColor(DEFAULT_EPIC_COLOR);
    setEpicError(null);
  };

  const handleCreateEpic = async () => {
    const name = newEpicName.trim();
    if (!name || creatingEpic || isSavedCopy) return;
    setCreatingEpic(true);
    setEpicError(null);
    try {
      const epic = await createEpic(projectId, name, newEpicColor);
      setCreatedEpics((prev) => [...prev, epic]);
      setEpicId(epic.id);
      debouncedSave({ epicId: epic.id });
      cancelNewEpic();
      // Show the new epic in the sidebar and board filters too.
      router.refresh();
    } catch (error) {
      console.error("Failed to create epic:", error);
      setEpicError("Couldn't create the epic. Try again.");
    } finally {
      setCreatingEpic(false);
    }
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
        {isSavedCopy && (
          <p
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            This is a saved copy from while you were offline, so changes here aren&apos;t saved.
            Copy anything you typed, then reload once you&apos;re online to edit the latest version.
          </p>
        )}

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

          <div className="col-span-2 flex min-w-0 items-end gap-2 sm:col-span-1">
            {selectedEpic && !newEpicOpen && (
              <span
                aria-hidden="true"
                className="mb-3 h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: selectedEpic.color }}
              />
            )}
            <Select
              value={newEpicOpen ? NEW_EPIC : (epicId ?? "")}
              onChange={(e) => handleEpicChange(e.target.value)}
              label="Epic"
              className="min-w-0 sm:w-auto sm:max-w-56"
            >
              <option value="">No epic</option>
              {epicOptions.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.name}
                </option>
              ))}
              <option value={NEW_EPIC}>+ New epic…</option>
            </Select>
          </div>
        </div>

        {newEpicOpen && (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
            <Input
              label="New epic name"
              placeholder="e.g. Authentication"
              value={newEpicName}
              maxLength={MAX_EPIC_NAME_LENGTH}
              autoFocus
              onChange={(e) => setNewEpicName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateEpic();
                } else if (e.key === "Escape") {
                  // Close just this form, not the whole dialog.
                  e.stopPropagation();
                  cancelNewEpic();
                }
              }}
            />
            <ColorPicker label="Color" value={newEpicColor} onChange={setNewEpicColor} />
            {epicError && (
              <p role="alert" className="text-sm text-destructive">
                {epicError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button intent="ghost" size="sm" className="h-9 pointer-fine:h-8" onClick={cancelNewEpic}>
                Cancel
              </Button>
              <Button
                intent="primary"
                size="sm"
                className="h-9 pointer-fine:h-8"
                onClick={() => void handleCreateEpic()}
                disabled={!newEpicName.trim() || creatingEpic || isSavedCopy}
              >
                {creatingEpic ? "Creating..." : "Create & assign"}
              </Button>
            </div>
          </div>
        )}

        {/* Description: tabbed write/preview */}
        <Tabs defaultValue="write">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="write" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring">
            <Textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Add a description... (supports markdown)"
              aria-label="Description"
              className="min-h-[160px] font-mono sm:min-h-[200px]"
            />
          </TabsContent>

          <TabsContent value="preview" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring">
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
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <span
              aria-live="polite"
              className={`text-xs ${saveError ? "text-destructive" : "text-muted-foreground"}`}
            >
              {saveError ?? (isSaving ? "Saving..." : "")}
            </span>
            {closeFailed && saveError && (
              <Button intent="ghost" size="sm" className="h-9 shrink-0 pointer-fine:h-8" onClick={handleDiscard}>
                Discard changes
              </Button>
            )}
            <Button intent="primary" size="sm" className="h-9 shrink-0 pointer-fine:h-8" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
