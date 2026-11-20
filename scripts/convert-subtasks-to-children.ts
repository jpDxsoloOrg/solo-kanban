/**
 * Convert legacy checklist subtasks into child issues, through the public API.
 *
 *   npx tsx scripts/convert-subtasks-to-children.ts --api <base> (--project <id>… | --all-projects) [options]
 *
 * --api <base>           API base URL, e.g. http://localhost:3000/api/v1 (required, no default,
 *                        so it is always clear which server is being changed)
 * --project <id>         a project to convert (repeatable)
 * --all-projects         every project
 * --dry-run              print what would happen; no writes
 * --verify               check every converted subtask against its child issue; no writes
 * --delete-old           delete legacy subtasks whose child issue exists and matches
 * --state <file>         progress file (default: ./subtask-conversion-state.json)
 * --delay-ms <n>         pause after each write (default 250)
 * --unticked-under-done <open|done|skip>
 *                        unticked subtasks of DONE parents archived with a completed sprint:
 *                        open = Open child in the backlog (default, faithful), done = Done child
 *                        archived with the parent, skip = leave them unconverted
 *
 * The API key comes from KANBAN_API_KEY (or SOLO_KANBAN_API_KEY), else the
 * "apiKey" in ~/.config/solo-kanban/config.json. It is never printed.
 *
 * For each issue with checklist subtasks, in checklist order, it creates a
 * child issue: title and description from the subtask, Done if ticked else
 * Open, the parent's priority, and (inherited by the API) the parent's sprint
 * and epic. Every write sends `X-Skip-Parent-Auto-Move: true`, so parents keep
 * their status.
 *
 * Idempotent and resumable: each subtask id → child number mapping is saved
 * to the state file right after the child is created, and mapped subtasks
 * are skipped on later runs. If a run dies between creating a child and
 * saving the mapping, the next run adopts the parent's existing unmapped
 * child with the same title instead of creating a duplicate.
 *
 * Old subtasks are never deleted by the conversion itself; `--delete-old` is
 * a separate step that only deletes a subtask when its child issue exists,
 * still belongs to the same parent and has the same title and description.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------- types

type Status = "OPEN" | "IN_PROGRESS" | "REVIEW" | "DONE";

interface ApiSubtask {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  order: number;
}

interface ApiIssue {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: Status;
  priority: string;
  sprint: { id: string; name: string; status: string } | null;
  epic: { id: string; name: string } | null;
  subtasks: ApiSubtask[];
  parent?: { number: number; title: string } | null;
  children?: { number: number; title: string; status: Status; order: number }[];
}

interface Mapping {
  projectId: string;
  parentNumber: number;
  childNumber: number;
  title: string;
  /** "created" by this script, or "adopted" (found after an interrupted run). */
  how: "created" | "adopted";
  at: string;
}

interface StateFile {
  version: 1;
  api: string;
  entries: Record<string, Mapping>;
  /** Subtasks deleted by --delete-old. */
  deleted: Record<string, string>;
}

type UntickedUnderDone = "open" | "done" | "skip";

interface Options {
  api: string;
  projects: string[];
  allProjects: boolean;
  dryRun: boolean;
  verify: boolean;
  deleteOld: boolean;
  statePath: string;
  delayMs: number;
  untickedUnderDone: UntickedUnderDone;
}

// ---------------------------------------------------------------- args

function usage(message?: string): never {
  if (message) console.error(`error: ${message}\n`);
  const header = readFileSync(process.argv[1], "utf8").split("*/")[0];
  console.error(header.replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(message ? 1 : 0);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    api: "",
    projects: [],
    allProjects: false,
    dryRun: false,
    verify: false,
    deleteOld: false,
    statePath: resolve("subtask-conversion-state.json"),
    delayMs: 250,
    untickedUnderDone: "open",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) usage(`${arg} needs a value`);
      return next;
    };
    switch (arg) {
      case "--api": options.api = value().replace(/\/+$/, ""); break;
      case "--project": options.projects.push(value()); break;
      case "--all-projects": options.allProjects = true; break;
      case "--dry-run": options.dryRun = true; break;
      case "--verify": options.verify = true; break;
      case "--delete-old": options.deleteOld = true; break;
      case "--state": options.statePath = resolve(value()); break;
      case "--delay-ms": {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 0) usage("--delay-ms must be a whole number");
        options.delayMs = n;
        break;
      }
      case "--unticked-under-done": {
        const v = value();
        if (v !== "open" && v !== "done" && v !== "skip") usage("--unticked-under-done must be open, done or skip");
        options.untickedUnderDone = v;
        break;
      }
      case "-h": case "--help": usage();
      default: usage(`unknown argument ${arg}`);
    }
  }
  if (!options.api) usage("--api is required (e.g. http://localhost:3000/api/v1)");
  if (!/\/v1$/.test(options.api)) usage("--api must end in /api/v1");
  if (!options.allProjects && options.projects.length === 0) usage("pass --project <id> or --all-projects");
  if ([options.dryRun, options.verify, options.deleteOld].filter(Boolean).length > 1) {
    usage("--dry-run, --verify and --delete-old are separate steps; pick one");
  }
  return options;
}

function apiKey(): string {
  const fromEnv = process.env.KANBAN_API_KEY || process.env.SOLO_KANBAN_API_KEY;
  if (fromEnv) return fromEnv;
  const configPath = join(homedir(), ".config", "solo-kanban", "config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { apiKey?: string };
    if (config.apiKey) return config.apiKey;
  }
  console.error("error: no API key. Set KANBAN_API_KEY.");
  process.exit(1);
}

// ---------------------------------------------------------------- http

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

class Api {
  constructor(
    private readonly base: string,
    private readonly key: string,
    private readonly delayMs: number,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const write = method !== "GET";
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(this.base + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": "application/json" }),
          // Converting must not move any parent.
          ...(write && { "X-Skip-Parent-Auto-Move": "true" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
        } catch {
          // Not JSON: keep the raw text.
        }
        throw new Error(`${method} ${path} -> ${res.status}: ${message}`);
      }
      if (write && this.delayMs > 0) await sleep(this.delayMs);
      return (text ? (JSON.parse(text) as { data: T }).data : undefined) as T;
    }
  }

  async listAll<T>(path: string): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += 50) {
      const sep = path.includes("?") ? "&" : "?";
      const page = await this.request<T[]>("GET", `${path}${sep}limit=50&offset=${offset}`);
      all.push(...page);
      if (page.length < 50) return all;
    }
  }
}

// ---------------------------------------------------------------- state

function loadState(path: string, api: string): StateFile {
  if (!existsSync(path)) return { version: 1, api, entries: {}, deleted: {} };
  const state = JSON.parse(readFileSync(path, "utf8")) as StateFile;
  if (state.api !== api) {
    console.error(`error: ${path} belongs to ${state.api}, not ${api}. Use another --state file.`);
    process.exit(1);
  }
  state.deleted ??= {};
  return state;
}

function saveState(path: string, state: StateFile) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, path);
}

// ---------------------------------------------------------------- helpers

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim() === (b ?? "").trim();

const isArchived = (issue: ApiIssue) => issue.status === "DONE" && issue.sprint?.status === "COMPLETED";

/** The child's status for a subtask, or null to skip it. */
function childStatus(parent: ApiIssue, subtask: ApiSubtask, opts: Options): Status | null {
  if (subtask.completed) return "DONE";
  if (!isArchived(parent)) return "OPEN";
  if (opts.untickedUnderDone === "skip") return null;
  return opts.untickedUnderDone === "done" ? "DONE" : "OPEN";
}

/** Child issue fields for a subtask. Titles over 90 characters are shortened at a word
 *  boundary; the full original title then leads the description so nothing is lost. */
const TITLE_MAX = 90;
function childFields(subtask: { title: string; description?: string | null }): { title: string; description: string | null } {
  const full = subtask.title.trim();
  if (full.length <= TITLE_MAX) return { title: full, description: subtask.description ?? null };
  const flat = full.replace(/\s+/g, " ");
  let cut = flat.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  if (space > 40) cut = cut.slice(0, space);
  const title = cut.replace(/[\s,;:.(\-`*]+$/, "") + "…";
  const description = subtask.description ? `${full}\n\n${subtask.description}` : full;
  return { title, description };
}

async function projectIds(api: Api, opts: Options): Promise<string[]> {
  if (!opts.allProjects) return opts.projects;
  const projects = await api.request<{ id: string; name: string }[]>("GET", "/projects");
  return projects.map((project) => project.id);
}

// ---------------------------------------------------------------- steps

async function convert(api: Api, opts: Options, state: StateFile) {
  const totals = {
    parents: 0, subtasks: 0, ticked: 0, alreadyConverted: 0, toCreate: 0, created: 0, adopted: 0,
    skippedArchivedUnticked: 0, archivedUnticked: 0, failed: 0,
  };

  for (const projectId of await projectIds(api, opts)) {
    const issues = await api.listAll<ApiIssue>(`/projects/${projectId}/issues`);
    const parents = issues.filter((issue) => issue.subtasks.length > 0);
    console.log(`project ${projectId}: ${issues.length} issues, ${parents.length} with checklist subtasks`);

    for (const parent of parents) {
      totals.parents++;
      const subtasks = [...parent.subtasks].sort((a, b) => a.order - b.order);
      // Unmapped children with these titles may be from an interrupted run.
      const mappedChildren = new Set(
        Object.values(state.entries)
          .filter((entry) => entry.projectId === projectId && entry.parentNumber === parent.number)
          .map((entry) => entry.childNumber),
      );
      const adoptable = (parent.children ?? []).filter((child) => !mappedChildren.has(child.number));

      for (const subtask of subtasks) {
        totals.subtasks++;
        if (subtask.completed) totals.ticked++;
        if (state.entries[subtask.id]) {
          totals.alreadyConverted++;
          continue;
        }
        if (!subtask.completed && isArchived(parent)) totals.archivedUnticked++;
        const status = childStatus(parent, subtask, opts);
        if (!status) {
          totals.skippedArchivedUnticked++;
          continue;
        }
        totals.toCreate++;
        const label = `#${parent.number} "${subtask.title}" -> ${status}`;
        if (opts.dryRun) continue;

        if (parent.parent) {
          totals.failed++;
          console.error(`  skip ${label}: #${parent.number} is itself a subtask of #${parent.parent.number}`);
          continue;
        }

        const orphanIndex = adoptable.findIndex((child) => child.title === childFields(subtask).title);
        if (orphanIndex !== -1) {
          const [orphan] = adoptable.splice(orphanIndex, 1);
          state.entries[subtask.id] = {
            projectId, parentNumber: parent.number, childNumber: orphan.number,
            title: subtask.title, how: "adopted", at: new Date().toISOString(),
          };
          saveState(opts.statePath, state);
          totals.adopted++;
          console.log(`  adopted #${orphan.number} for ${label}`);
          continue;
        }

        try {
          const child = await api.request<ApiIssue>("POST", `/projects/${projectId}/issues`, {
            ...childFields(subtask),
            status,
            priority: parent.priority,
            parentNumber: parent.number,
            // Sprint and epic are inherited from the parent by the API.
          });
          state.entries[subtask.id] = {
            projectId, parentNumber: parent.number, childNumber: child.number,
            title: subtask.title, how: "created", at: new Date().toISOString(),
          };
          saveState(opts.statePath, state);
          totals.created++;
          console.log(`  created #${child.number} for ${label}`);
        } catch (error) {
          totals.failed++;
          console.error(`  FAILED ${label}: ${(error as Error).message}`);
        }
      }
    }
  }

  console.log("");
  console.log(opts.dryRun ? "DRY RUN (nothing written)" : "conversion done");
  console.log(`  parents with checklists:      ${totals.parents}`);
  console.log(`  checklist subtasks:           ${totals.subtasks} (${totals.ticked} ticked)`);
  console.log(`  already converted (state):    ${totals.alreadyConverted}`);
  console.log(`  unticked under archived DONE: ${totals.archivedUnticked} (--unticked-under-done=${opts.untickedUnderDone})`);
  console.log(`  ${opts.dryRun ? "would create:" : "to create:   "}                 ${totals.toCreate}`);
  if (totals.skippedArchivedUnticked) console.log(`  skipped (archived, unticked): ${totals.skippedArchivedUnticked}`);
  if (!opts.dryRun) {
    console.log(`  created: ${totals.created}  adopted: ${totals.adopted}  failed: ${totals.failed}`);
    console.log(`  state file: ${opts.statePath}`);
  }
  if (totals.failed) process.exitCode = 2;
}

/** Check each mapping; with `remove`, delete the legacy subtask when it matches. */
async function verifyOrDelete(api: Api, opts: Options, state: StateFile, remove: boolean) {
  const totals = { checked: 0, ok: 0, mismatched: 0, gone: 0, deleted: 0, unconverted: 0 };
  const projects = new Set(await projectIds(api, opts));

  for (const projectId of projects) {
    const issues = await api.listAll<ApiIssue>(`/projects/${projectId}/issues`);
    const byNumber = new Map(issues.map((issue) => [issue.number, issue]));

    for (const parent of issues.filter((issue) => issue.subtasks.length > 0)) {
      for (const subtask of parent.subtasks) {
        const entry = state.entries[subtask.id];
        if (!entry) {
          totals.unconverted++;
          console.log(`  not converted yet: #${parent.number} "${subtask.title}" (${subtask.id})`);
          continue;
        }
        totals.checked++;
        const child = byNumber.get(entry.childNumber);
        const problems: string[] = [];
        if (!child) problems.push(`child #${entry.childNumber} doesn't exist`);
        else {
          if (child.parent?.number !== parent.number) {
            problems.push(`child #${child.number}'s parent is ${child.parent ? `#${child.parent.number}` : "none"}`);
          }
          if (child.title !== childFields(subtask).title && child.title !== subtask.title.trim()) problems.push(`title differs ("${child.title}")`);
          if (!sameText(child.description, subtask.description) && !sameText(child.description, childFields(subtask).description)) problems.push("description differs");
        }
        if (problems.length > 0) {
          totals.mismatched++;
          console.log(`  MISMATCH #${parent.number} "${subtask.title}": ${problems.join("; ")}`);
          continue;
        }
        totals.ok++;
        if (!remove) continue;
        try {
          await api.request("DELETE", `/projects/${projectId}/issues/${parent.number}/subtasks/${subtask.id}`);
          state.deleted[subtask.id] = new Date().toISOString();
          saveState(opts.statePath, state);
          totals.deleted++;
          console.log(`  deleted old subtask "${subtask.title}" of #${parent.number} (child #${entry.childNumber})`);
        } catch (error) {
          console.error(`  FAILED to delete ${subtask.id}: ${(error as Error).message}`);
          process.exitCode = 2;
        }
      }
    }
    // Mapped subtasks that no longer exist were deleted already.
    for (const [subtaskId, entry] of Object.entries(state.entries)) {
      if (entry.projectId !== projectId) continue;
      const parent = byNumber.get(entry.parentNumber);
      if (!parent?.subtasks.some((subtask) => subtask.id === subtaskId)) totals.gone++;
    }
  }

  console.log("");
  console.log(remove ? "delete-old done" : "verify done");
  console.log(`  mapped subtasks checked: ${totals.checked}  match: ${totals.ok}  mismatch: ${totals.mismatched}`);
  console.log(`  not converted yet:       ${totals.unconverted}`);
  console.log(`  already deleted:         ${totals.gone}`);
  if (remove) console.log(`  deleted now:             ${totals.deleted}`);
  if (totals.mismatched || (!remove && totals.unconverted)) process.exitCode = 2;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const state = loadState(opts.statePath, opts.api);
  const api = new Api(opts.api, apiKey(), opts.delayMs);
  console.log(`API: ${opts.api}`);

  if (opts.verify) await verifyOrDelete(api, opts, state, false);
  else if (opts.deleteOld) await verifyOrDelete(api, opts, state, true);
  else await convert(api, opts, state);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
