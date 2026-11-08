"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Modal } from "@dxsolo/ui";
import type { Sprint } from "@prisma/client";
import {
  completeSprint,
  getNextSprintNumber,
  updateSprint,
  type CompleteSprintSummary,
  type IncompleteIssueTarget,
} from "@/actions/sprint-actions";
import type { SprintWithCounts } from "@/types";
import {
  addDaysToInputValue,
  DEFAULT_SPRINT_LENGTH_DAYS,
  formatSprintRange,
  todayInputValue,
  toDateInputValue,
  utcToday,
} from "@/lib/sprint-dates";
import { dialogClass, pluralize } from "./sprint-ui";

export interface CompleteSprintDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** The active sprint being completed. */
  sprint: Sprint;
  /** DONE issues in the sprint (archived with it). */
  doneCount: number;
  /** Issues that aren't DONE (moved to the chosen target). */
  unfinishedCount: number;
  /** Planned sprints the unfinished issues can move to. */
  plannedSprints: SprintWithCounts[];
  onCompleted?: (summary: CompleteSprintSummary) => void;
}

export function CompleteSprintDialog({
  open,
  onClose,
  sprint,
  ...formProps
}: CompleteSprintDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Complete ${sprint.name}`}
      className={dialogClass}
    >
      {open && (
        <CompleteSprintForm
          key={sprint.id}
          sprint={sprint}
          {...formProps}
          onBusyChange={setBusy}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}

type CompleteSprintFormProps = Omit<CompleteSprintDialogProps, "open" | "onClose"> & {
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
};

function CompleteSprintForm({
  projectId,
  sprint,
  doneCount,
  unfinishedCount,
  plannedSprints,
  onCompleted,
  onBusyChange,
  onCancel,
}: CompleteSprintFormProps) {
  const router = useRouter();
  const [target, setTarget] = useState<IncompleteIssueTarget>("new");
  const [startNow, setStartNow] = useState(true);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getNextSprintNumber(projectId)
      .then((n) => {
        if (!cancelled) setNextNumber(n);
      })
      .catch(() => {
        // Only used for a label; "New sprint" alone is fine.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const hasUnfinished = unfinishedCount > 0;
  const newSprintName = nextNumber ? `Sprint ${nextNumber}` : null;
  // With nothing left to move the choice is only "what runs next", and
  // picking a sprint means starting it.
  const startNext = target !== "backlog" && (hasUnfinished ? startNow : true);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;

    setError(null);
    onBusyChange(true);
    startTransition(async () => {
      const result = await completeSprint(sprint.id, { moveIncompleteTo: target, startNext });
      if (!result.ok) {
        onBusyChange(false);
        setError(result.error);
        return;
      }

      if (result.data.nextSprintStarted && result.data.nextSprintId) {
        await alignDefaultedDates(result.data.nextSprintId, target, plannedSprints);
      }

      // Refresh and close in one transition: the dialog keeps its pending
      // state until the next sprint (or the empty state) has rendered.
      startTransition(() => {
        router.refresh();
        onBusyChange(false);
        onCompleted?.(result.data);
        onCancel();
      });
    });
  };

  const options: { value: IncompleteIssueTarget; title: string; detail?: string }[] = [
    {
      value: "new",
      title: hasUnfinished ? "New sprint" : "Start a new sprint",
      detail: newSprintName ?? undefined,
    },
    ...plannedSprints.map((planned) => ({
      value: planned.id,
      title: hasUnfinished ? planned.name : `Start ${planned.name}`,
      detail: [
        pluralize(planned._count.issues, "issue"),
        formatSprintRange(planned.startDate, planned.endDate),
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    {
      value: "backlog",
      title: hasUnfinished ? "Backlog" : "Don't start another sprint yet",
      detail: hasUnfinished ? "Plan them into a sprint later" : undefined,
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-foreground">
        {doneCount > 0 ? (
          <>
            <strong className="font-semibold">{pluralize(doneCount, "completed issue")}</strong>{" "}
            will be archived with {sprint.name} and leave the board.
          </>
        ) : hasUnfinished ? (
          <>No issues were completed in {sprint.name}.</>
        ) : (
          <>{sprint.name} has no issues.</>
        )}
        {!hasUnfinished && doneCount > 0 && " Everything in this sprint is done."}
      </p>

      <fieldset className="flex flex-col gap-2" disabled={isPending}>
        <legend className="mb-2 text-sm font-medium text-foreground">
          {hasUnfinished ? (
            <>
              {pluralize(unfinishedCount, "unfinished issue")}{" "}
              {unfinishedCount === 1 ? "moves" : "move"} to:
            </>
          ) : (
            "What's next?"
          )}
        </legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name="complete-target"
              value={option.value}
              checked={target === option.value}
              onChange={() => setTarget(option.value)}
              className="h-4 w-4 shrink-0 accent-[var(--color-primary)] focus-visible:outline-none dark:[color-scheme:dark]"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                {option.title}
              </span>
              {option.detail && (
                <span className="text-xs text-muted-foreground">{option.detail}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {hasUnfinished && target !== "backlog" && (
        <Checkbox
          label="Start it now"
          checked={startNow}
          onChange={(e) => setStartNow(e.target.checked)}
          disabled={isPending}
        />
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" intent="secondary" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" intent="primary" disabled={isPending}>
          {isPending ? "Completing…" : "Complete sprint"}
        </Button>
      </div>
    </form>
  );
}

/**
 * When `completeSprint` starts the next sprint without planned dates, the
 * server defaults the start to *its* (UTC) today, which can be a day off from
 * the user's calendar. Re-date it to the browser's today. Best effort: the
 * sprint is already running, so a failure here is only logged.
 */
async function alignDefaultedDates(
  nextSprintId: string,
  target: IncompleteIssueTarget,
  plannedSprints: SprintWithCounts[],
) {
  const today = todayInputValue();
  const serverToday = toDateInputValue(utcToday());
  if (today === serverToday) return;

  const planned = plannedSprints.find((s) => s.id === target);
  if (planned?.startDate) return; // The user planned this start date.

  const plannedEnd = toDateInputValue(planned?.endDate);
  if (plannedEnd && plannedEnd < today) return;

  try {
    const result = await updateSprint(nextSprintId, {
      startDate: today,
      ...(!plannedEnd && { endDate: addDaysToInputValue(today, DEFAULT_SPRINT_LENGTH_DAYS) }),
    });
    if (!result.ok) console.error("Failed to align sprint dates:", result.error);
  } catch (error) {
    console.error("Failed to align sprint dates:", error);
  }
}
