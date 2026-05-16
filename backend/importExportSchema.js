export const PROJECT_EXPORT_TYPE = 'buildbook-web-project-export';
export const BACKUP_TYPE = 'buildbook-web-backup';
export const SUPPORTED_BACKUP_VERSIONS = [2, 3];

export class FormatValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FormatValidationError';
  }
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireRecord(value, path, label) {
  if (!isRecord(value)) throw new FormatValidationError(`${label} is missing ${path}.`);
}

function requireField(value, field, path, label) {
  if (!hasOwn(value, field)) {
    throw new FormatValidationError(`${label} is missing ${path ? `${path}.` : ''}${field}.`);
  }
}

function requireArray(value, field, path, label) {
  requireField(value, field, path, label);
  if (!Array.isArray(value[field])) {
    throw new FormatValidationError(`${label} field ${path ? `${path}.` : ''}${field} must be an array.`);
  }
}

function validateObjectFields(value, fields, path, label) {
  requireRecord(value, path || 'object', label);
  fields.forEach((field) => requireField(value, field, path, label));
}

function validateArrayItems(value, field, fields, label) {
  requireArray(value, field, '', label);
  value[field].forEach((item, index) => {
    validateObjectFields(item, fields, `${field}[${index}]`, label);
  });
}

const PROJECT_FIELDS = ['name', 'status', 'notes', 'image_path', 'image_archive_path'];
const NOTE_IMAGE_FIELDS = ['image_path', 'archive_path'];
const STEP_FIELDS = ['name', 'order_index'];
const CHECKLIST_FIELDS = ['text', 'is_completed', 'completed_at', 'order_index'];
const FILE_FIELDS = [
  'id',
  'original_filename',
  'file_type',
  'tracker_key',
  'file_category',
  'version_note',
  'is_latest',
  'uploaded_at',
  'archive_path',
];
const PART_FIELDS = [
  'name',
  'quantity',
  'category_path',
  'category_label',
  'product_url',
  'storage_location',
  'notes',
  'spec_summary',
  'image_archive_path',
  'documents',
];
const PART_DOCUMENT_FIELDS = [
  'id',
  'file_type',
  'file_path',
  'text_content',
  'original_filename',
  'is_primary',
  'uploaded_at',
  'archive_path',
];

export function validateProjectExportManifest(manifest) {
  const label = 'Project export';
  requireRecord(manifest, 'project-manifest.json', label);
  if (manifest.type !== PROJECT_EXPORT_TYPE) {
    throw new FormatValidationError('This is not a BuildBook_Web project export.');
  }
  ['type', 'version', 'exported_at', 'project', 'note_images', 'steps', 'checklist', 'files', 'parts']
    .forEach((field) => requireField(manifest, field, '', label));
  validateObjectFields(manifest.project, PROJECT_FIELDS, 'project', label);
  validateArrayItems(manifest, 'note_images', NOTE_IMAGE_FIELDS, label);
  validateArrayItems(manifest, 'steps', STEP_FIELDS, label);
  validateArrayItems(manifest, 'checklist', CHECKLIST_FIELDS, label);
  validateArrayItems(manifest, 'files', FILE_FIELDS, label);
  validateArrayItems(manifest, 'parts', PART_FIELDS, label);
  manifest.parts.forEach((part, partIndex) => {
    requireArray(part, 'documents', `parts[${partIndex}]`, label);
    part.documents.forEach((doc, docIndex) => {
      validateObjectFields(doc, PART_DOCUMENT_FIELDS, `parts[${partIndex}].documents[${docIndex}]`, label);
    });
  });
  return manifest;
}

export const BACKUP_TABLES = [
  'app_metadata',
  'category',
  'part',
  'part_document',
  'project',
  'project_part',
  'project_file',
  'project_checklist_item',
  'step_definition',
  'project_step',
  'import_batch',
  'import_item',
];

export function validateBackupData(data) {
  requireRecord(data, 'backup.json', 'Backup');
  if (data.type !== BACKUP_TYPE) {
    throw new FormatValidationError('This is not a BuildBook_Web backup.');
  }
  ['type', 'version'].forEach((field) => requireField(data, field, '', 'Backup'));
  if (!SUPPORTED_BACKUP_VERSIONS.includes(data.version)) {
    if (Number(data.version) > Math.max(...SUPPORTED_BACKUP_VERSIONS)) {
      throw new FormatValidationError(`Backup format version ${data.version} is newer than this app supports.`);
    }
    throw new FormatValidationError(`Backup format version ${data.version} is not supported.`);
  }
  ['app_version', 'exported_at', 'includes_uploads'].forEach((field) => {
    requireField(data, field, '', 'Backup');
  });
  BACKUP_TABLES.forEach((table) => {
    if (!hasOwn(data, table)) {
      throw new FormatValidationError(`Backup is missing required table ${table}.`);
    }
    if (!Array.isArray(data[table])) {
      throw new FormatValidationError(`Backup table ${table} must be an array.`);
    }
  });
  return data;
}
