import ReactMarkdown from 'react-markdown';

import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

import { cn } from '~/lib/utils';

interface RichContentProps {
  content: string;
  className?: string;
  emptyMessage?: string;
}

const RichContent = ({ content, className, emptyMessage = 'No content available.' }: RichContentProps) => {
  if (!content.trim()) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;

  return (
    <article className={cn('rich-content', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          img: ({ src, alt }) => <img src={src} loading="lazy" alt={alt ?? ''} decoding="async" />
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
};

export default RichContent;
