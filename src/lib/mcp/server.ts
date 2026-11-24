import "server-only";
import { NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import * as projectsRoute from "@/app/api/v1/projects/route";
import * as projectRoute from "@/app/api/v1/projects/[projectId]/route";
import * as issuesRoute from "@/app/api/v1/projects/[projectId]/issues/route";
import * as issueRoute from "@/app/api/v1/projects/[projectId]/issues/[number]/route";
import * as commentsRoute from "@/app/api/v1/projects/[projectId]/issues/[number]/comments/route";
import * as epicsRoute from "@/app/api/v1/projects/[projectId]/epics/route";
import * as sprintsRoute from "@/app/api/v1/projects/[projectId]/sprints/route";
import * as sprintStartRoute from "@/app/api/v1/projects/[projectId]/sprints/[sprintId]/start/route";
import * as sprintCompleteRoute from "@/app/api/v1/projects/[projectId]/sprints/[sprintId]/complete/route";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, SPRINT_STATUSES } from "@/lib/api/resources";

/**
 * The Solo Kanban MCP server (served at /api/mcp).
 *
 * Every tool calls the matching public REST handler (/api/v1) in-process,
 * so validation, ordering, sprint locks and parent/child rules are exactly
 * the REST API's. Tools return the REST response's `data` as JSON text; REST
 * errors become tool errors with the same message.
 */

/** A REST route handler as exported by `apiRoute`. */
type RouteHandler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>;

/** What every tool call needs to reach the REST handlers. */
export interface McpCallContext {
  /** Origin of the incoming MCP request, used to build in-process URLs. */
  origin: string;
  /** The caller's auth headers, passed through so the REST layer authenticates them too. */
  authHeaders: Record<string, string>;
}

type Query = Record<string, string | number | boolean | string[] | undefined>;

async function callRoute<P extends Record<string, string>>(
  ctx: McpCallContext,
  handler: RouteHandler<P> | undefined,
  path: string,
  params: P,
  { method = "GET", query, body }: { method?: string; query?: Query; body?: Record<string, unknown> } = {},
): Promise<CallToolResult> {
  if (!handler) throw new Error(`No ${method} handler for ${path}`);

  const url = new URL(`/api/v1${path}`, ctx.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  // Only send fields the caller set: undefined means "leave unchanged".
  const payload = body && Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const req = new NextRequest(url, {
    method,
    headers: { ...ctx.authHeaders, ...(payload && { "Content-Type": "application/json" }) },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const res = await handler(req, { params: Promise.resolve(params) });
  const text = res.status === 204 ? "" : await res.text();
  let json: { data?: unknown; pagination?: unknown; error?: { code?: string; message?: string } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Not JSON: fall through with the raw text.
  }

  if (!res.ok) {
    const message = json.error?.message ?? (text || res.statusText);
    return { isError: true, content: [{ type: "text", text: `Error ${res.status}: ${message}` }] };
  }
  const result =
    res.status === 204
      ? { ok: true }
      : json.pagination
        ? { data: json.data, pagination: json.pagination }
        : json.data;
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

// ---------------------------------------------------------------------------
// Shared argument schemas
// ---------------------------------------------------------------------------

const projectId = z.string().min(1).describe("Project id (from list_projects).");
const issueNumber = z
  .number()
  .int()
  .min(1)
  .describe("The issue's number within its project, as shown on the board (e.g. 42 for #42).");
const status = z.enum(ISSUE_STATUSES).describe("Board column.");
const priority = z.enum(ISSUE_PRIORITIES);
const sprintRef = z
  .string()
  .nullable()
  .describe('A sprint id, "active" for the active sprint, or null for the backlog.');
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Calendar date, "YYYY-MM-DD".');

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const INSTRUCTIONS = `Solo Kanban is a personal kanban board. Work is organised as:
- Projects, each with epics (colored labels), sprints and issues.
- Issues are identified by their per-project number (#42) plus the project id. Statuses are board columns: OPEN, IN_PROGRESS, REVIEW, DONE. Priorities: LOW, MEDIUM, HIGH, URGENT.
- An issue is either in a sprint or in the backlog (sprint null). A project has at most one ACTIVE sprint, which is what the board shows; pass sprintId "active" to target it.
- Issues can have child issues (subtasks), one level deep: create one with parentNumber. A parent moves forward automatically when its children start or all finish.
- Comments are markdown and threaded one level deep.
Start with list_projects to find the project id. Prefer list_issues filters over fetching everything.`;

/** A fresh server per request: the endpoint is stateless. */
export function createMcpServer(ctx: McpCallContext): McpServer {
  const server = new McpServer(
    { name: "solo-kanban", title: "Solo Kanban", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_projects",
    { title: "List projects", description: "List all projects (id, name, description), oldest first.", annotations: READ_ONLY },
    () => callRoute(ctx, projectsRoute.GET, "/projects", {}),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "A project with its active sprint and issue counts by status.",
      inputSchema: { projectId },
      annotations: READ_ONLY,
    },
    (args) => callRoute(ctx, projectRoute.GET, `/projects/${args.projectId}`, { projectId: args.projectId }),
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: 'Create a project. It starts with an active "Sprint 1".',
      inputSchema: {
        name: z.string().min(1).max(200),
        description: z.string().max(5000).nullable().optional(),
      },
      annotations: WRITE,
    },
    (args) => callRoute(ctx, projectsRoute.POST, "/projects", {}, { method: "POST", body: args }),
  );

  // -------------------------------------------------------------------------
  // Issues
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "List a project's issues by number, with optional filters. Returns { data, pagination }; page with limit/offset.",
      inputSchema: {
        projectId,
        status: z.array(status).optional().describe("Only these statuses."),
        priority: z.array(priority).optional().describe("Only these priorities."),
        sprint: z.string().optional().describe('"active", "backlog" or a sprint id.'),
        epicId: z.string().optional().describe('An epic id, or "none" for issues without an epic.'),
        q: z.string().optional().describe("Case-insensitive text to find in titles."),
        parent: z.number().int().min(1).optional().describe("Only the children (subtasks) of this issue number."),
        topLevel: z.boolean().optional().describe("Only issues that aren't children."),
        includeChildren: z
          .boolean()
          .optional()
          .describe("With topLevel: follow each issue with all of its children."),
        limit: z.number().int().min(1).max(500).optional().describe("Page size (default 100)."),
        offset: z.number().int().min(0).optional(),
      },
      annotations: READ_ONLY,
    },
    ({ projectId, ...query }) =>
      callRoute(ctx, issuesRoute.GET, `/projects/${projectId}/issues`, { projectId }, { query }),
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get issue",
      description: "One issue by number: details, epic, sprint, children and (by default) its comment threads.",
      inputSchema: {
        projectId,
        number: issueNumber,
        includeComments: z.boolean().optional().describe("Include comments (default true)."),
      },
      annotations: READ_ONLY,
    },
    async ({ projectId, number, includeComments = true }) => {
      const params = { projectId, number: String(number) };
      const path = `/projects/${projectId}/issues/${number}`;
      const issue = await callRoute(ctx, issueRoute.GET, path, params);
      if (issue.isError || !includeComments) return issue;
      const comments = await callRoute(ctx, commentsRoute.GET, `${path}/comments`, params);
      if (comments.isError) return comments;
      const read = (r: CallToolResult) => JSON.parse((r.content[0] as { text: string }).text);
      return {
        content: [{ type: "text", text: JSON.stringify({ ...read(issue), comments: read(comments) }, null, 2) }],
      };
    },
  );

  const issueFields = {
    title: z.string().min(1).max(500),
    description: z.string().max(100_000).nullable().optional().describe("Markdown."),
    status: status.optional(),
    priority: priority.optional(),
    epicId: z.string().nullable().optional().describe("An epic id (from list_epics); null for none."),
    sprintId: sprintRef.optional(),
    parentNumber: z
      .number()
      .int()
      .min(1)
      .nullable()
      .optional()
      .describe("Make it a child (subtask) of this issue number."),
    childOrder: z.number().int().min(0).optional().describe("Position among the parent's children, 0-based."),
  };

  server.registerTool(
    "create_issue",
    {
      title: "Create issue",
      description:
        "Create an issue at the end of its column. Omit sprintId for the backlog (a child issue defaults to its " +
        "parent's sprint and epic). Use sprintId \"active\" to put it on the board.",
      inputSchema: { projectId, ...issueFields },
      annotations: WRITE,
    },
    ({ projectId, ...body }) =>
      callRoute(ctx, issuesRoute.POST, `/projects/${projectId}/issues`, { projectId }, { method: "POST", body }),
  );

  server.registerTool(
    "update_issue",
    {
      title: "Update issue",
      description:
        "Change an issue: title, description, status (moves it between board columns), priority, epic, sprint " +
        "(\"active\", a sprint id, or null for the backlog), or parent. Send only the fields to change.",
      inputSchema: { projectId, number: issueNumber, ...issueFields, title: issueFields.title.optional() },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ projectId, number, ...body }) =>
      callRoute(
        ctx,
        issueRoute.PATCH,
        `/projects/${projectId}/issues/${number}`,
        { projectId, number: String(number) },
        { method: "PATCH", body },
      ),
  );

  server.registerTool(
    "delete_issue",
    {
      title: "Delete issue",
      description:
        "Permanently delete an issue and its comments. If it has child issues, `children` must say what happens " +
        'to them: "detach" keeps them as top-level issues, "delete" deletes them too.',
      inputSchema: { projectId, number: issueNumber, children: z.enum(["detach", "delete"]).optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ projectId, number, children }) => {
      const result = await callRoute(
        ctx,
        issueRoute.DELETE,
        `/projects/${projectId}/issues/${number}`,
        { projectId, number: String(number) },
        { method: "DELETE", query: { children } },
      );
      // The REST message names its query parameter; say it in tool terms.
      for (const part of result.content) {
        if (part.type === "text") part.text = part.text.replace(/\?children=(detach|delete)/g, 'children: "$1"');
      }
      return result;
    },
  );

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  server.registerTool(
    "add_comment",
    {
      title: "Add comment",
      description: "Add a markdown comment to an issue, or a reply to a comment with parentId.",
      inputSchema: {
        projectId,
        number: issueNumber,
        body: z.string().min(1).max(10_000).describe("Markdown."),
        parentId: z.string().optional().describe("Comment id to reply to."),
      },
      annotations: WRITE,
    },
    ({ projectId, number, ...body }) =>
      callRoute(
        ctx,
        commentsRoute.POST,
        `/projects/${projectId}/issues/${number}/comments`,
        { projectId, number: String(number) },
        { method: "POST", body },
      ),
  );

  // -------------------------------------------------------------------------
  // Epics
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_epics",
    { title: "List epics", description: "A project's epics (id, name, color).", inputSchema: { projectId }, annotations: READ_ONLY },
    ({ projectId }) => callRoute(ctx, epicsRoute.GET, `/projects/${projectId}/epics`, { projectId }),
  );

  server.registerTool(
    "create_epic",
    {
      title: "Create epic",
      description: "Create an epic (a colored label that groups issues).",
      inputSchema: {
        projectId,
        name: z.string().min(1).max(200),
        description: z.string().max(5000).nullable().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color, e.g. "#6366f1".'),
      },
      annotations: WRITE,
    },
    ({ projectId, ...body }) =>
      callRoute(ctx, epicsRoute.POST, `/projects/${projectId}/epics`, { projectId }, { method: "POST", body }),
  );

  // -------------------------------------------------------------------------
  // Sprints
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_sprints",
    {
      title: "List sprints",
      description: "A project's sprints: active first, then planned, then completed (newest first).",
      inputSchema: { projectId, status: z.enum(SPRINT_STATUSES).optional() },
      annotations: READ_ONLY,
    },
    ({ projectId, status }) =>
      callRoute(ctx, sprintsRoute.GET, `/projects/${projectId}/sprints`, { projectId }, { query: { status } }),
  );

  server.registerTool(
    "create_sprint",
    {
      title: "Create sprint",
      description: 'Create a PLANNED sprint. Name defaults to "Sprint N".',
      inputSchema: {
        projectId,
        name: z.string().min(1).max(120).optional(),
        goal: z.string().max(2000).nullable().optional(),
        startDate: calendarDate.nullable().optional(),
        endDate: calendarDate.nullable().optional(),
      },
      annotations: WRITE,
    },
    ({ projectId, ...body }) =>
      callRoute(ctx, sprintsRoute.POST, `/projects/${projectId}/sprints`, { projectId }, { method: "POST", body }),
  );

  server.registerTool(
    "start_sprint",
    {
      title: "Start sprint",
      description:
        "Start a PLANNED sprint so it shows on the board. Fails if another sprint is active. Start defaults to " +
        "today, end to 14 days later.",
      inputSchema: {
        projectId,
        sprintId: z.string().min(1),
        startDate: calendarDate.optional(),
        endDate: calendarDate.optional(),
      },
      annotations: WRITE,
    },
    ({ projectId, sprintId, ...body }) =>
      callRoute(
        ctx,
        sprintStartRoute.POST,
        `/projects/${projectId}/sprints/${sprintId}/start`,
        { projectId, sprintId },
        { method: "POST", body },
      ),
  );

  server.registerTool(
    "complete_sprint",
    {
      title: "Complete sprint",
      description:
        "Complete the ACTIVE sprint. DONE issues stay with it; unfinished ones move to moveIncompleteTo: " +
        '"new" (a new sprint), "backlog", or a planned sprint\'s id. startNext starts that sprint right away.',
      inputSchema: {
        projectId,
        sprintId: z.string().min(1),
        moveIncompleteTo: z.string().min(1).describe('"new", "backlog", or a planned sprint id.'),
        startNext: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    ({ projectId, sprintId, ...body }) =>
      callRoute(
        ctx,
        sprintCompleteRoute.POST,
        `/projects/${projectId}/sprints/${sprintId}/complete`,
        { projectId, sprintId },
        { method: "POST", body },
      ),
  );

  return server;
}
