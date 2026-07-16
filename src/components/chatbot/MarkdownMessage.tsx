import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The one chat-message renderer, used by every MGP Analyst surface.
//
// Design intent (owner spec, Jul 2026): responses read like a modern chat
// product, not a terminal dump. Body text is the app's sans face; monospace is
// reserved for numbers/code where alignment matters. GFM tables render as real
// bordered tables (react-markdown alone doesn't parse them — remark-gfm is
// required). Terminal-green stays as the accent color: that's the app's
// intentional brand, applied with hierarchy instead of everywhere.

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="font-sans text-sm text-foreground leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="text-base font-bold text-terminal-green mt-4 mb-1.5 first:mt-0" {...p} />,
          h2: (p) => <h3 className="text-base font-bold text-terminal-green mt-4 mb-1.5 first:mt-0" {...p} />,
          h3: (p) => <h4 className="text-sm font-bold text-terminal-green mt-3 mb-1 first:mt-0" {...p} />,
          p: (p) => <p className="my-2 first:mt-0 last:mb-0" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          em: (p) => <em className="text-muted-foreground not-italic text-xs" {...p} />,
          ul: (p) => <ul className="my-2 space-y-1 list-disc pl-5 marker:text-terminal-green/70" {...p} />,
          ol: (p) => <ol className="my-2 space-y-1 list-decimal pl-5 marker:text-terminal-green/70" {...p} />,
          li: (p) => <li className="pl-0.5" {...p} />,
          a: (p) => <a className="text-terminal-green underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => (
            <code className="font-mono text-[13px] bg-muted/60 rounded px-1 py-0.5" {...p} />
          ),
          pre: (p) => (
            <pre className="font-mono text-xs bg-muted/40 border border-border rounded-lg p-3 my-2 overflow-x-auto" {...p} />
          ),
          table: (p) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-muted/40" {...p} />,
          th: (p) => (
            <th className="text-left font-semibold text-terminal-green px-3 py-2 border-b border-border whitespace-nowrap" {...p} />
          ),
          td: (p) => (
            <td className="px-3 py-2 border-b border-border/50 align-top tabular-nums" {...p} />
          ),
          tr: (p) => <tr className="even:bg-muted/15" {...p} />,
          hr: () => <hr className="my-3 border-border" />,
          blockquote: (p) => (
            <blockquote className="border-l-2 border-terminal-green/50 pl-3 my-2 text-muted-foreground" {...p} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
