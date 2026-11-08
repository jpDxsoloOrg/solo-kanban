import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    // Long words/URLs wrap; wide tables and code blocks scroll on their own
    // instead of widening the page.
    <div className="prose prose-sm max-w-none min-w-0 wrap-break-word prose-gray dark:prose-invert [&_a]:wrap-anywhere [&_code]:before:content-none [&_code]:after:content-none [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
    </div>
  );
}
