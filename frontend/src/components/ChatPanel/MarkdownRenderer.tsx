import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./MarkdownRenderer.css";

interface Props {
  content: string;
}

function parseLang(className?: string): string {
  const match = (className || "").match(/language-(\w+)/);
  return match ? match[1] : "text";
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <div className="md-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const codeStr = String(children).replace(/\n$/, "");
            if (className) {
              const lang = parseLang(className);
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={lang}
                  PreTag="div"
                  className="md-code-block"
                  customStyle={{
                    margin: 0,
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12,
                    padding: "10px 12px",
                  }}
                >
                  {codeStr}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className="md-code-inline" {...props}>
                {children}
              </code>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
