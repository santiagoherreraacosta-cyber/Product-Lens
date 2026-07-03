import fs from 'node:fs/promises';
import path from 'node:path';

// Honour DATA_DIR (Railway persistent volume) so context persists like the rest.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DATA_PATH = path.join(DATA_DIR, 'context_documents.json');
const AUDIT_PATH = path.join(DATA_DIR, 'context_audit.log');
const CONFIRM_RE = /\[CONFIRMAR[^\]]*\]/g;

export async function getContextDocuments() {
  const data = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const documents = data.documents.sort((a, b) => a.sortOrder - b.sortOrder).map(withPendingCount);
  return { ...data, pendingCount: documents.reduce((sum, doc) => sum + doc.pendingCount, 0), documents };
}

export async function updateContextDocument(id, patch, actor = 'admin') {
  if (!actor || actor !== 'admin') {
    const error = new Error('Solo admins pueden editar el contexto.');
    error.statusCode = 403;
    throw error;
  }
  const data = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
  const index = data.documents.findIndex((doc) => doc.id === id);
  if (index === -1) {
    const error = new Error('Documento de contexto no encontrado.');
    error.statusCode = 404;
    throw error;
  }
  const current = data.documents[index];
  const next = withPendingCount({
    ...current,
    title: patch.title ?? current.title,
    content: patch.content ?? current.content,
    table: normalizeTable(patch.table) ?? current.table,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    version: current.version + 1,
  });
  next.versions = [...(current.versions ?? []), { version: next.version, title: next.title, content: next.content, table: next.table, pendingCount: next.pendingCount, updatedAt: next.updatedAt, updatedBy: actor, reason: patch.reason ?? 'Edición manual de contexto.' }];
  data.documents[index] = next;
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  await fs.appendFile(AUDIT_PATH, JSON.stringify({ type: 'context_document.updated', id, actor, version: next.version, pendingCount: next.pendingCount, at: next.updatedAt, reason: patch.reason ?? null }) + '\n');
  return next;
}

// B1 · table documents ({ columns: string[], rows: string[][] }). Returns the
// sanitized table or null when the patch has no usable table.
export function normalizeTable(table) {
  if (!table || typeof table !== 'object') return null;
  const columns = Array.isArray(table.columns) ? table.columns.map((c) => String(c ?? '')) : null;
  const rows = Array.isArray(table.rows)
    ? table.rows.filter(Array.isArray).map((row) => row.map((cell) => String(cell ?? '')))
    : null;
  if (!columns?.length || !rows?.length) return null;
  return { columns, rows: rows.map((row) => row.slice(0, columns.length)) };
}

// [CONFIRMAR] pendings count across title + content + table cells.
export function withPendingCount(doc) {
  const tableText = doc.table ? [...(doc.table.columns ?? []), ...(doc.table.rows ?? []).flat()].join('\n') : '';
  return { ...doc, pendingCount: `${doc.title}\n${doc.content}\n${tableText}`.match(CONFIRM_RE)?.length ?? 0 };
}
