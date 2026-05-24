import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BACKUP_CAPABILITIES,
  BACKUP_OPTIONAL_CAPABILITIES,
  BACKUP_REQUIRED_CAPABILITIES,
  PORTABLE_FORMAT_VERSION,
  PROJECT_EXPORT_CAPABILITIES,
  PROJECT_EXPORT_OPTIONAL_CAPABILITIES,
  PROJECT_EXPORT_REQUIRED_CAPABILITIES,
  validateBackupData,
  validateProjectExportManifest,
} from '../../../importExportSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function projectExportFixture(source = 'web') {
  const prefix = source === 'desktop' ? 'desktop' : 'web';
  return {
    type: 'buildbook-web-project-export',
    format_version: PORTABLE_FORMAT_VERSION,
    producer: source === 'desktop' ? 'BuildBook' : 'BuildBook_Web',
    producer_version: '0.2.27',
    capabilities: PROJECT_EXPORT_CAPABILITIES,
    required_capabilities: PROJECT_EXPORT_REQUIRED_CAPABILITIES,
    optional_capabilities: PROJECT_EXPORT_OPTIONAL_CAPABILITIES,
    version: '0.2.27',
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
    photo_library: [
      {
        id: 'bench-photos',
        name: 'Bench Photos',
        order_index: 0,
        photos: [
          {
            id: 'bench-1',
            name: 'Main build',
            note: 'Front angle',
            taken_at: '2026-05-16T12:15:00.000Z',
            order_index: 0,
            original_filename: 'bench-main.png',
            original_image_path: `${prefix}-bench-main.png`,
            original_archive_path: 'project-photos/bench-photos/bench-1-original-bench-main.png',
            markup_image_path: `${prefix}-bench-main-markup.png`,
            markup_archive_path: 'project-photos/bench-photos/bench-1-markup-bench-main.png',
            thumbnail_path: null,
          },
        ],
      },
    ],
    instructions: {
      intro: `<p>Instruction intro with <img src="/files/images/${prefix}-note.png"></p>`,
      steps: [
        {
          id: 'step-1',
          title: 'Assemble frame',
          body: `<p>Mount the boards and verify spacing.</p>`,
          photo_id: 'bench-1',
          order_index: 0,
        },
      ],
    },
    desktop_export_options: {},
  };
}

export function backupFixture(source = 'web') {
  const prefix = source === 'desktop' ? 'desktop' : 'web';
  return {
    type: 'buildbook-web-backup',
    format_version: PORTABLE_FORMAT_VERSION,
    producer: source === 'desktop' ? 'BuildBook' : 'BuildBook_Web',
    producer_version: '0.2.27',
    capabilities: BACKUP_CAPABILITIES,
    required_capabilities: BACKUP_REQUIRED_CAPABILITIES,
    optional_capabilities: BACKUP_OPTIONAL_CAPABILITIES,
    version: 3,
    app_version: '0.2.27',
    exported_at: '2026-05-16T12:00:00.000Z',
    includes_uploads: true,
    app_metadata: [
      { key: 'project_template', value: '{"steps":[]}', updated_at: '2026-05-16T12:00:00.000Z' },
      { key: 'theme_settings', value: '{"accent":"#2f6feb"}', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    category: [
      { id: 1, name: 'Modules', description: null, parent_id: null, image_path: null, order_index: 10, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
      { id: 2, name: 'Controllers', description: null, parent_id: 1, image_path: null, order_index: 10, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    part: [
      { id: 1, category_id: 2, name: 'Fixture Controller', product_url: 'https://example.com/controller', storage_location: 'Drawer A', notes: 'Part notes', spec_summary: '3.3V logic', image_path: `${prefix}-part.png`, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    part_document: [
      { id: 1, part_id: 1, file_type: 'pdf', file_path: `${prefix}-controller.pdf`, text_content: 'Controller PDF text', original_filename: 'controller.pdf', is_primary: true, portable_data: {}, uploaded_at: '2026-05-16T12:00:00.000Z' },
    ],
    project: [
      { id: 1, name: 'Fixture Project', status: 'active', notes: `<p>Notes <img src="/files/images/${prefix}-note.png"></p>`, image_path: `${prefix}-project.png`, portable_data: { photo_library: [{ id: 'bench-photos', name: 'Bench Photos', order_index: 0, photos: [{ id: 'bench-1', name: 'Main build', note: 'Front angle', taken_at: '2026-05-16T12:15:00.000Z', order_index: 0, original_image_path: `${prefix}-bench-main.png`, markup_image_path: `${prefix}-bench-main-markup.png`, thumbnail_path: null }] }], instructions: { intro: `<p>Instruction intro with <img src="/files/images/${prefix}-note.png"></p>`, steps: [{ id: 'step-1', title: 'Assemble frame', body: '<p>Mount the boards and verify spacing.</p>', photo_id: 'bench-1', order_index: 0 }] }, desktop_export_options: {}, manifest_extensions: {} }, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
    project_part: [
      { id: 1, project_id: 1, part_id: 1, quantity: 2, added_at: '2026-05-16T12:00:00.000Z' },
    ],
    project_file: [
      { id: 1, project_id: 1, file_path: `${prefix}-fixture.stl`, original_filename: 'fixture.stl', file_type: 'file', tracker_key: 'enclosure', file_category: 'Enclosure', version_note: 'latest enclosure', is_latest: true, portable_data: { folder_path: 'release/models' }, uploaded_at: '2026-05-16T12:00:00.000Z' },
      { id: 2, project_id: 1, file_path: `${prefix}-firmware.ino`, original_filename: 'firmware.ino', file_type: 'text', tracker_key: 'firmware', file_category: 'Firmware', version_note: null, is_latest: true, portable_data: { folder_path: 'release/firmware' }, uploaded_at: '2026-05-16T12:00:00.000Z' },
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
      { id: 1, source: 'csv', original_filename: 'fixture.csv', portable_data: {}, imported_at: '2026-05-16T12:00:00.000Z' },
    ],
    import_item: [
      { id: 1, import_batch_id: 1, status: 'draft', raw_name: 'Fixture Import Item', product_url: null, product_image_url: null, attributes: null, store: null, ordered_at: null, suggested_part_id: null, resolved_part_id: null, portable_data: {}, created_at: '2026-05-16T12:00:00.000Z', updated_at: '2026-05-16T12:00:00.000Z' },
    ],
  };
}

function desktopBackupFixtureManifest(source = 'web') {
  const prefix = source === 'desktop' ? 'desktop' : 'web';
  return {
    kind: 'buildbook-full-backup',
    version: '0.2.21',
    exportedAt: '2026-05-16T12:00:00.000Z',
    state: {
      version: '0.2.21',
      theme: { accent: '#2f6feb' },
      categories: [
        { id: 'cat-unassigned', name: 'Unassigned', parentId: null, sortOrder: 0 },
        { id: 'cat-web-1', name: 'Modules', parentId: null, sortOrder: 1 },
        { id: 'cat-web-2', name: 'Controllers', parentId: 'cat-web-1', sortOrder: 2 },
      ],
      template: {
        steps: ['Design'],
        checklist: [],
        fileTrackers: [
          { id: 'tracker-web-enclosure', name: 'Enclosure', extensions: '.stl', color: '#f778ba', programPath: '' },
          { id: 'tracker-web-firmware', name: 'Firmware', extensions: '.ino', color: '#56d364', programPath: '' },
        ],
      },
      parts: [
        {
          id: 'part-web-1',
          name: 'Fixture Controller',
          categoryId: 'cat-web-2',
          image: '',
          imagePackagePath: 'parts/1/image/Fixture Controller.png',
          documents: [
            { id: 'doc-web-1', name: 'controller.pdf', packagePath: 'parts/1/documents/1-controller.pdf', type: 'pdf' },
          ],
        },
      ],
      projects: [
        {
          id: 'project-web-1',
          name: 'Fixture Project',
          status: 'active',
          image: '',
          imagePackagePath: 'projects/1/image/Fixture Project.png',
          notes: `<p>Notes <img src="/files/images/${prefix}-note.png" data-project-image-path="${prefix}-note.png" data-project-image-package-path="projects/1/note-images/1-${prefix}-note.png"></p>`,
          noteImages: [
            { id: 'note-image-web-1-1', name: `${prefix}-note.png`, packagePath: `projects/1/note-images/1-${prefix}-note.png` },
          ],
          checklist: [{ id: 'check-web-1', text: 'Verify wiring', completedAt: '' }],
          nextSteps: [],
          partIds: ['part-web-1'],
          partQuantities: { 'part-web-1': 2 },
          photoFolders: [
            {
              id: 'bench-photos',
              name: 'Bench Photos',
              photos: [
                {
                  id: 'bench-1',
                  name: 'Main build',
                  note: 'Front angle',
                  packagePath: 'projects/1/photos/bench-photos/bench-1-bench-main.png',
                  markupPackagePath: 'projects/1/photos/bench-photos/markup-bench-1-bench-main.png',
                },
              ],
            },
          ],
          instructions: {
            intro: `<p>Instruction intro with <img src="/files/images/${prefix}-note.png" data-project-image-path="${prefix}-note.png" data-project-image-package-path="projects/1/instructions/intro-images/1-${prefix}-note.png"></p>`,
            steps: [{ id: 'step-1', title: 'Assemble frame', body: '<p>Mount the boards and verify spacing.</p>', photoId: 'bench-1' }],
          },
          files: [
            {
              id: 'file-folder-web-1',
              type: 'folder',
              trackerId: 'tracker-web-enclosure',
              name: 'models',
              latest: true,
              notes: 'latest enclosure',
              folderFiles: [{ id: 'file-child-web-1', name: 'fixture.stl', relativePath: 'fixture.stl', packagePath: 'projects/1/files/tracker_web_enclosure/file_folder_web_1/fixture.stl' }],
            },
            {
              id: 'file-folder-web-2',
              type: 'folder',
              trackerId: 'tracker-web-firmware',
              name: 'firmware',
              latest: true,
              notes: '',
              folderFiles: [{ id: 'file-child-web-2', name: 'firmware.ino', relativePath: 'firmware.ino', packagePath: 'projects/1/files/tracker_web_firmware/file_folder_web_2/firmware.ino' }],
            },
          ],
        },
      ],
      importBatches: [
        { id: 'batch-web-1', name: 'fixture.csv', fileName: 'fixture.csv', source: 'csv', createdAt: '2026-05-16T12:00:00.000Z', items: [] },
      ],
    },
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
  archive.append('png', { name: 'project-photos/bench-photos/bench-1-original-bench-main.png' });
  archive.append('png', { name: 'project-photos/bench-photos/bench-1-markup-bench-main.png' });
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
    archive.append(JSON.stringify({ kind: 'buildbook-project-package', version: '0.2.21', exportedAt: '2026-05-16T12:00:00.000Z', project: { name: manifest.project.name }, parts: [] }, null, 2), { name: 'buildbook-package.json' });
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
    archive.append(JSON.stringify(desktopBackupFixtureManifest(source), null, 2), { name: 'buildbook-backup.json' });
    archive.append('png', { name: `uploads/images/${source}-project.png` });
    archive.append('png', { name: `uploads/images/${source}-part.png` });
    archive.append('png', { name: `uploads/images/${source}-note.png` });
    archive.append('png', { name: `uploads/images/${source}-bench-main.png` });
    archive.append('png', { name: `uploads/images/${source}-bench-main-markup.png` });
    archive.append('%PDF-1.4\n% controller\n', { name: `uploads/documents/${source}-controller.pdf` });
    archive.append('solid fixture\nendsolid fixture\n', { name: `uploads/projects/${source}-fixture.stl` });
    archive.append('void setup() {}\nvoid loop() {}\n', { name: `uploads/projects/${source}-firmware.ino` });
    archive.append('raw_name\nFixture Import Item\n', { name: `uploads/imports/${source}-fixture.csv` });
    archive.append('png', { name: 'projects/1/image/Fixture Project.png' });
    archive.append('png', { name: `projects/1/note-images/1-${source}-note.png` });
    archive.append('png', { name: `projects/1/instructions/intro-images/1-${source}-note.png` });
    archive.append('png', { name: 'projects/1/photos/bench-photos/bench-1-bench-main.png' });
    archive.append('png', { name: 'projects/1/photos/bench-photos/markup-bench-1-bench-main.png' });
    archive.append('solid fixture\nendsolid fixture\n', { name: 'projects/1/files/tracker_web_enclosure/file_folder_web_1/fixture.stl' });
    archive.append('void setup() {}\nvoid loop() {}\n', { name: 'projects/1/files/tracker_web_firmware/file_folder_web_2/firmware.ino' });
    archive.append('png', { name: 'parts/1/image/Fixture Controller.png' });
    archive.append('%PDF-1.4\n% controller\n', { name: 'parts/1/documents/1-controller.pdf' });
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
