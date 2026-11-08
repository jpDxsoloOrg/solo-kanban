"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Textarea } from "@dxsolo/ui";
import type { Sprint } from "@prisma/client";
import { createSprint, startSprint } from "@/actions/sprint-actions";
import { MAX_SPRINT_GOAL_LENGTH, MAX_SPRINT_NAME_LENGTH } from "@/lib/limits";
import {
  addDaysToInputValue,
  DEFAULT_SPRINT_LENGTH_DAYS,
  todayInputValue,
  toDateInputValue,
} from "@/lib/sprint-dates";
import { dialogClass, pluralize } from "./sprint-ui";

export interface StartSprintDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /**
   * The planned sprint to start. Omit (or null) to create a new sprint and
   * start it right away.
   */
  sprint?: (Sprint & { _count?: { issues: number } }) | null;
  /** Called after the sprint started; the page is refreshed either way. */
  onStarted?: (sprint: Sprint) => void;
}

/** Pick start/end dates and start a sprint (creating it first if needed). */
export function StartSprintDialog({ open, onClose, projectId, sprint, onStarted }: StartSprintDialogProps) {
  const [busy, setBusy] = useState(false);
  const issueCount = sprint?._count?.issues;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={sprint ? `Start ${sprint.name}` : "Start a new sprint"}
      description={
        sprint
          ? issueCount === undefined
            ? "Its issues will show up on the board."
            : issueCount === 0
              ? "This sprint has no issues yet. You can add some from the backlog after it starts."
              : `${pluralize(issueCount, "issue")} will show up on the board.`
          : "Creates the sprint and puts it on the board. Add issues from the backlog or the board."
      }
      className={dialogClass}
    >
      {open && (
        <StartSprintForm
          key={sprint?.id ?? "new"}
          projectId={projectId}
          sprint={sprint ?? null}
          onBusyChange={setBusy}
          onCancel={onClose}
          onStarted={(started) => {
            onStarted?.(started);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

interface StartSprintFormProps {
  projectId: string;
  sprint: Sprint | null;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onStarted: (sprint: Sprint) => void;
}

function StartSprintForm({ projectId, sprint, onBusyChange, onCancel, onStarted }: StartSprintFormProps) {
  const router = useRouter();
  // Only mounted after the user opens the dialog, so reading the browser's
  // date here can't cause a hydration mismatch.
  const [startDate, setStartDate] = useState(() => todayInputValue());
  const [endDate, setEndDate] = useState(() => {
    const today = todayInputValue();
    const planned = toDateInputValue(sprint?.endDate);
    return planned && planned >= today
      ? planned
      : addDaysToInputValue(today, DEFAULT_SPRINT_LENGTH_DAYS);
  });
  const [endTouched, setEndTouched] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  // If creating succeeded but starting failed, retry only the start.
  const [created, setCreated] = useState<Sprint | null>(null);
  const [isPending, startTransition] = useTransition();

  const startError = !startDate ? "Pick a start date." : undefined;
  const endError = !endDate
    ? "Pick an end date."
    : endDate < startDate
      ? "The end date can't be before the start date."
      : undefined;
  const canSubmit = !startError && !endError && !isPending;

  const handleStartChange = (value: string) => {
    setStartDate(value);
    // Keep the default sprint length until the user picks an end date.
    if (!endTouched && value) {
      setEndDate(addDaysToInputValue(value, DEFAULT_SPRINT_LENGTH_DAYS));
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    onBusyChange(true);
    // Offline, server down, or a stale tab after a deploy. Thrown out of the
    // transition it would replace the page with the error screen.
    const handleUnreachable = (err: unknown) => {
      console.error("Failed to start sprint:", err);
      onBusyChange(false);
      setError("Couldn't start the sprint. Check your connection and try again.");
    };

    startTransition(async () => {
      let target = sprint ?? created;
      if (!target) {
        let createResult: Awaited<ReturnType<typeof createSprint>>;
        try {
          createResult = await createSprint(projectId, {
            ...(name.trim() && { name }),
            goal,
            startDate,
            endDate,
          });
        } catch (err) {
          handleUnreachable(err);
          return;
        }
        if (!createResult.ok) {
          onBusyChange(false);
          setError(createResult.error);
          return;
        }
        target = createResult.data;
        setCreated(createResult.data);
      }

      let result: Awaited<ReturnType<typeof startSprint>>;
      try {
        result = await startSprint(target.id, { startDate, endDate });
      } catch (err) {
        // A sprint created above is kept (see `created`): retrying only starts it.
        handleUnreachable(err);
        return;
      }
      if (!result.ok) {
        onBusyChange(false);
        setError(result.error);
        // A sprint we just created exists now (as planned); show it.
        if (!sprint) startTransition(() => router.refresh());
        return;
      }
      // Refresh and close in one transition: the dialog keeps its pending
      // state until the board has rendered.
      startTransition(() => {
        router.refresh();
        onBusyChange(false);
        onStarted(result.data);
      });
    });
  };

  const isNew = !sprint && !created;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {isNew && (
        <>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sprint 4"
            helperText="Leave blank to use the next sprint number."
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
            rows={2}
            disabled={isPending}
          />
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input
          type="date"
          label="Start date"
          value={startDate}
          onChange={(e) => handleStartChange(e.target.value)}
          error={startError}
          disabled={isPending}
          required
          className="px-2 dark:[color-scheme:dark]"
        />
        <Input
          type="date"
          label="End date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => {
            setEndTouched(true);
            setEndDate(e.target.value);
          }}
          error={endError}
          disabled={isPending}
          required
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
          {isPending ? "Starting…" : "Start sprint"}
        </Button>
      </div>
    </form>
  );
}
