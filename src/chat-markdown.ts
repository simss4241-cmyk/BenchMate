import { createElement } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export function chatLink(url: string): string {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}
const components: Components = {
  a: ({ href, children }) =>
    href
      ? createElement(
          "a",
          { href, target: "_blank", rel: "noopener noreferrer" },
          children,
        )
      : createElement("span", null, children),
  // Model output must not load tracking pixels or remote media automatically.
  img: ({ alt }) =>
    createElement(
      "span",
      { className: "chat-image-placeholder" },
      alt ? `[Image: ${alt}]` : "[Image omitted]",
    ),
};
export function ChatMarkdown({ content }: { content: string }) {
  return createElement(
    "div",
    { className: "chat-markdown" },
    createElement(Markdown, {
      skipHtml: true,
      remarkPlugins: [remarkGfm],
      components,
      urlTransform: (url, key) => (key === "href" ? chatLink(url) : ""),
      children: content,
    }),
  );
}
