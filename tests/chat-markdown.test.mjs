import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown, chatLink } from "../src/chat-markdown.ts";
const render = (content) =>
  renderToStaticMarkup(createElement(ChatMarkdown, { content }));
test("assistant Markdown renders headings, emphasis, lists, code and tables", () => {
  const html = render(
    "### Visible evidence\n\n**Iron Valiant ex** and `220 HP`.\n\n- A card\n- Not a motor\n\n> A quoted observation\n\n```js\nconst label = '<safe>';\n```\n\n| Part | Qty |\n| --- | --- |\n| Motor | 3 |",
  );
  for (const tag of [
    "<h3>",
    "<strong>",
    "<code>",
    "<ul>",
    "<blockquote>",
    "<pre>",
    "<table>",
  ])
    assert.ok(html.includes(tag), tag);
  assert.ok(!html.includes("**Iron"));
  assert.ok(html.includes("&lt;safe&gt;"));
});
test("model Markdown cannot execute HTML, unsafe links or load remote images", () => {
  const html = render(
    '<script>alert(1)</script>\n\n<img src="https://tracker.invalid/a" onerror="alert(2)">\n\n![pixel](https://tracker.invalid/pixel)\n\n[unsafe](javascript:alert%281%29)\n\n[local](/api/delete)\n\n[docs](https://example.com/docs)',
  );
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("onerror"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes('href="/api/'));
  assert.ok(html.includes('href="https://example.com/docs"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes("[Image: pixel]"));
  for (const url of [
    "data:text/html,test",
    "javascript:alert(1)",
    "file:///C:/secret",
    "//tracker.invalid/a",
    "/local",
  ])
    assert.equal(chatLink(url), "");
});
test("partial streamed Markdown remains renderable and is formatted when completed", () => {
  assert.doesNotThrow(() => render("**Visible evid"));
  assert.doesNotThrow(() => render("```js\nconst x ="));
  assert.ok(
    render("**Visible evidence**").includes(
      "<strong>Visible evidence</strong>",
    ),
  );
});
