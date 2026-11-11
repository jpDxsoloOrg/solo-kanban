import { MAX_COMMENT_LENGTH, MAX_SPRINT_GOAL_LENGTH, MAX_SPRINT_NAME_LENGTH } from "@/lib/limits";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  MAX_EPIC_NAME_LENGTH,
  MAX_ISSUE_DESCRIPTION_LENGTH,
  MAX_ISSUE_TITLE_LENGTH,
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_SUBTASK_TITLE_LENGTH,
  SPRINT_STATUSES,
} from "@/lib/api/resources";

/**
 * OpenAPI 3.1 description of the public API, served at
 * /api/v1/openapi.json and rendered by Swagger UI at /api/docs.
 * Keep it in step with the handlers under src/app/api/v1.
 */

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const str = (extra: Schema = {}): Schema => ({ type: "string", ...extra });
const dateTime = str({ format: "date-time" });
const calendarDate = str({ format: "date", example: "2026-11-11" });

function json(schema: Schema) {
  return { "application/json": { schema } };
}

function dataOf(schema: Schema, extra: Schema = {}) {
  return json({ type: "object", required: ["data"], properties: { data: schema, ...extra } });
}

const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((code) => [String(code), { $ref: `#/components/responses/E${code}` }]));

function body(schema: Schema, required = true) {
  return { required, content: json(schema) };
}

function op(
  tag: string,
  summary: string,
  responses: Record<string, unknown>,
  extra: Schema = {},
) {
  return { tags: [tag], summary, responses: { ...responses, ...errors(401) }, ...extra };
}

const param = (name: string, description: string, schema: Schema = str()) => ({
  name,
  in: "path",
  required: true,
  description,
  schema,
});
const projectId = param("projectId", "Project id.");
const issueNumber = param("number", "The issue's number within its project (as shown on the board, e.g. 42).", {
  type: "integer",
  minimum: 1,
});
const query = (name: string, description: string, schema: Schema = str()) => ({
  name,
  in: "query",
  required: false,
  description,
  schema,
});

const sprintRef = str({
  description: 'A sprint id, `"active"` for the active sprint, or null for the backlog.',
});

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Solo Kanban API",
      version: "1.0.0",
      description: [
        "Read and change projects, issues, comments, subtasks, epics and sprints.",
        "",
        "**Authentication:** every request needs an API key, sent as `Authorization: Bearer <key>` " +
          "(or `X-API-Key: <key>`). Keys are configured on the server in the `API_KEYS` environment variable. " +
          "Click **Authorize** to set yours for the *Try it out* buttons.",
        "",
        "**Responses:** successes are `{ \"data\": ... }`; errors are `{ \"error\": { \"code\", \"message\" } }`.",
        "Issues are addressed by their per-project **number**. Enum values are case-insensitive on input.",
      ].join("\n"),
    },
    servers: [{ url: "/api/v1" }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    tags: [
      { name: "Projects" },
      { name: "Issues" },
      { name: "Comments" },
      { name: "Subtasks" },
      { name: "Epics" },
      { name: "Sprints" },
    ],
    paths: {
      "/projects": {
        get: op("Projects", "List projects", { 200: { description: "Projects, oldest first.", content: dataOf({ type: "array", items: ref("Project") }) } }),
        post: op(
          "Projects",
          "Create a project",
          { 201: { description: "Created. The project starts with an active Sprint 1.", content: dataOf(ref("Project")) }, ...errors(400) },
          {
            requestBody: body({
              type: "object",
              required: ["name"],
              additionalProperties: false,
              properties: {
                name: str({ maxLength: MAX_PROJECT_NAME_LENGTH, example: "Website relaunch" }),
                description: nullable(str({ maxLength: MAX_PROJECT_DESCRIPTION_LENGTH })),
                today: { ...calendarDate, description: "Your calendar date; Sprint 1 starts on it. Defaults to today (UTC)." },
              },
            }),
          },
        ),
      },
      "/projects/{projectId}": {
        parameters: [projectId],
        get: op("Projects", "Get a project", { 200: { description: "The project with its active sprint and issue counts.", content: dataOf(ref("ProjectDetail")) }, ...errors(404) }),
        patch: op(
          "Projects",
          "Update a project",
          { 200: { description: "Updated.", content: dataOf(ref("Project")) }, ...errors(400, 404) },
          {
            requestBody: body({
              type: "object",
              additionalProperties: false,
              properties: {
                name: str({ maxLength: MAX_PROJECT_NAME_LENGTH }),
                description: nullable(str({ maxLength: MAX_PROJECT_DESCRIPTION_LENGTH })),
              },
            }),
          },
        ),
        delete: op("Projects", "Delete a project and everything in it", { 204: { description: "Deleted." }, ...errors(404) }),
      },
      "/projects/{projectId}/issues": {
        parameters: [projectId],
        get: op(
          "Issues",
          "List issues",
          {
            200: {
              description: "Issues by number.",
              content: dataOf({ type: "array", items: ref("Issue") }, { pagination: ref("Pagination") }),
            },
            ...errors(400, 404),
          },
          {
            parameters: [
              query("status", "Comma-separated statuses, e.g. `OPEN,IN_PROGRESS`.", str({ example: "OPEN,IN_PROGRESS" })),
              query("priority", "Comma-separated priorities.", str({ example: "HIGH,URGENT" })),
              query("sprint", '`"active"`, `"backlog"` or a sprint id.'),
              query("epicId", 'An epic id, or `"none"` for issues without an epic.'),
              query("q", "Case-insensitive text to find in titles."),
              query("limit", "Page size (max 500).", { type: "integer", minimum: 0, maximum: 500, default: 100 }),
              query("offset", "Issues to skip.", { type: "integer", minimum: 0, default: 0 }),
            ],
          },
        ),
        post: op(
          "Issues",
          "Create an issue",
          { 201: { description: "Created, at the end of its column.", content: dataOf(ref("Issue")) }, ...errors(400, 404, 409) },
          {
            requestBody: body({
              type: "object",
              required: ["title"],
              additionalProperties: false,
              properties: {
                title: str({ maxLength: MAX_ISSUE_TITLE_LENGTH, example: "Fix login redirect" }),
                description: nullable(str({ maxLength: MAX_ISSUE_DESCRIPTION_LENGTH, description: "Markdown." })),
                status: { ...ref("IssueStatus"), default: "OPEN" },
                priority: { ...ref("IssuePriority"), default: "MEDIUM" },
                epicId: nullable(str()),
                sprintId: nullable({ ...sprintRef, description: sprintRef.description + " Defaults to the backlog." }),
              },
            }),
          },
        ),
      },
      "/projects/{projectId}/issues/{number}": {
        parameters: [projectId, issueNumber],
        get: op("Issues", "Get an issue", { 200: { description: "The issue.", content: dataOf(ref("Issue")) }, ...errors(404) }),
        patch: op(
          "Issues",
          "Update an issue (title, description, status, priority, epic, sprint)",
          { 200: { description: "Updated.", content: dataOf(ref("Issue")) }, ...errors(400, 404, 409) },
          {
            description: "Send only the fields to change. A status change moves the issue to the end of its new column.",
            requestBody: body({
              type: "object",
              additionalProperties: false,
              properties: {
                title: str({ maxLength: MAX_ISSUE_TITLE_LENGTH }),
                description: nullable(str({ maxLength: MAX_ISSUE_DESCRIPTION_LENGTH })),
                status: ref("IssueStatus"),
                priority: ref("IssuePriority"),
                epicId: nullable(str({ description: "null removes the epic." })),
                sprintId: nullable(sprintRef),
              },
              example: { status: "IN_PROGRESS" },
            }),
          },
        ),
        delete: op("Issues", "Delete an issue", { 204: { description: "Deleted." }, ...errors(404) }),
      },
      "/projects/{projectId}/issues/{number}/comments": {
        parameters: [projectId, issueNumber],
        get: op("Comments", "List comments", { 200: { description: "Top-level comments with their replies, oldest first.", content: dataOf({ type: "array", items: ref("Comment") }) }, ...errors(404) }),
        post: op(
          "Comments",
          "Add a comment or reply",
          { 201: { description: "Created.", content: dataOf(ref("Comment")) }, ...errors(400, 404) },
          {
            requestBody: body({
              type: "object",
              required: ["body"],
              additionalProperties: false,
              properties: {
                body: str({ maxLength: MAX_COMMENT_LENGTH, description: "Markdown.", example: "Looks good to me." }),
                parentId: nullable(str({ description: "Reply to this comment. Threads are one level deep." })),
              },
            }),
          },
        ),
      },
      "/projects/{projectId}/issues/{number}/comments/{commentId}": {
        parameters: [projectId, issueNumber, param("commentId", "Comment id.")],
        patch: op(
          "Comments",
          "Edit a comment",
          { 200: { description: "Updated.", content: dataOf(ref("Comment")) }, ...errors(400, 404) },
          {
            requestBody: body({
              type: "object",
              required: ["body"],
              additionalProperties: false,
              properties: { body: str({ maxLength: MAX_COMMENT_LENGTH }) },
            }),
          },
        ),
        delete: op("Comments", "Delete a comment (and its replies)", { 204: { description: "Deleted." }, ...errors(404) }),
      },
      "/projects/{projectId}/issues/{number}/subtasks": {
        parameters: [projectId, issueNumber],
        get: op("Subtasks", "List subtasks", { 200: { description: "In checklist order.", content: dataOf({ type: "array", items: ref("Subtask") }) }, ...errors(404) }),
        post: op(
          "Subtasks",
          "Add a subtask",
          { 201: { description: "Created at the end of the checklist.", content: dataOf(ref("Subtask")) }, ...errors(400, 404) },
          {
            requestBody: body({
              type: "object",
              required: ["title"],
              additionalProperties: false,
              properties: {
                title: str({ maxLength: MAX_SUBTASK_TITLE_LENGTH }),
                completed: { type: "boolean", default: false },
              },
            }),
          },
        ),
      },
      "/projects/{projectId}/issues/{number}/subtasks/{subtaskId}": {
        parameters: [projectId, issueNumber, param("subtaskId", "Subtask id.")],
        patch: op(
          "Subtasks",
          "Rename or check/uncheck a subtask",
          { 200: { description: "Updated.", content: dataOf(ref("Subtask")) }, ...errors(400, 404) },
          {
            requestBody: body({
              type: "object",
              additionalProperties: false,
              properties: { title: str({ maxLength: MAX_SUBTASK_TITLE_LENGTH }), completed: { type: "boolean" } },
            }),
          },
        ),
        delete: op("Subtasks", "Delete a subtask", { 204: { description: "Deleted." }, ...errors(404) }),
      },
      "/projects/{projectId}/epics": {
        parameters: [projectId],
        get: op("Epics", "List epics", { 200: { description: "Epics, oldest first.", content: dataOf({ type: "array", items: ref("Epic") }) }, ...errors(404) }),
        post: op(
          "Epics",
          "Create an epic",
          { 201: { description: "Created.", content: dataOf(ref("Epic")) }, ...errors(400, 404) },
          { requestBody: body(epicInput(["name"])) },
        ),
      },
      "/projects/{projectId}/epics/{epicId}": {
        parameters: [projectId, param("epicId", "Epic id.")],
        get: op("Epics", "Get an epic", { 200: { description: "The epic.", content: dataOf(ref("Epic")) }, ...errors(404) }),
        patch: op("Epics", "Update an epic", { 200: { description: "Updated.", content: dataOf(ref("Epic")) }, ...errors(400, 404) }, { requestBody: body(epicInput([])) }),
        delete: op("Epics", "Delete an epic (its issues are kept)", { 204: { description: "Deleted." }, ...errors(404) }),
      },
      "/projects/{projectId}/sprints": {
        parameters: [projectId],
        get: op(
          "Sprints",
          "List sprints",
          { 200: { description: "Active first, then planned, then completed (newest first).", content: dataOf({ type: "array", items: ref("Sprint") }) }, ...errors(400, 404) },
          { parameters: [query("status", "Only sprints with this status.", ref("SprintStatus"))] },
        ),
        post: op(
          "Sprints",
          "Create a planned sprint",
          { 201: { description: "Created.", content: dataOf(ref("Sprint")) }, ...errors(400, 404, 409) },
          { requestBody: body(sprintInput(), false) },
        ),
      },
      "/projects/{projectId}/sprints/{sprintId}": {
        parameters: [projectId, param("sprintId", "Sprint id.")],
        get: op("Sprints", "Get a sprint", { 200: { description: "The sprint.", content: dataOf(ref("Sprint")) }, ...errors(404) }),
        patch: op("Sprints", "Update a sprint", { 200: { description: "Updated.", content: dataOf(ref("Sprint")) }, ...errors(400, 404, 409) }, { requestBody: body(sprintInput()) }),
        delete: op(
          "Sprints",
          "Delete a planned sprint (its issues return to the backlog)",
          {
            200: { description: "Deleted.", content: dataOf({ type: "object", properties: { movedIssues: { type: "integer" } } }) },
            ...errors(404, 409),
          },
        ),
      },
      "/projects/{projectId}/sprints/{sprintId}/start": {
        parameters: [projectId, param("sprintId", "Sprint id.")],
        post: op(
          "Sprints",
          "Start a planned sprint",
          { 200: { description: "Started.", content: dataOf(ref("Sprint")) }, ...errors(400, 404, 409) },
          {
            description: "Fails if another sprint is active. Start defaults to today, end to start + 14 days.",
            requestBody: body(
              {
                type: "object",
                additionalProperties: false,
                properties: { startDate: nullable(calendarDate), endDate: nullable(calendarDate) },
              },
              false,
            ),
          },
        ),
      },
      "/projects/{projectId}/sprints/{sprintId}/complete": {
        parameters: [projectId, param("sprintId", "Sprint id.")],
        post: op(
          "Sprints",
          "Complete the active sprint",
          {
            200: {
              description: "Completed.",
              content: dataOf({
                type: "object",
                properties: {
                  completedIssues: { type: "integer" },
                  movedIssues: { type: "integer" },
                  nextSprintId: nullable(str()),
                  nextSprintStarted: { type: "boolean" },
                },
              }),
            },
            ...errors(400, 404, 409),
          },
          {
            description: "DONE issues stay with the sprint; the others move to `moveIncompleteTo`.",
            requestBody: body({
              type: "object",
              required: ["moveIncompleteTo"],
              additionalProperties: false,
              properties: {
                moveIncompleteTo: str({ description: '`"new"` (a new sprint), `"backlog"`, or a planned sprint\'s id.', example: "new" }),
                startNext: { type: "boolean", description: "Start the sprint unfinished issues moved to.", default: false },
                today: { ...calendarDate, description: "Your calendar date, used as the next sprint's start." },
              },
            }),
          },
        ),
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Authorization: Bearer <API key>" },
        apiKeyHeader: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
      responses: {
        E400: { description: "Invalid request.", content: json(ref("Error")) },
        E401: { description: "Missing or invalid API key.", content: json(ref("Error")) },
        E404: { description: "Not found.", content: json(ref("Error")) },
        E409: { description: "Not allowed in the current state (e.g. a completed sprint).", content: json(ref("Error")) },
      },
      schemas: {
        IssueStatus: { type: "string", enum: [...ISSUE_STATUSES] },
        IssuePriority: { type: "string", enum: [...ISSUE_PRIORITIES] },
        SprintStatus: { type: "string", enum: [...SPRINT_STATUSES] },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: str({ example: "not_found" }), message: str({ example: "Issue not found." }) },
            },
          },
        },
        Pagination: {
          type: "object",
          properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } },
        },
        Project: {
          type: "object",
          properties: { id: str(), name: str(), description: nullable(str()), createdAt: dateTime, updatedAt: dateTime },
        },
        ProjectDetail: {
          allOf: [
            ref("Project"),
            {
              type: "object",
              properties: {
                activeSprint: nullable(ref("Sprint")),
                issueCounts: {
                  type: "object",
                  properties: Object.fromEntries(ISSUE_STATUSES.map((s) => [s, { type: "integer" }])),
                },
              },
            },
          ],
        },
        Issue: {
          type: "object",
          properties: {
            id: str(),
            projectId: str(),
            number: { type: "integer" },
            title: str(),
            description: nullable(str({ description: "Markdown." })),
            status: ref("IssueStatus"),
            priority: ref("IssuePriority"),
            order: { type: "integer", description: "Position in its board column, 0-based." },
            epic: nullable({ type: "object", properties: { id: str(), name: str(), color: str() } }),
            sprint: nullable({
              type: "object",
              description: "null = backlog.",
              properties: { id: str(), name: str(), status: ref("SprintStatus") },
            }),
            subtasks: { type: "array", items: ref("Subtask") },
            commentCount: { type: "integer" },
            createdAt: dateTime,
            updatedAt: dateTime,
          },
        },
        Subtask: {
          type: "object",
          properties: { id: str(), title: str(), completed: { type: "boolean" }, order: { type: "integer" }, createdAt: dateTime, updatedAt: dateTime },
        },
        Comment: {
          type: "object",
          properties: {
            id: str(),
            parentId: nullable(str()),
            body: str({ description: "Markdown." }),
            editedAt: nullable(dateTime),
            createdAt: dateTime,
            updatedAt: dateTime,
            replies: { type: "array", items: ref("Comment"), description: "Only on top-level comments in lists." },
          },
        },
        Epic: {
          type: "object",
          properties: { id: str(), projectId: str(), name: str(), description: nullable(str()), color: str({ example: "#6366f1" }), createdAt: dateTime, updatedAt: dateTime },
        },
        Sprint: {
          type: "object",
          properties: {
            id: str(),
            projectId: str(),
            number: { type: "integer" },
            name: str(),
            goal: nullable(str()),
            status: ref("SprintStatus"),
            startDate: nullable(calendarDate),
            endDate: nullable(calendarDate),
            completedAt: nullable(dateTime),
            issueCount: { type: "integer", description: "Included in lists and single-sprint reads." },
            createdAt: dateTime,
            updatedAt: dateTime,
          },
        },
      },
    },
  };
}

function epicInput(required: string[]): Schema {
  return {
    type: "object",
    required,
    additionalProperties: false,
    properties: {
      name: str({ maxLength: MAX_EPIC_NAME_LENGTH }),
      description: nullable(str({ maxLength: MAX_PROJECT_DESCRIPTION_LENGTH })),
      color: str({ pattern: "^#[0-9a-fA-F]{6}$", example: "#6366f1" }),
    },
  };
}

function sprintInput(): Schema {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      name: str({ maxLength: MAX_SPRINT_NAME_LENGTH, description: 'Defaults to "Sprint N".' }),
      goal: nullable(str({ maxLength: MAX_SPRINT_GOAL_LENGTH })),
      startDate: nullable(calendarDate),
      endDate: nullable(calendarDate),
    },
  };
}
