import { prisma } from "@/lib/prisma";
import { deleteComment, updateComment } from "@/actions/comment-actions";
import {
  allowOnly, apiRoute, noContent, notFound, ok, parseIssueNumber, readBody, requireString, unwrap,
} from "@/lib/api/http";
import { commentJson, requireIssueId } from "@/lib/api/resources";
import { MAX_COMMENT_LENGTH } from "@/lib/limits";

export const dynamic = "force-dynamic";

type Params = { projectId: string; number: string; commentId: string };

async function requireComment({ projectId, number, commentId }: Params) {
  const issueId = await requireIssueId(projectId, parseIssueNumber(number));
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { issueId: true } });
  if (!comment || comment.issueId !== issueId) throw notFound("Comment");
}

/** Edit a comment's body; sets `editedAt`. */
export const PATCH = apiRoute<Params>(async (req, params) => {
  await requireComment(params);
  const body = await readBody(req);
  allowOnly(body, ["body"]);
  const text = requireString(body, "body", { max: MAX_COMMENT_LENGTH });
  return ok(commentJson(unwrap(await updateComment(params.commentId, text))));
});

/** Delete a comment; deleting a top-level comment also deletes its replies. */
export const DELETE = apiRoute<Params>(async (_req, params) => {
  await requireComment(params);
  unwrap(await deleteComment(params.commentId));
  return noContent();
});
