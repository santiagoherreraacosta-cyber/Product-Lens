function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Wraps arbitrary Markdown (built from real cycle data in app.js) into a
// printable HTML page that auto-invokes window.print() — used for the "PDF"
// export path (the browser's own "Guardar como PDF" does the rest).
export function markdownToPdfHtml(markdown, title = "Export Dropi") {
  const escapedBody = escapeHtml(markdown);
  const escapedTitle = escapeHtml(title);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapedTitle}</title><style>body{font-family:Inter,Arial,sans-serif;line-height:1.55;padding:32px;color:#1f2328}pre{white-space:pre-wrap}h1{color:#ff6b00}</style></head><body><pre>${escapedBody}</pre><script>window.onload=()=>window.print()</script></body></html>`;
}
