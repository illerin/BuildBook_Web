import {
  TYPE_PROJECT_EXPORT,
  TYPE_FULL_BACKUP,
  SUPPORTED_WEB_BACKUP_VERSIONS,
  BACKUP_TABLES as SHARED_BACKUP_TABLES,
} from './compat/contract.js';
import {
  validateProjectManifest as validateSharedProjectManifest,
  validateBackupManifest as validateSharedBackupManifest,
  validateLegacyBackupManifest,
} from './compat/validate.js';

export const PROJECT_EXPORT_TYPE = TYPE_PROJECT_EXPORT;
export const BACKUP_TYPE = TYPE_FULL_BACKUP;
export const SUPPORTED_BACKUP_VERSIONS = SUPPORTED_WEB_BACKUP_VERSIONS;
export const BACKUP_TABLES = SHARED_BACKUP_TABLES;
export const PORTABLE_FORMAT_VERSION = '1.0';
export const PROJECT_EXPORT_CAPABILITIES = [
  'rich_notes',
  'note_images',
  'project_cover_image',
  'project_photos',
  'photo_folders',
  'photo_markup',
  'instructions',
  'instruction_photo_links',
  'linked_parts',
  'project_part_quantities',
  'part_images',
  'part_documents_multi',
  'default_part_preview_document',
  'structured_storage_locations',
  'file_tracker_metadata',
  'folder_uploads',
];
export const PROJECT_EXPORT_REQUIRED_CAPABILITIES = [
  'rich_notes',
  'note_images',
  'linked_parts',
  'project_part_quantities',
];
export const PROJECT_EXPORT_OPTIONAL_CAPABILITIES = [
  'file_revision_history',
  'multiple_latest_files_per_tracker',
  'file_tracker_colors',
];
export const BACKUP_CAPABILITIES = [
  ...PROJECT_EXPORT_CAPABILITIES,
  'theme_settings',
  'template_settings',
  'import_batches',
  'import_item_status',
];
export const BACKUP_REQUIRED_CAPABILITIES = [
  'rich_notes',
  'linked_parts',
  'project_part_quantities',
  'theme_settings',
  'template_settings',
];
export const BACKUP_OPTIONAL_CAPABILITIES = PROJECT_EXPORT_OPTIONAL_CAPABILITIES;

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

function normalizeProjectExportManifest(manifest) {
  if (!isRecord(manifest)) return manifest;
  return {
    ...manifest,
    format_version: manifest.format_version || PORTABLE_FORMAT_VERSION,
    producer: manifest.producer || 'BuildBook_Web',
    producer_version: manifest.producer_version || String(manifest.version || 'legacy'),
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : PROJECT_EXPORT_CAPABILITIES,
    required_capabilities: Array.isArray(manifest.required_capabilities) ? manifest.required_capabilities : PROJECT_EXPORT_REQUIRED_CAPABILITIES,
    optional_capabilities: Array.isArray(manifest.optional_capabilities) ? manifest.optional_capabilities : PROJECT_EXPORT_OPTIONAL_CAPABILITIES,
    files: Array.isArray(manifest.files) ? manifest.files.map((file) => ({
      ...file,
      id: file?.id === undefined || file?.id === null ? '' : String(file.id),
    })) : manifest.files,
    note_images: Array.isArray(manifest.note_images) ? manifest.note_images.map((image, index) => ({
      ...image,
      id: image?.id === undefined || image?.id === null ? `note-image-${index + 1}` : String(image.id),
    })) : manifest.note_images,
    parts: Array.isArray(manifest.parts) ? manifest.parts.map((part) => ({
      ...part,
      documents: Array.isArray(part?.documents) ? part.documents.map((doc) => ({
        ...doc,
        id: doc?.id === undefined || doc?.id === null ? '' : String(doc.id),
      })) : part?.documents,
    })) : manifest.parts,
  };
}

export function validateProjectExportManifest(manifest) {
  const label = 'Project export';
  requireRecord(manifest, 'project-manifest.json', label);
  if (manifest.type !== PROJECT_EXPORT_TYPE) {
    throw new FormatValidationError('This is not a BuildBook_Web project export.');
  }
  ['type', 'version', 'exported_at', 'project', 'note_images', 'steps', 'checklist', 'files', 'parts', 'photo_library', 'instructions', 'desktop_export_options']
    .forEach((field) => requireField(manifest, field, '', label));
  validateObjectFields(manifest.project, PROJECT_FIELDS, 'project', label);
  validateArrayItems(manifest, 'note_images', NOTE_IMAGE_FIELDS, label);
  validateArrayItems(manifest, 'steps', STEP_FIELDS, label);
  validateArrayItems(manifest, 'checklist', CHECKLIST_FIELDS, label);
  validateArrayItems(manifest, 'files', FILE_FIELDS, label);
  validateArrayItems(manifest, 'parts', PART_FIELDS, label);
  if (!Array.isArray(manifest.photo_library)) {
    throw new FormatValidationError('Project export field photo_library must be an array.');
  }
  if (!isRecord(manifest.instructions)) {
    throw new FormatValidationError('Project export field instructions must be an object.');
  }
  ['intro', 'steps'].forEach((field) => requireField(manifest.instructions, field, 'instructions', label));
  if (!Array.isArray(manifest.instructions.steps)) {
    throw new FormatValidationError('Project export field instructions.steps must be an array.');
  }
  requireRecord(manifest.desktop_export_options, 'desktop_export_options', label);
  manifest.parts.forEach((part, partIndex) => {
    requireArray(part, 'documents', `parts[${partIndex}]`, label);
    part.documents.forEach((doc, docIndex) => {
      validateObjectFields(doc, PART_DOCUMENT_FIELDS, `parts[${partIndex}].documents[${docIndex}]`, label);
    });
  });
  try {
    validateSharedProjectManifest(normalizeProjectExportManifest(manifest));
  } catch (error) {
    if (error?.message?.includes('files[') && error.message.includes('.archive_path')) {
      const match = error.message.match(/files\[(\d+)\]\.archive_path/);
      throw new FormatValidationError(`Project export is missing files[${match?.[1] || 0}].archive_path.`);
    }
    throw new FormatValidationError(error.message);
  }
  return manifest;
}

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
  try {
    if (data.format_version) {
      validateSharedBackupManifest({
        ...data,
        producer: data.producer || 'BuildBook_Web',
        producer_version: data.producer_version || String(data.app_version || data.version || 'legacy'),
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : BACKUP_CAPABILITIES,
        required_capabilities: Array.isArray(data.required_capabilities) ? data.required_capabilities : BACKUP_REQUIRED_CAPABILITIES,
        optional_capabilities: Array.isArray(data.optional_capabilities) ? data.optional_capabilities : BACKUP_OPTIONAL_CAPABILITIES,
      });
    } else {
      validateLegacyBackupManifest(data);
    }
  } catch (error) {
    if (error?.message?.startsWith('Legacy backup version')) {
      if (Number(data.version) > Math.max(...SUPPORTED_BACKUP_VERSIONS)) {
        throw new FormatValidationError(`Backup format version ${data.version} is newer than this app supports.`);
      }
      throw new FormatValidationError(`Backup format version ${data.version} is not supported.`);
    }
    throw new FormatValidationError(error.message);
  }
  return data;
}
