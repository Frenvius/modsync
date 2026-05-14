import ReactMarkdown from 'react-markdown';
import { openUrl } from '@tauri-apps/plugin-opener';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import { ScrollArea } from '~/components/ui/scroll-area';

interface MarkdownContentProps {
  content: string | null;
  emptyMessage?: string;
}

export function MarkdownContent({ content, emptyMessage = 'No content available' }: MarkdownContentProps) {
  if (!content) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <ScrollArea className="h-full">
      <article className="prose prose-invert prose-sm max-w-none p-4 prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-primary prose-pre:bg-secondary prose-pre:border prose-pre:border-border">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            a: ({ href, children }) => (
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); if (href) openUrl(href); }}
                className="text-primary hover:underline cursor-pointer"
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </ScrollArea>
  );
}
