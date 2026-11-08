"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IssueStatus } from "@prisma/client";
import { BOARD_COLUMNS, STATUS_DOT_CLASSES } from "./columns";

interface MoveMenuProps {
  issueId: string;
  issueNumber: number;
  currentStatus: IssueStatus;
  /** Called with the column the user picked. */
  onMove: (status: IssueStatus) => void;
  /**
   * Disables the menu's options (e.g. while another move is saving). The
   * trigger itself stays enabled so it can keep keyboard focus.
   */
  disabled?: boolean;
  /** Extra classes for the trigger button (e.g. positioning). */
  className?: string;
}

const MENU_WIDTH = 176;
const VIEWPORT_MARGIN = 8;

/**
 * "Move" button + menu listing the other columns. Lets cards move without
 * drag-and-drop (which most phones don't support). The menu is portaled so
 * the scrolling column can't clip it; React events from it are stopped so
 * they never reach the card's click handler.
 */
export function MoveMenu({ issueId, issueNumber, currentStatus, onMove, disabled, className = "" }: MoveMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const options = BOARD_COLUMNS.filter((col) => col.status !== currentStatus);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Place the menu under the trigger (or above it when there's no room),
  // right-aligned and kept inside the viewport. Runs before paint.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const rect = trigger.getBoundingClientRect();
    const height = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= height + VIEWPORT_MARGIN || rect.top < height + VIEWPORT_MARGIN
        ? Math.min(rect.bottom + 4, window.innerHeight - height - VIEWPORT_MARGIN)
        : rect.top - height - 4;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
    );
    setPosition({ top: Math.max(VIEWPORT_MARGIN, top), left });
  }, [open]);

  // Focus the first option once the menu is placed.
  useEffect(() => {
    if (open && position) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open, position]);

  // Dismiss on outside press, scroll (the menu is fixed-position) or resize.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const handleScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const handleResize = () => close(false);

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [open, close]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')
    );
    const index = items.indexOf(document.activeElement as HTMLElement);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case "Home":
        e.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleSelect = (status: IssueStatus) => {
    if (disabled) return;
    close(false);
    onMove(status);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-move-trigger={issueId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Move issue #${issueNumber} to another column`}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close(false);
          else setOpen(true);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground transition-[opacity,color,background-color] hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:h-6 pointer-fine:px-1.5 ${
          open
            ? "bg-muted text-foreground"
            : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        } ${className}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
        </svg>
        Move
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Move #${issueNumber} to`}
            onKeyDown={handleMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: MENU_WIDTH,
              visibility: position ? "visible" : "hidden",
            }}
            className="z-50 rounded-lg border border-border bg-background p-1 text-foreground shadow-lg"
          >
            <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground" aria-hidden="true">
              Move to
            </p>
            {options.map((option) => (
              <button
                key={option.status}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={disabled || undefined}
                onClick={() => handleSelect(option.status)}
                className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors hover:bg-muted focus:bg-muted focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-fine:h-9"
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[option.status]}`}
                />
                {option.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
