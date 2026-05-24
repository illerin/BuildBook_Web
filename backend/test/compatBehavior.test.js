import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeBackupZip, writeProjectExportZip } from './fixtures/import-export/buildFixtures.js';

const baseUrl = process.env.BUILDBOOK_COMPAT_BASE_URL;
const allowDestructive = process.env.BUILDBOOK_COMPAT_ALLOW_DESTRUCTIVE === '1';
const canRun = !!baseUrl && allowDestructive;

function destructiveOptions(name) {
  return canRun ? {} : { skip: `${name} requires BUILDBOOK_COMPAT_BASE_URL and BUILDBOOK_COMPAT_ALLOW_DESTRUCTIVE=1` };
}

async function postForm(pathname, form) {
  const response = await fetch(`${baseUrl}${pathname}`, { method: 'POST', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

test('project import behavior creates project, files, linked parts, quantities, categories, images, and documents', destructiveOptions('project import'), async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildbook-import-'));
  const zipPath = path.join(dir, 'project.zip');
  await writeProjectExportZip(zipPath, 'web');
  const previewForm = new FormData();
  previewForm.append('file', new Blob([fs.readFileSync(zipPath)]), 'project.zip');
  const preview = await postForm('/api/projects/import/preview', previewForm);
  assert.ok(preview.token);
  assert.equal(preview.parts[0].document_count, 1);
  const commit = await postJson('/api/projects/import/commit', { token: preview.token, category_map: {} });
  assert.ok(commit.project?.id);
  const projectResponse = await fetch(`${baseUrl}/api/projects/${commit.project.id}`);
  const project = await projectResponse.json();
  assert.equal(project.files.length, 3);
  assert.equal(project.parts.length, 1);
  assert.equal(project.parts[0].quantity, 2);
});

test('full restore behavior restores database records and upload files from portable backup', destructiveOptions('full restore'), async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildbook-restore-'));
  const zipPath = path.join(dir, 'backup.zip');
  await writeBackupZip(zipPath, 'web');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(zipPath)]), 'backup.zip');
  const restore = await postForm('/api/settings/restore', form);
  assert.equal(restore.ok, true);
});

test('desktop-compatible full restore behavior accepts backup.json plus buildbook-backup.json', destructiveOptions('desktop full restore'), async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildbook-restore-desktop-'));
  const zipPath = path.join(dir, 'desktop-backup.zip');
  await writeBackupZip(zipPath, 'desktop');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(zipPath)]), 'desktop-backup.zip');
  const restore = await postForm('/api/settings/restore', form);
  assert.equal(restore.ok, true);
});

test('round trip behavior can be exercised against an explicitly disposable app instance', destructiveOptions('round trip'), async () => {
  const response = await fetch(`${baseUrl}/api/settings/backup`);
  assert.equal(response.ok, true);
  assert.match(response.headers.get('content-disposition') || '', /buildbook-web-backup/);
});
