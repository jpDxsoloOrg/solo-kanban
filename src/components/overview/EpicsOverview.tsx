"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@dxsolo/ui";
import type { OverviewEpic, OverviewProject } from "@/lib/overview";
import { focusRingClass, pluralize } from "@/components/sprints/sprint-ui";
import { EpicRow, showAllDoneKey } from "./EpicRow";
import { setExpanded, useExpandedKeys } from "./expanded-state";
import {
  matchesQuery,
  normalizeQuery,
  PARAM_HIDDEN_PROJECTS,
  PARAM_HIDE_FINISHED,
  PARAM_QUERY,
  parseFilters,
  replaceFilterParams,
} from "./filters";

/** How long typing pauses before the name filter is written to the URL. */
const QUERY_URL_DELAY_MS = 250;

interface EpicsOverviewProps {
  /** All projects, oldest first; rendered as given (no client copy). */
  projects: OverviewProject[];
}

interface VisibleGroup {
  project: OverviewProject;
  rows: OverviewEpic[];
}

/**
 * Epics from every project, grouped by project, with URL-backed filters and
 * expandable rows. Expanded rows are tracked by id, so they stay open when the
 * page re-renders with fresh data.
 */
export function EpicsOverview({ projects }: EpicsOverviewProps) {
  const searchParams = useSearchParams();
  const { hiddenProjects, hideFinished, query: urlQuery } = parseFilters(searchParams);
  const expandedKeys = useExpandedKeys();
  const searchId = useId();

  // The name filter applies as you type; the URL catches up after a pause
  // (browsers rate-limit history updates). A URL change made elsewhere (e.g.
  // the sidebar link back to this page) replaces what is in the box.
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [writtenQuery, setWrittenQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== writtenQuery) {
      setQuery(urlQuery);
      setWrittenQuery(urlQuery);
    }
  }

  const writeQuery = (value: string) => {
    setWrittenQuery(value);
    replaceFilterParams({ [PARAM_QUERY]: value.trim() === "" ? null : value });
  };

  useEffect(() => {
    if (query === writtenQuery) return;
    const timer = window.setTimeout(() => {
      setWrittenQuery(query);
      replaceFilterParams({ [PARAM_QUERY]: query.trim() === "" ? null : query });
    }, QUERY_URL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, writtenQuery]);

  // Leaving the box (e.g. tapping an issue link) writes it at once, so going
  // back restores exactly what was typed.
  const flushQuery = () => {
    if (query !== writtenQuery) writeQuery(query);
  };

  const normalizedQuery = normalizeQuery(query);
  const epicTotal = projects.reduce((sum, project) => sum + project.epics.length, 0);
  const filtersActive = hiddenProjects.size > 0 || hideFinished || normalizedQuery !== "";

  const groups: VisibleGroup[] = projects
    .filter((project) => !hiddenProjects.has(project.id))
    .map((project) => {
      const rows = [...project.epics, ...(project.noEpic ? [project.noEpic] : [])].filter(
        (row) =>
          !(hideFinished && row.finished) &&
          // The name filter is about epics; "No epic" isn't one.
          (row.epicId !== null ? matchesQuery(row.name, normalizedQuery) : normalizedQuery === ""),
      );
      return { project, rows };
    })
    // Unfiltered, every project shows (even without epics); filtered, only matches.
    .filter((group) => !filtersActive || group.rows.length > 0);

  const visibleRows = groups.flatMap((group) => group.rows);
  const visibleEpicCount = visibleRows.filter((row) => row.epicId !== null).length;
  const expandableKeys = visibleRows.filter((row) => row.total > 0).map((row) => row.key);
  const allExpanded =
    expandableKeys.length > 0 && expandableKeys.every((key) => expandedKeys.has(key));
  const noneExpanded = !expandableKeys.some((key) => expandedKeys.has(key));

  // Toggles read the live URL, so quick successive taps build on each other
  // even before the router has re-rendered with the previous change.
  const liveFilters = () => parseFilters(new URL(window.location.href).searchParams);

  const toggleProject = (projectId: string) => {
    const next = new Set(liveFilters().hiddenProjects);
    if (next.has(projectId)) next.delete(projectId);
    else next.add(projectId);
    // Drop ids of projects that no longer exist.
    const ids = projects.map((project) => project.id).filter((id) => next.has(id));
    replaceFilterParams({ [PARAM_HIDDEN_PROJECTS]: ids.join(",") || null });
  };

  const toggleHideFinished = () => {
    replaceFilterParams({ [PARAM_HIDE_FINISHED]: liveFilters().hideFinished ? null : "1" });
  };

  const clearFilters = () => {
    setQuery("");
    setWrittenQuery("");
    replaceFilterParams({
      [PARAM_HIDDEN_PROJECTS]: null,
      [PARAM_HIDE_FINISHED]: null,
      [PARAM_QUERY]: null,
    });
  };

  const expandAll = () => setExpanded(expandableKeys, true);
  const collapseAll = () =>
    setExpanded(
      visibleRows.flatMap((row) => [row.key, showAllDoneKey(row.key)]),
      false,
    );

  return (
    <section aria-labelledby="overview-epics-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2
          id="overview-epics-heading"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Epics
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
            {epicTotal}
          </span>
        </h2>
        {epicTotal > 0 && (
          <div className="flex items-center gap-1">
            <Button
              intent="ghost"
              size="sm"
              className="h-9 pointer-fine:h-8"
              onClick={expandAll}
              disabled={allExpanded || expandableKeys.length === 0}
            >
              Expand all
            </Button>
            <Button
              intent="ghost"
              size="sm"
              className="h-9 pointer-fine:h-8"
              onClick={collapseAll}
              disabled={noneExpanded}
            >
              Collapse all
            </Button>
          </div>
        )}
      </div>

      {epicTotal === 0 ? (
        <NoEpicsYet />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:w-64">
              <label htmlFor={searchId} className="sr-only">
                Filter epics by name
              </label>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={flushQuery}
                placeholder="Filter epics by name"
                autoComplete="off"
                enterKeyHint="search"
                className="h-10 w-full rounded-md border border-input-border bg-background pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:[color-scheme:dark]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {projects.length > 1 && (
                <div role="group" aria-label="Projects to show" className="flex flex-wrap items-center gap-2">
                  {projects.map((project) => (
                    <FilterChip
                      key={project.id}
                      pressed={!hiddenProjects.has(project.id)}
                      onClick={() => toggleProject(project.id)}
                    >
                      {project.name}
                    </FilterChip>
                  ))}
                </div>
              )}
              {projects.length > 1 && (
                <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
              )}
              <FilterChip pressed={hideFinished} onClick={toggleHideFinished}>
                Hide finished epics
              </FilterChip>
            </div>
          </div>

          <p role="status" className="sr-only">
            {filtersActive
              ? `Showing ${pluralize(visibleEpicCount, "epic")} of ${epicTotal}`
              : ""}
          </p>

          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No epics match your filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try another name, or show more projects.
              </p>
              <Button intent="secondary" size="sm" className="mt-4 h-9" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map(({ project, rows }) => (
                <ProjectGroup
                  key={project.id}
                  project={project}
                  rows={rows}
                  expandedKeys={expandedKeys}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ProjectGroup({
  project,
  rows,
  expandedKeys,
}: VisibleGroup & { expandedKeys: ReadonlySet<string> }) {
  const headingId = `overview-group-${project.id}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="min-w-0 text-base font-semibold text-foreground [overflow-wrap:anywhere]">
          <Link
            href={`/projects/${project.id}/board`}
            className={`inline-flex min-h-9 items-center rounded hover:underline pointer-fine:min-h-0 ${focusRingClass}`}
          >
            {project.name}
          </Link>
        </h3>
        <span className="text-xs text-muted-foreground">
          {pluralize(project.epicCount, "epic")}
        </span>
      </div>

      {project.epics.length === 0 && (
        <p className="mb-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          No epics in this project yet.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background shadow-sm">
          {rows.map((row) => (
            <EpicRow
              key={row.key}
              epic={row}
              expanded={expandedKeys.has(row.key)}
              showAllDone={expandedKeys.has(showAllDoneKey(row.key))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm transition-colors pointer-fine:h-8 ${focusRingClass} ${
        pressed
          ? "border-primary/40 bg-primary/10 font-medium text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {pressed ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <circle cx="12" cy="12" r="7" />}
      </svg>
      <span className="truncate">{children}</span>
    </button>
  );
}

function NoEpicsYet() {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
      <div
        aria-hidden="true"
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" />
          <path d="m3.5 12 8.5 4.5 8.5-4.5" />
          <path d="m3.5 16 8.5 4.5 8.5-4.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground">No epics yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Epics group related issues across sprints and show how far along each piece of work is.
        Create one with the <span className="font-medium text-foreground">+</span> next to
        “Epics” in the sidebar (on phones, open the menu first), then assign issues to it.
      </p>
    </div>
  );
}
