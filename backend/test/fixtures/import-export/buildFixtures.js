import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateBackupData, validateProjectExportManifest } from '../../../importExportSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function projectExportFixture(source = 'web') {
  const prefix = source === 'desktop' ? 'desktop' : 'web';
  return {
    type: 'buildbook-web-project-export',
    version: '0.2.14',
    exported_at: '2026-05-16T12:00:00.000Z',
    project: {
      name: `${prefix} Compatibility Project`,
      status: 'active',
      notes: `<p>Build notes with <img src="/files/images/${prefix}-note.png"></p>`,
      image_path: `${prefix}-project.png`,
      image_archive_path: 'project-image/project.png',
    },
    note_images: [
      { image_path: `${prefix}-note.png`, archive_path: 'note-images/note.png' },
    ],
    steps: [
      { name: 'Design', order_index: 10 },
      { name: 'Firmware', order_index: 20 },
    ],
    checklist: [
      { text: 'Verify wiring', is_completed: false, completed_at: null, order_index: 0 },
      { text: 'Flash firmware', is_completed: true, completed_at: '2026-05-16T12:30:00.000Z', order_index: 1 },
    ],
    files: [
      {
        id: 1,
        original_filename: 'fixture-part.stl',
        file_type: 'file',
        tracker_key: 'enclosure',
        file_category: 'Enclosure',
        version_note: 'fixture enclosure',
        is_latest: true,
        uploaded_at: '2026-05-16T12:10:00.000Z',
        archive_path: 'latest-files/fixture-part.stl',
      },
      {
        id: 2,
        original_filename: 'fixture-firmware.ino',
        file_type: 'text',
        tracker_key: 'firmware',
        file_category: 'Firmware',
        version_note: null,
        is_latest: true,
        uploaded_at: '2026-05-16T12:11:00.000Z',
        archive_path: 'latest-files/fixture-firmware.ino',
      },
      {
        id: 3,
        original_filename: 'fixture-datasheet.pdf',
        file_type: 'pdf',
        tracker_key: 'datasheet',
        file_category: 'Datasheets',
        version_note: null,
        is_latest: true,
        uploaded_at: '2026-05-16T12:12:00.000Z',
        archive_path: 'latest-files/fixture-datasheet.pdf',
      },
    ],
    parts: [
      {
        name: 'Fixture Controller',
        quantity: 2,
        category_path: ['Modules', 'Controllers'],
        category_label: 'Modules / Controllers',
        product_url: 'https://example.com/controller',
        storage_location: 'Drawer A',
        notes: 'Desktop and web compatible part.',
        spec_summary: '3.3V logic',
        image_archive_path: 'part-images/controller.png',
        documents: [
          {
            id: 1,
            file_type: 'pdf',
            file_path: `${prefix}-controller.pdf`,
            text_content: 'Controller PDF text',
            original_filename: 'controller.pdf',
            is_primary: true,
            uploaded_at: '2026-05-16T12:20:00.000Z',
            archive_path: 'part-documents/controller.pdf',
          },
        ],
      },
    ],
  };
}

export function backupFixture(source = 'web') {
  const prefix = source === 'desktop' ? 'desktop' : 'web';
  return {
    type: 'buildbook-web-backup',
    version: 3,
    app_version: '0.2.14',
    exported_at: '2026-05-16T12:00:00.000Z',
    includes_uploads: true,
    app_metadata: [{ key: 'project_template', value: '{"steps":[]}', updated_at: '2026-05-16T12:00:00.000Z' }],
    category: [
      { id: 1, name: 'Modules', description: null, parent_id: null, image_path: null, order_index: 10, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
      { id: 2, name: 'Controllers', description: null, parent_id: 1, image_path: null, order_index: 10, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    part: [
      { id: 1, category_id: 2, name: 'Fixture Controller', product_url: 'https://example.com/controller', storage_location: 'Drawer A', notes: 'Part notes', spec_summary: '3.3V logic', image_path: `${prefix}-part.png`, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    part_document: [
      { id: 1, part_id: 1, file_type: 'pdf', file_path: `${prefix}-controller.pdf`, text_content: 'Controller PDF text', original_filename: 'controller.pdf', is_primary: true, uploaded_at: '2026-05-16T12:00:00.000Z' },
    ],
    project: [
      { id: 1, name: 'Fixture Project', status: 'active', notes: `<p>Notes <img src="/files/images/${prefix}-note.png"></p>`, image_path: `${prefix}-project.png`, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    project_part: [
      { id: 1, project_id: 1, part_id: 1, quantity: 2, added_at: '2026-05-16T12:00:00.000Z' },
    ],
    project_file: [
      { id: 1, project_id: 1, file_path: `${prefix}-fixture.stl`, original_filename: 'fixture.stl', file_type: 'file', tracker_key: 'enclosure', file_category: 'Enclosure', version_note: 'latest enclosure', is_latest: true, uploaded_at: '2026-05-16T12:00:00.000Z' },
      { id: 2, project_id: 1, file_path: `${prefix}-firmware.ino`, original_filename: 'firmware.ino', file_type: 'text', tracker_key: 'firmware', file_category: 'Firmware', version_note: null, is_latest: true, uploaded_at: '2026-05-16T12:00:00.000Z' },
    ],
    project_checklist_item: [
      { id: 1, project_id: 1, text: 'Verify wiring', is_completed: false, completed_at: null, order_index: 0 },
    ],
    step_definition: [
      { id: 1, name: 'Design', order_index: 10 },
    ],
    project_step: [
      { project_id: 1, step_definition_id: 1, created_at: '2026-05-16T12:00:00.000Z' },
    ],
    import_batch: [
      { id: 1, source: 'csv', original_filename: 'fixture.csv', imported_at: '2026-05-16T12:00:00.000Z' },
    ],
    import_item: [
      { id: 1, import_batch_id: 1, status: 'draft', raw_name: 'Fixture Import Item', product_url: null, product_image_url: null, attributes: null, store: null, ordered_at: null, suggested_part_id: null, resolved_part_id: null, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
  };
}

function appendFixtureFiles(archive) {
  archive.append('solid fixture\nendsolid fixture\n', { name: 'latest-files/fixture-part.stl' });
  archive.append('void setup() {}\nvoid loop() {}\n', { name: 'latest-files/fixture-firmware.ino' });
  archive.append('%PDF-1.4\n% fixture\n', { name: 'latest-files/fixture-datasheet.pdf' });
  archive.append('png', { name: 'project-image/project.png' });
  archive.append('png', { name: 'note-images/note.png' });
  archive.append('png', { name: 'part-images/controller.png' });
  archive.append('%PDF-1.4\n% controller\n', { name: 'part-documents/controller.pdf' });
}

export async function writeProjectExportZip(target, source = 'web') {
  const manifest = projectExportFixture(source);
  validateProjectExportManifest(manifest);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(target);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.append('<html><body>Fixture</body></html>', { name: 'project-summary.html' });
    archive.append('Fixture notes', { name: 'notes.txt' });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'project-manifest.json' });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'project-data.json' });
    appendFixtureFiles(archive);
    archive.finalize();
  });
  return manifest;
}

export async function writeBackupZip(target, source = 'web') {
  const backup = backupFixture(source);
  validateBackupData(backup);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(target);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(backup, null, 2), { name: 'backup.json' });
    archive.append('png', { name: `uploads/images/${source}-project.png` });
    archive.append('png', { name: `uploads/images/${source}-part.png` });
    archive.append('png', { name: `uploads/images/${source}-note.png` });
    archive.append('%PDF-1.4\n% controller\n', { name: `uploads/documents/${source}-controller.pdf` });
    archive.append('solid fixture\nendsolid fixture\n', { name: `uploads/projects/${source}-fixture.stl` });
    archive.append('void setup() {}\nvoid loop() {}\n', { name: `uploads/projects/${source}-firmware.ino` });
    archive.append('raw_name\nFixture Import Item\n', { name: `uploads/imports/${source}-fixture.csv` });
    archive.finalize();
  });
  return backup;
}

export async function writeAllFixtures(targetDir = path.join(__dirname, 'generated')) {
  fs.mkdirSync(targetDir, { recursive: true });
  await writeProjectExportZip(path.join(targetDir, 'web-project-export.zip'), 'web');
  await writeProjectExportZip(path.join(targetDir, 'desktop-project-export.zip'), 'desktop');
  await writeBackupZip(path.join(targetDir, 'web-full-backup.zip'), 'web');
  await writeBackupZip(path.join(targetDir, 'desktop-full-backup.zip'), 'desktop');
  return targetDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetDir = await writeAllFixtures();
  if (process.argv.includes('--validate')) {
    validateProjectExportManifest(projectExportFixture('web'));
    validateProjectExportManifest(projectExportFixture('desktop'));
    validateBackupData(backupFixture('web'));
    validateBackupData(backupFixture('desktop'));
  }
  console.log(`Compatibility fixtures written to ${targetDir}`);
}
