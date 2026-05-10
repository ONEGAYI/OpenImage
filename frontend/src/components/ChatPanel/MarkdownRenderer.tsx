import React from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import html from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import "katex/dist/katex.min.css";
import "./MarkdownRenderer.css";

SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("html", html);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("sql", sql);

interface Props {
  content: string;
}

const REGISTERED_LANGS = new Set([
  "css", "html", "javascript", "js", "json", "python", "py",
  "rust", "typescript", "ts", "bash", "shell", "sh",
  "yaml", "yml", "markdown", "md", "sql",
]);

function parseLang(className?: string): string {
  const match = (className || "").match(/language-(\w+)/);
  const lang = match?.[1];
  if (!lang || !REGISTERED_LANGS.has(lang)) return "text";
  return lang;
}

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];
const CODE_BLOCK_STYLE = {
  margin: 0,
  borderRadius: "var(--radius-sm)",
  fontSize: 12,
  padding: "10px 12px",
};

const COMPONENTS: Components = {
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
          customStyle={CODE_BLOCK_STYLE}
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
        className="md-link"
      >
        {children}
      </a>
    );
  },
};

export default React.memo(function MarkdownRenderer({ content }: Props) {
  return (
    <div className="md-renderer">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
