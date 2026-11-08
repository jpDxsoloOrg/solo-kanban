import { MarkdownPreview } from "@/components/board/MarkdownPreview";

/**
 * Markdown for a comment, constrained to its column: long words and URLs
 * wrap, while code blocks and tables scroll sideways instead of widening the
 * page.
 */
export function CommentBody({ body }: { body: string }) {
  return (
    <div className="min-w-0 max-w-full text-foreground [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:[overflow-wrap:normal] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
      <MarkdownPreview content={body} />
    </div>
  );
}
