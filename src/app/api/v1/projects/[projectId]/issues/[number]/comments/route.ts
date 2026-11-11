import { addComment, getComments } from "@/actions/comment-actions";
import {
  allowOnly, apiRoute, created, ok, parseIssueNumber, readBody, requireString, stringField, unwrap,
} from "@/lib/api/http";
import { commentJson, requireIssueId } from "@/lib/api/resources";
import { MAX_COMMENT_LENGTH } from "@/lib/limits";

export const dynamic = "force-dynamic";

type Params = { projectId: string; number: string };

/** Top-level comments (oldest first), each with its replies (oldest first). */
export const GET = apiRoute<Params>(async (_req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const comments = await getComments(issueId);
  return ok(comments.map(commentJson));
});

/**
 * Add a markdown comment, or a reply with `parentId`. Threads are one level
 * deep: replying to a reply attaches to its top-level comment.
 */
export const POST = apiRoute<Params>(async (req, { projectId, number }) => {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const body = await readBody(req);
  allowOnly(body, ["body", "parentId"]);
  const text = requireString(body, "body", { max: MAX_COMMENT_LENGTH });
  const parentId = stringField(body, "parentId", { max: 100, nullable: true });

  // addComment revalidates the project's pages.
  const comment = unwrap(await addComment(issueId, text, parentId));
  return created(commentJson(comment));
});
