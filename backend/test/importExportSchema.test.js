import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import unzipper from 'unzipper';
import { validateBackupData, validateProjectExportManifest } from '../importExportSchema.js';
import {
  backupFixture,
  projectExportFixture,
  writeBackupZip,
  writeProjectExportZip,
} from './fixtures/import-export/buildFixtures.js';

test('valid web project export passes schema validation', () => {
  assert.equal(validateProjectExportManifest(projectExportFixture('web')).type, 'buildbook-web-project-export');
});

test('desktop-compatible project export passes schema validation', () => {
  const manifest = validateProjectExportManifest(projectExportFixture('desktop'));
  assert.equal(manifest.project.name, 'desktop Compatibility Project');
  assert.equal(manifest.photo_library[0].photos[0].id, 'bench-1');
  assert.equal(manifest.instructions.steps[0].photo_id, 'bench-1');
});

test('wrong project export type fails clearly', () => {
  const manifest = { ...projectExportFixture('web'), type: 'wrong-type' };
  assert.throws(
    () => validateProjectExportManifest(manifest),
    /This is not a BuildBook_Web project export/,
  );
});

test('missing archive_path on a project file fails clearly', () => {
  const manifest = projectExportFixture('web');
  delete manifest.files[0].archive_path;
  assert.throws(
    () => validateProjectExportManifest(manifest),
    /Project export is missing files\[0\]\.archive_path/,
  );
});

test('missing project-manifest.json in a zip fails clearly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildbook-compat-'));
  const backupZip = path.join(dir, 'backup.zip');
  await writeBackupZip(backupZip, 'web');
  const directory = await unzipper.Open.file(backupZip);
  assert.equal(directory.files.some((file) => file.path === 'project-manifest.json'), false);
});

test('valid web backup passes schema validation', () => {
  assert.equal(validateBackupData(backupFixture('web')).type, 'buildbook-web-backup');
});

test('desktop-compatible backup passes schema validation', () => {
  assert.equal(validateBackupData(backupFixture('desktop')).version, 3);
});

test('unknown future backup version fails clearly', () => {
  const backup = { ...backupFixture('web'), version: 5 };
  assert.throws(
    () => validateBackupData(backup),
    /Backup format version 5 is newer than this app supports/,
  );
});

test('missing required backup table fails clearly', () => {
  const backup = backupFixture('web');
  delete backup.project_file;
  assert.throws(
    () => validateBackupData(backup),
    /Backup is missing required table project_file/,
  );
});

test('fixture builders generate project export and full backup zips', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildbook-compat-'));
  const projectZip = path.join(dir, 'project.zip');
  const backupZip = path.join(dir, 'backup.zip');
  await writeProjectExportZip(projectZip, 'web');
  await writeBackupZip(backupZip, 'web');
  const projectEntries = (await unzipper.Open.file(projectZip)).files.map((file) => file.path);
  const backupEntries = (await unzipper.Open.file(backupZip)).files.map((file) => file.path);
  assert.ok(projectEntries.includes('project-manifest.json'));
  assert.ok(projectEntries.includes('buildbook-package.json'));
  assert.ok(projectEntries.includes('latest-files/fixture-firmware.ino'));
  assert.ok(projectEntries.includes('part-documents/controller.pdf'));
  assert.ok(projectEntries.includes('project-photos/bench-photos/bench-1-original-bench-main.png'));
  assert.ok(backupEntries.includes('backup.json'));
  assert.ok(backupEntries.includes('buildbook-backup.json'));
  assert.ok(backupEntries.includes('uploads/images/web-project.png'));
  assert.ok(backupEntries.includes('uploads/projects/web-firmware.ino'));
  assert.ok(backupEntries.includes('projects/1/image/Fixture Project.png'));
});
