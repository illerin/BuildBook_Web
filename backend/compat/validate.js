import {
  TYPE_PROJECT_EXPORT,
  TYPE_FULL_BACKUP,
  SUPPORTED_WEB_BACKUP_VERSIONS,
  BACKUP_TABLES,
} from './contract.js';

function fail(message) {
  const error = new Error(message);
  error.validation = true;
  throw error;
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function expectRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
}

function expectArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
}

function expectString(value, label) {
  if (typeof value !== 'string') fail(`${label} must be a string.`);
}

function expectBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean.`);
}

function expectOptionalString(value, label) {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    fail(`${label} must be a string or null.`);
  }
}

function expectTimestamp(value, label) {
  expectString(value, label);
  if (Number.isNaN(Date.parse(value))) fail(`${label} must be an ISO timestamp.`);
}

function expectPortableExtensions(value, label) {
  if (value !== undefined && value !== null && !isRecord(value)) fail(`${label} must be an object.`);
}

function expectCategoryPath(value, label) {
  if (isNonEmptyString(value)) return;
  if (Array.isArray(value) && value.length && value.every(isNonEmptyString)) return;
  fail(`${label} must be a non-empty string or non-empty string array.`);
}

function expectHandshake(manifest, expectedType) {
  expectRecord(manifest, 'manifest');
  if (manifest.type !== expectedType) fail(`Manifest type must be ${expectedType}.`);
  expectString(manifest.format_version, 'format_version');
  if (!/^\d+\.\d+$/.test(manifest.format_version)) fail('format_version must use major.minor format.');
  expectString(manifest.producer, 'producer');
  if (!manifest.producer.trim()) fail('producer must not be empty.');
  expectString(manifest.producer_version, 'producer_version');
  if (!manifest.producer_version.trim()) fail('producer_version must not be empty.');
  expectArray(manifest.capabilities, 'capabilities');
  expectArray(manifest.required_capabilities, 'required_capabilities');
  expectArray(manifest.optional_capabilities, 'optional_capabilities');
  expectTimestamp(manifest.exported_at, 'exported_at');
  expectPortableExtensions(manifest.manifest_extensions, 'manifest_extensions');
  expectPortableExtensions(manifest.portable_extensions, 'portable_extensions');
}

function expectProjectExportFile(file, index) {
  expectRecord(file, `files[${index}]`);
  for (const key of ['id', 'original_filename', 'file_type', 'tracker_key', 'file_category', 'archive_path']) {
    const value = file[key];
    if (!(isNonEmptyString(value) || typeof value === 'number')) {
      fail(`files[${index}].${key} must be a non-empty string.`);
    }
  }
  if (typeof file.is_latest !== 'boolean') fail(`files[${index}].is_latest must be a boolean.`);
  expectTimestamp(file.uploaded_at, `files[${index}].uploaded_at`);
  expectOptionalString(file.version_note, `files[${index}].version_note`);
  expectPortableExtensions(file.portable_extensions, `files[${index}].portable_extensions`);
}

function expectProjectExportPartDocument(doc, partIndex, docIndex) {
  expectRecord(doc, `parts[${partIndex}].documents[${docIndex}]`);
  for (const key of ['id', 'file_type', 'file_path', 'original_filename', 'archive_path']) {
    const value = doc[key];
    if (!(isNonEmptyString(value) || typeof value === 'number')) {
      fail(`parts[${partIndex}].documents[${docIndex}].${key} must be a non-empty string.`);
    }
  }
  if (typeof doc.is_primary !== 'boolean') fail(`parts[${partIndex}].documents[${docIndex}].is_primary must be a boolean.`);
  expectOptionalString(doc.text_content, `parts[${partIndex}].documents[${docIndex}].text_content`);
  expectTimestamp(doc.uploaded_at, `parts[${partIndex}].documents[${docIndex}].uploaded_at`);
  expectPortableExtensions(doc.portable_extensions, `parts[${partIndex}].documents[${docIndex}].portable_extensions`);
}

function expectProjectExportPart(part, index) {
  expectRecord(part, `parts[${index}]`);
  if (!isNonEmptyString(part.name)) fail(`parts[${index}].name must be a non-empty string.`);
  expectCategoryPath(part.category_path, `parts[${index}].category_path`);
  if (!isNonEmptyString(part.category_label)) fail(`parts[${index}].category_label must be a non-empty string.`);
  if (!Number.isInteger(part.quantity) || part.quantity < 1) fail(`parts[${index}].quantity must be an integer >= 1.`);
  for (const key of ['product_url', 'storage_location', 'notes', 'spec_summary', 'image_archive_path']) {
    expectOptionalString(part[key], `parts[${index}].${key}`);
  }
  expectArray(part.documents, `parts[${index}].documents`);
  part.documents.forEach((doc, docIndex) => expectProjectExportPartDocument(doc, index, docIndex));
  expectPortableExtensions(part.portable_extensions, `parts[${index}].portable_extensions`);
}

function expectProjectExportChecklist(item, index) {
  expectRecord(item, `checklist[${index}]`);
  if (!isNonEmptyString(item.text)) fail(`checklist[${index}].text must be a non-empty string.`);
  if (typeof item.is_completed !== 'boolean') fail(`checklist[${index}].is_completed must be a boolean.`);
  if (!Number.isInteger(item.order_index)) fail(`checklist[${index}].order_index must be an integer.`);
  if (item.completed_at !== null) expectOptionalString(item.completed_at, `checklist[${index}].completed_at`);
}

function expectProjectExportStep(step, index) {
  expectRecord(step, `steps[${index}]`);
  if (!isNonEmptyString(step.name)) fail(`steps[${index}].name must be a non-empty string.`);
  if (!Number.isInteger(step.order_index)) fail(`steps[${index}].order_index must be an integer.`);
}

function expectProjectPhoto(photo, folderIndex, photoIndex) {
  expectRecord(photo, `photo_library[${folderIndex}].photos[${photoIndex}]`);
  for (const key of ['id', 'name', 'original_filename']) {
    if (!isNonEmptyString(photo[key])) fail(`photo_library[${folderIndex}].photos[${photoIndex}].${key} must be a non-empty string.`);
  }
  if (!Number.isInteger(photo.order_index)) fail(`photo_library[${folderIndex}].photos[${photoIndex}].order_index must be an integer.`);
  for (const key of ['note', 'taken_at', 'original_image_path', 'original_archive_path', 'markup_image_path', 'markup_archive_path', 'thumbnail_path']) {
    expectOptionalString(photo[key], `photo_library[${folderIndex}].photos[${photoIndex}].${key}`);
  }
}

function expectProjectPhotoFolder(folder, index) {
  expectRecord(folder, `photo_library[${index}]`);
  for (const key of ['id', 'name']) {
    if (!isNonEmptyString(folder[key])) fail(`photo_library[${index}].${key} must be a non-empty string.`);
  }
  if (!Number.isInteger(folder.order_index)) fail(`photo_library[${index}].order_index must be an integer.`);
  expectArray(folder.photos, `photo_library[${index}].photos`);
  folder.photos.forEach((photo, photoIndex) => expectProjectPhoto(photo, index, photoIndex));
}

function expectInstructionStep(step, index) {
  expectRecord(step, `instructions.steps[${index}]`);
  for (const key of ['id', 'title', 'body']) {
    if (!isNonEmptyString(step[key])) fail(`instructions.steps[${index}].${key} must be a non-empty string.`);
  }
  if (!Number.isInteger(step.order_index)) fail(`instructions.steps[${index}].order_index must be an integer.`);
  expectOptionalString(step.photo_id, `instructions.steps[${index}].photo_id`);
}

export function validateProjectManifest(manifest) {
  expectHandshake(manifest, TYPE_PROJECT_EXPORT);
  expectRecord(manifest.project, 'project');
  if (!isNonEmptyString(manifest.project.name)) fail('project.name must be a non-empty string.');
  expectOptionalString(manifest.project.status, 'project.status');
  expectOptionalString(manifest.project.notes, 'project.notes');
  expectOptionalString(manifest.project.image_path, 'project.image_path');
  expectOptionalString(manifest.project.image_archive_path, 'project.image_archive_path');
  expectArray(manifest.note_images, 'note_images');
  manifest.note_images.forEach((image, index) => {
    expectRecord(image, `note_images[${index}]`);
    if (!isNonEmptyString(image.image_path)) fail(`note_images[${index}].image_path must be a non-empty string.`);
    if (!isNonEmptyString(image.archive_path)) fail(`note_images[${index}].archive_path must be a non-empty string.`);
  });
  expectArray(manifest.steps, 'steps');
  manifest.steps.forEach(expectProjectExportStep);
  expectArray(manifest.checklist, 'checklist');
  manifest.checklist.forEach(expectProjectExportChecklist);
  expectArray(manifest.files, 'files');
  manifest.files.forEach(expectProjectExportFile);
  expectArray(manifest.parts, 'parts');
  manifest.parts.forEach(expectProjectExportPart);
  expectArray(manifest.photo_library, 'photo_library');
  manifest.photo_library.forEach(expectProjectPhotoFolder);
  expectRecord(manifest.instructions, 'instructions');
  expectOptionalString(manifest.instructions.intro, 'instructions.intro');
  expectArray(manifest.instructions.steps, 'instructions.steps');
  manifest.instructions.steps.forEach(expectInstructionStep);
  return manifest;
}

export function validateBackupManifest(manifest) {
  expectHandshake(manifest, TYPE_FULL_BACKUP);
  expectBoolean(manifest.includes_uploads, 'includes_uploads');
  for (const table of BACKUP_TABLES) {
    expectArray(manifest[table], table);
  }
  return manifest;
}

export function validateLegacyBackupManifest(manifest) {
  expectRecord(manifest, 'backup');
  if (manifest.type !== TYPE_FULL_BACKUP) fail(`Legacy backup type must be ${TYPE_FULL_BACKUP}.`);
  if (!SUPPORTED_WEB_BACKUP_VERSIONS.includes(manifest.version)) {
    fail(`Legacy backup version ${manifest.version} is not supported.`);
  }
  for (const table of BACKUP_TABLES) {
    expectArray(manifest[table], table);
  }
  return manifest;
}
