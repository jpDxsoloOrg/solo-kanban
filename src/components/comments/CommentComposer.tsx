"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, Ref } from "react";
import { Button, Kbd, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from "@dxsolo/ui";
import { MAX_COMMENT_LENGTH } from "@/lib/limits";
import type { ActionResult } from "@/types";
import { CommentBody } from "./CommentBody";
import { useIsMac } from "./useNow";

/** Show the character counter once a comment is this close to the limit. */
const COUNTER_THRESHOLD = Math.floor(MAX_COMMENT_LENGTH * 0.9);

/** Touch-friendly on phones, compact where there's a mouse. */
export const TOUCH_BUTTON_SIZE = "h-9 [@media(hover:hover)]:h-8";

type Mode = "write" | "preview";

export interface CommentComposerProps {
  /** Accessible label for the textarea (visually hidden). */
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel: string;
  /** Submit button text while the request is in flight, e.g. "Posting…". */
  pendingLabel: string;
  /**
   * Receives the trimmed body. On success the composer clears itself; on
   * failure the error is shown inline and the draft is kept.
   */
  onSubmit: (body: string) => Promise<ActionResult<unknown>>;
  /** When given, shows a Cancel button and Escape cancels. */
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Lets the parent focus the textarea (e.g. "Reply" on an open composer). */
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** Minimum textarea height class, e.g. "min-h-[72px]". */
  minHeightClass?: string;
}

export function CommentComposer({
  label,
  placeholder,
  initialValue = "",
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
  textareaRef,
  minHeightClass = "min-h-[96px]",
}: CommentComposerProps) {
  const id = useId();
  const textareaId = `${id}-body`;
  const messageId = `${id}-message`;
  const isMac = useIsMac();

  const [value, setValue] = useState(initialValue);
  const [mode, setMode] = useState<Mode>("write");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const trimmed = value.trim();
  const length = trimmed.length;
  const overBy = length - MAX_COMMENT_LENGTH;
  const tooLong = overBy > 0;
  const canSubmit = length > 0 && !tooLong && !pending;
  const showCounter = length >= COUNTER_THRESHOLD;

  const submit = async () => {
    if (!canSubmit || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit(trimmed);
      if (result.ok) {
        setValue("");
        setMode("write");
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error("Comment submit failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape" && onCancel && !pending) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const validationMessage = tooLong
    ? `${overBy.toLocaleString("en-US")} character${overBy === 1 ? "" : "s"} over the ${MAX_COMMENT_LENGTH.toLocaleString("en-US")} limit.`
    : null;
  const message = error ?? validationMessage;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={handleKeyDown}
      aria-busy={pending || undefined}
      className="w-full min-w-0"
    >
      <Tabs defaultValue="write" value={mode} onValueChange={(next) => setMode(next as Mode)}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <TabsList aria-label={`${label}: write or preview`}>
            <TabsTrigger value="write" className="h-9 px-3 [@media(hover:hover)]:h-7">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="h-9 px-3 [@media(hover:hover)]:h-7">
              Preview
            </TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">Markdown supported</span>
        </div>

        <TabsContent value="write">
          <label htmlFor={textareaId} className="sr-only">
            {label}
          </label>
          <Textarea
            ref={textareaRef}
            id={textareaId}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            placeholder={placeholder}
            autoFocus={autoFocus}
            readOnly={pending}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? messageId : undefined}
            // 16px on phones so iOS Safari doesn't zoom in on focus.
            className={`${minHeightClass} max-h-[60vh] text-base sm:text-sm [field-sizing:content] ${
              tooLong ? "border-destructive focus-visible:ring-destructive" : ""
            }`}
          />
        </TabsContent>

        <TabsContent value="preview">
          <div
            className={`${minHeightClass} rounded-md border border-border bg-muted/30 px-3 py-2`}
          >
            {trimmed ? (
              <CommentBody body={trimmed} />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {message && (
        <p id={messageId} role="alert" className="mt-1.5 text-sm text-destructive dark:text-red-400">
          {message}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          {showCounter && (
            <span
              className={tooLong ? "font-medium text-destructive dark:text-red-400" : undefined}
              aria-live="polite"
            >
              {length.toLocaleString("en-US")} / {MAX_COMMENT_LENGTH.toLocaleString("en-US")}
            </span>
          )}
          <span className="hidden items-center gap-1 [@media(hover:hover)]:inline-flex">
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>Enter</Kbd>
            <span>to {submitLabel.toLowerCase()}</span>
          </span>
        </div>
        {onCancel && (
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className={TOUCH_BUTTON_SIZE}
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          intent="primary"
          size="sm"
          className={TOUCH_BUTTON_SIZE}
          disabled={!canSubmit}
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
