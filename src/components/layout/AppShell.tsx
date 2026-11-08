"use client";

import { isValidElement, ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { AppIcon } from "./AppIcon";
import { setSidebarCollapsed, useSidebarCollapsed } from "./sidebar-state";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /**
   * Name shown in the phone top bar. Defaults to the current project's name
   * (taken from the <Sidebar projectId projects> element) or the app name.
   */
  title?: string;
}

const APP_NAME = "Solo Kanban";
const DRAWER_ID = "app-sidebar";
const MD_QUERY = "(min-width: 48rem)";
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Reads the project name off a <Sidebar projectId projects /> element. */
function projectNameFromSidebar(sidebar: ReactNode): string | null {
  if (!isValidElement<{ projectId?: unknown; projects?: unknown }>(sidebar)) return null;
  const { projectId, projects } = sidebar.props;
  if (typeof projectId !== "string" || !Array.isArray(projects)) return null;
  const project = projects.find(
    (p): p is { id: string; name: string } =>
      typeof p === "object" && p !== null && p.id === projectId && typeof p.name === "string"
  );
  return project?.name ?? null;
}

/**
 * App layout. Below md the sidebar is an off-canvas drawer opened from a
 * compact top bar; from md up it is a column that collapses to a slim rail.
 * Initial visibility is driven by CSS breakpoints only, so nothing flashes.
 */
export function AppShell({ sidebar, children, title }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const collapsed = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  const heading = title ?? projectNameFromSidebar(sidebar) ?? APP_NAME;

  // Close the drawer whenever the route (path or query) changes.
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [lastRouteKey, setLastRouteKey] = useState(routeKey);
  if (routeKey !== lastRouteKey) {
    setLastRouteKey(routeKey);
    setDrawerOpen(false);
  }

  // Move focus into the drawer when it opens, and back to the menu button
  // when it closes (if focus was inside it).
  useEffect(() => {
    if (drawerOpen && !wasOpenRef.current) {
      closeButtonRef.current?.focus();
    } else if (!drawerOpen && wasOpenRef.current) {
      if (asideRef.current?.contains(document.activeElement)) {
        menuButtonRef.current?.focus();
      }
    }
    wasOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  // While open: Escape closes, Tab stays inside the drawer.
  useEffect(() => {
    if (!drawerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // A modal opened from the sidebar handles its own keys.
      if (document.querySelector('[aria-modal="true"]')) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;

      const aside = asideRef.current;
      if (!aside) return;
      const focusable = Array.from(aside.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!aside.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  // The drawer only exists below md; drop it if the viewport grows past that.
  useEffect(() => {
    if (!drawerOpen) return;
    const mq = window.matchMedia(MD_QUERY);
    const handleChange = () => {
      if (mq.matches) setDrawerOpen(false);
    };
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [drawerOpen]);

  // Tapping a link in the drawer closes it, even when it points at the
  // current page (which would not change the route).
  const handleDrawerClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest("a[href]")) setDrawerOpen(false);
  };

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:grid md:grid-cols-[260px_minmax(0,1fr)] md:pt-[env(safe-area-inset-top)] md:transition-[grid-template-columns] md:duration-200 md:sidebar-collapsed:grid-cols-[3.5rem_minmax(0,1fr)]"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      {/* Phone top bar */}
      <header
        className="z-20 shrink-0 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        inert={drawerOpen}
      >
        <div className="flex h-12 items-center gap-2 px-1.5">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-controls={DRAWER_ID}
            aria-expanded={drawerOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <AppIcon className="h-6 w-6" />
          <span className="min-w-0 truncate text-base font-semibold text-foreground">
            {heading}
          </span>
        </div>
      </header>

      {/* Drawer backdrop (phones only) */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-30 bg-foreground/40 backdrop-blur-[1px] transition-opacity duration-200 md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        ref={asideRef}
        id={DRAWER_ID}
        aria-label="Sidebar"
        onClick={handleDrawerClick}
        // Visibility flips at once when opening (so focus can move in) and
        // only after the slide-out when closing (so nothing stays focusable).
        className={`fixed inset-y-0 left-0 z-40 flex w-[min(20rem,85vw)] flex-col overflow-hidden border-r border-border bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-xl md:static md:z-auto md:w-auto md:translate-x-0 md:bg-muted/50 md:pt-0 md:pl-0 md:shadow-none md:visible md:transition-none motion-reduce:transition-none ${
          drawerOpen
            ? "visible translate-x-0 [transition:translate_200ms_ease-out,visibility_0s]"
            : "invisible -translate-x-full [transition:translate_200ms_ease-out,visibility_0s_linear_200ms]"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 md:h-12 md:sidebar-collapsed:justify-center md:sidebar-collapsed:px-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:sidebar-collapsed:hidden">
            <AppIcon className="h-6 w-6" />
            <span className="truncate text-sm font-semibold text-foreground">{APP_NAME}</span>
          </div>

          {/* Phones: close the drawer */}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          {/* Desktop: collapse to / expand from a slim rail */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-controls="app-sidebar-content"
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M9.5 4.5v15" />
            </svg>
          </button>
        </div>

        <div
          id="app-sidebar-content"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain md:sidebar-collapsed:hidden"
        >
          {sidebar}
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        inert={drawerOpen}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)] focus:outline-none"
      >
        {children}
      </main>

      {/* Keeps every page in sync with changes made in other tabs/devices. */}
      <LiveRefresh />
    </div>
  );
}
