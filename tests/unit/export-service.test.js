import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownToPdfHtml } from "../../src/exportService.js";

test("markdownToPdfHtml escapes HTML entities", () => {
  const html = markdownToPdfHtml('<script>alert("xss")</script>');
  // The user-provided content should be escaped; the template's own <script> is fine
  assert.ok(html.includes("&lt;script&gt;alert"), "user script tag should be escaped");
  assert.ok(!html.includes('<script>alert'), "raw user script tag must not appear");
});

test("markdownToPdfHtml includes print trigger", () => {
  const html = markdownToPdfHtml("test");
  assert.match(html, /window\.print/);
  assert.match(html, /<!doctype html>/i);
});
