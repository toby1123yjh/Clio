import {
  type MarkdownSource,
  markdownSourceHref,
  projectMarkdownSources,
} from "@/src/rail/app/markdown-sources";
import { BookOpen, ExternalLink, FileText, MessageSquare, Quote, Sparkles } from "lucide-react";
import mermaid from "mermaid";
import * as React from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export type MarkdownRendererVariant = "chat" | "preview";

export interface MarkdownRendererProps {
  markdown: string;
  sources: MarkdownSource[];
  variant: MarkdownRendererVariant;
  onSourceActivate: (source: MarkdownSource) => void;
}

let mermaidInitialized = false;

export function MarkdownRenderer({
  markdown,
  sources,
  variant,
  onSourceActivate,
}: MarkdownRendererProps) {
  const projectedMarkdown = React.useMemo(
    () => projectMarkdownSources(markdown, sources),
    [markdown, sources],
  );
  const components = React.useMemo(
    () => buildMarkdownComponents({ sources, variant, onSourceActivate }),
    [onSourceActivate, sources, variant],
  );

  return (
    <div className={markdownRootClass(variant)} data-clio-markdown={variant}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
        urlTransform={(url) =>
          url === markdownSourceHref ? markdownSourceHref : defaultUrlTransform(url)
        }
      >
        {projectedMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function buildMarkdownComponents({
  sources,
  variant,
  onSourceActivate,
}: {
  sources: MarkdownSource[];
  variant: MarkdownRendererVariant;
  onSourceActivate: (source: MarkdownSource) => void;
}): Components {
  const headingBase =
    variant === "preview"
      ? "scroll-m-4 break-words font-semibold text-foreground"
      : "break-words font-semibold text-foreground";
  return {
    h1: ({ children }) => (
      <h1 className={`${headingBase} mb-3 mt-1 text-[22px] leading-8`}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className={`${headingBase} mb-2.5 mt-4 text-[18px] leading-7`}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className={`${headingBase} mb-2 mt-3 text-[15px] leading-6`}>{children}</h3>
    ),
    p: ({ children }) => <p className="my-2 break-words">{children}</p>,
    a: ({ children, href }) => {
      if (href === markdownSourceHref) {
        return <SourceChipGroup onSourceActivate={onSourceActivate} sources={sources} />;
      }
      return (
        <a
          className="font-medium text-primary underline decoration-primary/30 underline-offset-2 outline-none hover:decoration-primary focus-visible:ring-2 focus-visible:ring-primary"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {children}
          <ExternalLink className="ml-0.5 inline-block align-[-2px]" size={11} />
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-border-strong pl-3 text-foreground-soft">
        <span className="mb-1 flex text-muted-foreground">
          <Quote size={13} />
        </span>
        {children}
      </blockquote>
    ),
    ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    hr: () => <hr className="my-4 border-border" />,
    table: ({ children }) => (
      <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[420px] border-collapse text-left text-[12px] leading-5">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted text-foreground">{children}</thead>,
    th: ({ children }) => (
      <th className="border-b border-border px-2.5 py-2 font-semibold">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border-t border-border px-2.5 py-2 align-top">{children}</td>
    ),
    pre: ({ children }) => {
      const mermaidDefinition = readMermaidDefinition(children);
      if (mermaidDefinition !== undefined) {
        return <MermaidBlock definition={mermaidDefinition} />;
      }
      const language = readCodeLanguage(children);
      return (
        <div className="my-3 overflow-hidden rounded-lg border border-border bg-muted">
          {language === undefined ? null : (
            <div className="border-b border-border px-3 py-1.5 font-mono text-[10.5px] uppercase text-muted-foreground">
              {language}
            </div>
          )}
          <pre className="clio-scroll max-w-full overflow-x-auto p-3 text-[12px] leading-5">
            {children}
          </pre>
        </div>
      );
    },
    code: ({ children, className }) => {
      const language = languageFromClassName(className);
      const isBlock = language !== undefined || String(children).includes("\n");
      if (isBlock) {
        return (
          <code className={className === undefined ? "font-mono" : `${className} font-mono`}>
            {children}
          </code>
        );
      }
      return (
        <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground">
          {children}
        </code>
      );
    },
  };
}

function SourceChipGroup({
  sources,
  onSourceActivate,
}: {
  sources: MarkdownSource[];
  onSourceActivate: (source: MarkdownSource) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <span className="mx-0.5 inline-flex max-w-full flex-wrap items-center gap-1 align-baseline">
      {sources.map((source) => (
        <button
          className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium leading-4 text-primary outline-none transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-primary"
          key={source.id}
          onClick={() => onSourceActivate(source)}
          title={source.excerpt ?? source.title ?? source.url ?? source.label}
          type="button"
        >
          {sourceIcon(source)}
          <span className="truncate">{source.label}</span>
        </button>
      ))}
    </span>
  );
}

function sourceIcon(source: MarkdownSource) {
  switch (source.kind) {
    case "selection":
      return <MessageSquare className="shrink-0" size={11} />;
    case "memory":
      return <BookOpen className="shrink-0" size={11} />;
    case "chat":
      return <Sparkles className="shrink-0" size={11} />;
    case "page":
      return <FileText className="shrink-0" size={11} />;
    default:
      return <ExternalLink className="shrink-0" size={11} />;
  }
}

function MermaidBlock({ definition }: { definition: string }) {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [rendered, setRendered] = React.useState<{ svg?: string; error?: string }>({});

  React.useEffect(() => {
    let cancelled = false;
    const renderDiagram = async () => {
      try {
        ensureMermaidInitialized();
        const result = await mermaid.render(`clio-mermaid-${id}`, definition);
        if (!cancelled) setRendered({ svg: result.svg });
      } catch (error) {
        if (!cancelled) {
          setRendered({
            error: error instanceof Error ? error.message : "Mermaid diagram could not render.",
          });
        }
      }
    };
    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [definition, id]);

  if (rendered.error !== undefined) {
    return (
      <div className="my-3 rounded-lg border border-warning-border bg-warning-background px-3 py-2 text-[12px] leading-5 text-warning-foreground">
        Mermaid diagram could not render.
      </div>
    );
  }

  if (rendered.svg === undefined) {
    return (
      <div className="my-3 rounded-lg border border-border bg-muted px-3 py-3 text-[12px] text-muted-foreground">
        Rendering diagram...
      </div>
    );
  }

  return <MermaidSvg svg={rendered.svg} />;
}

function MermaidSvg({ svg }: { svg: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const parsedSvg = parsed.documentElement;
    if (parsed.querySelector("parsererror") !== null || parsedSvg.tagName.toLowerCase() !== "svg") {
      container.replaceChildren(
        window.document.createTextNode("Mermaid diagram could not render."),
      );
      return;
    }

    const importedSvg = window.document.importNode(parsedSvg, true);
    importedSvg.setAttribute("role", "img");
    importedSvg.setAttribute("aria-label", "Mermaid diagram");
    container.replaceChildren(importedSvg);
    return () => {
      container.replaceChildren();
    };
  }, [svg]);

  return (
    <div
      ref={containerRef}
      className="my-3 max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-3"
      data-clio-mermaid="true"
    />
  );
}

function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      primaryColor: "#f4f4f5",
      primaryTextColor: "#27272a",
      primaryBorderColor: "#d4d4d8",
      lineColor: "#71717a",
      secondaryColor: "#e0f2fe",
      tertiaryColor: "#fafafa",
    },
  });
  mermaidInitialized = true;
}

function readMermaidDefinition(children: React.ReactNode) {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
    return undefined;
  }
  if (languageFromClassName(child.props.className) !== "mermaid") return undefined;
  return String(child.props.children ?? "").replace(/\n$/, "");
}

function readCodeLanguage(children: React.ReactNode) {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement<{ className?: string }>(child)) return undefined;
  return languageFromClassName(child.props.className);
}

function languageFromClassName(className: string | undefined) {
  const match = /language-([a-z0-9_-]+)/i.exec(className ?? "");
  return match?.[1]?.toLowerCase();
}

function markdownRootClass(variant: MarkdownRendererVariant) {
  const common =
    "min-w-0 max-w-full break-words text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_svg]:max-w-full";
  if (variant === "preview") {
    return `${common} text-[14px] leading-7`;
  }
  return `${common} text-[13.5px] leading-6`;
}
