import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownRendererProps {
  /**
   * The raw Markdown content string to render
   */
  content: string;
  /**
   * Optional outer container class overrides
   */
  className?: string;
}

/**
 * Reusable Markdown renderer component styled with Apple-inspired typography,
 * fluid type sizing, refined leading, and tactile micro-details.
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
}) => {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return null;
  }

  return (
    <div
      className={`markdown-renderer max-w-none text-[#424245] leading-relaxed ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#1d1d1f] mt-8 mb-4 leading-tight first:mt-0"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-[#1d1d1f] mt-8 mb-3.5 pb-2 border-b border-black/5 leading-snug first:mt-0"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-lg sm:text-xl font-semibold tracking-tight text-[#1d1d1f] mt-6 mb-2.5 leading-snug first:mt-0"
              {...props}
            />
          ),
          h4: ({ node, ...props }) => (
            <h4
              className="text-base sm:text-lg font-semibold tracking-tight text-[#1d1d1f] mt-5 mb-2 leading-snug"
              {...props}
            />
          ),
          h5: ({ node, ...props }) => (
            <h5
              className="text-xs sm:text-sm font-semibold uppercase tracking-wider font-mono text-[#86868b] mt-4 mb-1.5"
              {...props}
            />
          ),
          h6: ({ node, ...props }) => (
            <h6
              className="text-xs font-semibold uppercase tracking-wider font-mono text-[#86868b] mt-4 mb-1.5"
              {...props}
            />
          ),
          p: ({ node, ...props }) => (
            <p
              className="text-sm sm:text-base text-[#424245] leading-relaxed mb-4 font-normal last:mb-0"
              {...props}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul
              className="list-disc pl-5 sm:pl-6 space-y-2 mb-5 text-sm sm:text-base text-[#424245] marker:text-[#86868b]"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal pl-5 sm:pl-6 space-y-2 mb-5 text-sm sm:text-base text-[#424245] marker:font-mono marker:text-xs marker:text-[#86868b]"
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed pl-1" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-6 pl-4 sm:pl-5 py-3 pr-4 border-l-2 border-[#1d1d1f] bg-[#fbf9f5] rounded-r-xl italic text-sm sm:text-base text-[#1d1d1f] shadow-2xs"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-[#1d1d1f]" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-[#1d1d1f]" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-0 border-t border-black/8" {...props} />
          ),
          a: ({ node, href, ...props }) => {
            const isExternal = href?.startsWith('http://') || href?.startsWith('https://');
            return (
              <a
                href={href}
                className="text-[#0066cc] hover:underline underline-offset-4 decoration-[#0066cc]/40 hover:decoration-[#0066cc] transition-colors"
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              />
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-6 rounded-xl border border-black/8 shadow-2xs bg-white">
              <table
                className="w-full border-collapse text-left text-xs sm:text-sm font-mono"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-[#f5f5f7] border-b border-black/8" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-3 text-[#1d1d1f] font-semibold font-mono text-[11px] uppercase tracking-wider whitespace-nowrap"
              {...props}
            />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-black/4" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="even:bg-[#fafafc] hover:bg-zinc-50/80 transition-colors" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 text-[#424245] whitespace-nowrap" {...props} />
          ),
          img: ({ node, src, alt, ...props }) => (
            <img
              src={src}
              alt={alt || 'Product craftsmanship illustration'}
              loading="lazy"
              decoding="async"
              className="rounded-2xl border border-black/6 shadow-xs my-6 max-w-full h-auto object-cover"
              {...props}
            />
          ),
          code: ({ node, className: codeClassName, children, ...props }) => {
            return (
              <code
                className="font-mono bg-[#f5f5f7] text-[#1d1d1f] text-[13px] px-1.5 py-0.5 rounded border border-black/5"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
