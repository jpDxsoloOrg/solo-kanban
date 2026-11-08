"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Textarea } from "@dxsolo/ui";
import type { Sprint } from "@prisma/client";
import { createSprint, updateSprint } from "@/actions/sprint-actions";
import { MAX_SPRINT_GOAL_LENGTH, MAX_SPRINT_NAME_LENGTH } from "@/lib/limits";
import { toDateInputValue } from "@/lib/sprint-dates";
import { dialogClass } from "./sprint-ui";

export interface SprintFormModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Sprint to edit. Omit (or null) to create a new planned sprint. */
  sprint?: Sprint | null;
  /** Called after a successful save; the page is refreshed either way. */
  onSaved?: (sprint: Sprint) => void;
}

/** Create or edit a sprint's name, goal and planned dates. */
export function SprintFormModal({ open, onClose, projectId, sprint, onSaved }: SprintFormModalProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={sprint ? `Edit ${sprint.name}` : "New sprint"}
      description={
        sprint ? undefined : "Plan a sprint now and fill it from the backlog. You can start it later."
      }
      className={dialogClass}
    >
      {open && (
        <SprintForm
          key={sprint?.id ?? "new"}
          projectId={projectId}
          sprint={sprint ?? null}
          onBusyChange={setBusy}
          onCancel={onClose}
          onSaved={(saved) => {
            onSaved?.(saved);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

interface SprintFormProps {
  projectId: string;
  sprint: Sprint | null;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: (sprint: Sprint) => void;
}

function SprintForm({ projectId, sprint, onBusyChange, onCancel, onSaved }: SprintFormProps) {
  const router = useRouter();
  const [name, setName] = useState(sprint?.name ?? "");
  const [goal, setGoal] = useState(sprint?.goal ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(sprint?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(sprint?.endDate));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = sprint !== null;
  const nameError = isEdit && !name.trim() ? "A sprint needs a name." : undefined;
  // "YYYY-MM-DD" strings compare correctly as text.
  const dateError =
    startDate && endDate && endDate < startDate
      ? "The end date can't be before the start date."
      : undefined;
  const canSubmit = !nameError && !dateError && !isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    onBusyChange(true);
    startTransition(async () => {
      const input = {
        goal,
        startDate: startDate || null,
        endDate: endDate || null,
      };
      const result = isEdit
        ? await updateSprint(sprint.id, { ...input, name })
        : await createSprint(projectId, { ...input, ...(name.trim() && { name }) });
      if (!result.ok) {
        onBusyChange(false);
        setError(result.error);
        return;
      }
      // Refresh and close in one transition: the dialog keeps its pending
      // state until the fresh data has rendered.
      startTransition(() => {
        router.refresh();
        onBusyChange(false);
        onSaved(result.data);
      });
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={isEdit ? undefined : "e.g. Sprint 4"}
        helperText={isEdit ? undefined : "Leave blank to use the next sprint number."}
        error={nameError}
        maxLength={MAX_SPRINT_NAME_LENGTH}
        disabled={isPending}
        autoComplete="off"
      />
      <Textarea
        label="Goal"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="What should this sprint achieve? (optional)"
        maxLength={MAX_SPRINT_GOAL_LENGTH}
        rows={3}
        disabled={isPending}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          type="date"
          label="Start date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          disabled={isPending}
          className="px-2 dark:[color-scheme:dark]"
        />
        <Input
          type="date"
          label="End date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => setEndDate(e.target.value)}
          error={dateError}
          disabled={isPending}
          className="px-2 dark:[color-scheme:dark]"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" intent="secondary" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" intent="primary" disabled={!canSubmit}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create sprint"}
        </Button>
      </div>
    </form>
  );
}
