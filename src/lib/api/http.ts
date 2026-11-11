import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";
import { authenticate } from "@/lib/api/auth";

/**
 * Plumbing shared by the public REST API (`/api/v1/...`).
 *
 * Every response is JSON. Successes are `{ "data": ... }` (lists may add
 * `"pagination"`); failures are `{ "error": { "code", "message" } }` with a
 * matching HTTP status.
 */

const NO_STORE = { "Cache-Control": "no-store" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);
export const badRequest = (message: string) => new ApiError(400, "invalid_request", message);

export function ok(data: unknown, init: { status?: number; extra?: Record<string, unknown> } = {}) {
  return NextResponse.json({ data, ...init.extra }, { status: init.status ?? 200, headers: NO_STORE });
}

export function created(data: unknown) {
  return ok(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

function errorResponse(status: number, code: string, message: string, headers: HeadersInit = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Errors thrown by the app's own actions carry user-facing messages. */
function isDomainError(error: unknown): error is Error {
  return error instanceof Error && error.constructor === Error;
}

const NOT_FOUND_RE = /not found|no longer exists|doesn't exist/i;

function toResponse(error: unknown): Response {
  if (error instanceof ApiError) return errorResponse(error.status, error.code, error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return errorResponse(404, "not_found", "Resource not found.");
  }
  if (isDomainError(error)) {
    return NOT_FOUND_RE.test(error.message)
      ? errorResponse(404, "not_found", error.message)
      : errorResponse(409, "conflict", error.message);
  }
  console.error("API request failed:", error);
  return errorResponse(500, "internal_error", "Something went wrong.");
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wrap a route handler: checks the API key, resolves params and turns thrown
 * errors into JSON error responses.
 */
export function apiRoute<P = Record<string, never>>(
  handler: (req: NextRequest, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const auth = authenticate(req);
    if (!auth.ok) {
      return errorResponse(auth.status, auth.code, auth.message, auth.status === 401
        ? { "WWW-Authenticate": 'Bearer realm="solo-kanban"' }
        : {});
    }
    try {
      return await handler(req, await ctx.params);
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** Turn an action's `ActionResult` into its data, or throw the matching API error. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data;
  if (NOT_FOUND_RE.test(result.error)) throw new ApiError(404, "not_found", result.error);
  throw new ApiError(409, "conflict", result.error);
}

/** Refresh the web UI's cached pages for a project after an API write. */
export function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

export type Json = Record<string, unknown>;

/** The request body as a JSON object. */
export async function readBody(req: NextRequest): Promise<Json> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object.");
  }
  return body as Json;
}

/** Like `readBody`, but an empty body reads as `{}`. */
export async function readOptionalBody(req: NextRequest): Promise<Json> {
  const text = await req.text();
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Request body must be a JSON object.");
  }
  return body as Json;
}

/** Reject fields the endpoint doesn't know, so typos don't silently do nothing. */
export function allowOnly(body: Json, fields: readonly string[]) {
  const unknown = Object.keys(body).filter((key) => !fields.includes(key));
  if (unknown.length) {
    throw badRequest(`Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Allowed: ${fields.join(", ")}.`);
  }
}

interface StringOptions {
  max: number;
  /** Allow `null` (clears the field). */
  nullable?: boolean;
  /** Allow an empty string after trimming. */
  allowEmpty?: boolean;
}

/** A trimmed string field; `undefined` when absent. */
export function stringField(body: Json, key: string, opts: StringOptions & { nullable: true }): string | null | undefined;
export function stringField(body: Json, key: string, opts: StringOptions): string | undefined;
export function stringField(body: Json, key: string, opts: StringOptions): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null) {
    if (opts.nullable) return null;
    throw badRequest(`"${key}" can't be null.`);
  }
  if (typeof value !== "string") throw badRequest(`"${key}" must be a string.`);
  const trimmed = value.trim();
  if (!trimmed && !opts.allowEmpty) {
    if (opts.nullable) return null;
    throw badRequest(`"${key}" can't be empty.`);
  }
  if (trimmed.length > opts.max) throw badRequest(`"${key}" must be ${opts.max} characters or fewer.`);
  return trimmed;
}

export function requireString(body: Json, key: string, opts: StringOptions): string {
  const value = stringField(body, key, opts);
  if (value === undefined) throw badRequest(`"${key}" is required.`);
  return value;
}

export function booleanField(body: Json, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw badRequest(`"${key}" must be true or false.`);
  return value;
}

export function enumField<T extends string>(body: Json, key: string, values: readonly T[]): T | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  return parseEnum(value, key, values);
}

export function parseEnum<T extends string>(value: unknown, key: string, values: readonly T[]): T {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : value;
  if (typeof normalized !== "string" || !values.includes(normalized as T)) {
    throw badRequest(`"${key}" must be one of: ${values.join(", ")}.`);
  }
  return normalized as T;
}

/** `limit`/`offset` query parameters. */
export function pagination(req: NextRequest, { defaultLimit = 100, maxLimit = 500 } = {}) {
  const params = req.nextUrl.searchParams;
  const parse = (key: string, fallback: number, max: number) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > max) {
      throw badRequest(`"${key}" must be a whole number between 0 and ${max}.`);
    }
    return n;
  };
  return { limit: parse("limit", defaultLimit, maxLimit), offset: parse("offset", 0, Number.MAX_SAFE_INTEGER) };
}

/** Issue numbers in URLs ("/issues/42"). */
export function parseIssueNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 2_147_483_647) throw notFound("Issue");
  return n;
}
