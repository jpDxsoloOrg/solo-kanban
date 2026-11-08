/**
 * Overview filters live in the URL so a reload or the back button keeps them:
 *   hide=<projectId>,<projectId>  projects switched off (default: all shown)
 *   hideFinished=1                 hide epics that are 100% done
 *   q=<text>                       epic name contains (case-insensitive)
 */

export const PARAM_HIDDEN_PROJECTS = "hide";
export const PARAM_HIDE_FINISHED = "hideFinished";
export const PARAM_QUERY = "q";

export interface OverviewFilters {
  hiddenProjects: ReadonlySet<string>;
  hideFinished: boolean;
  query: string;
}

interface ReadableParams {
  get(name: string): string | null;
}

export function parseFilters(params: ReadableParams): OverviewFilters {
  const hidden = params.get(PARAM_HIDDEN_PROJECTS);
  return {
    hiddenProjects: new Set(hidden ? hidden.split(",").filter(Boolean) : []),
    hideFinished: params.get(PARAM_HIDE_FINISHED) === "1",
    query: params.get(PARAM_QUERY) ?? "",
  };
}

/** Normalized form of a name filter, for matching. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesQuery(name: string, normalizedQuery: string): boolean {
  return normalizedQuery === "" || name.toLowerCase().includes(normalizedQuery);
}

/**
 * Applies changes to the current URL's overview params without a navigation.
 * Next.js syncs `history.replaceState` with `useSearchParams`, and no server
 * request is made. Other params are left alone.
 */
export function replaceFilterParams(changes: Record<string, string | null>): void {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null || value === "") url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  if (url.href !== window.location.href) {
    // Pass null, not history.state: Next.js copies its own state over, and
    // only syncs the router for calls that don't carry that state already.
    window.history.replaceState(null, "", url);
  }
}
