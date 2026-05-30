export const CONTRACT_VERSION = '1.0.0';

export const TYPE_PROJECT_EXPORT = 'buildbook-web-project-export';
export const TYPE_FULL_BACKUP = 'buildbook-web-backup';
export const DESKTOP_COMPAT_PROJECT_ENTRY = 'buildbook-package.json';
export const DESKTOP_COMPAT_BACKUP_ENTRY = 'buildbook-backup.json';

export const SUPPORTED_WEB_BACKUP_VERSIONS = [2, 3];

export const CANONICAL_PROJECT_EXPORT_FIELDS = [
  'type',
  'format_version',
  'producer',
  'producer_version',
  'capabilities',
  'required_capabilities',
  'optional_capabilities',
  'exported_at',
  'project',
  'note_images',
  'steps',
  'checklist',
  'files',
  'parts',
  'photo_library',
  'instructions',
  'portable_extensions',
  'manifest_extensions'
];

export const CANONICAL_FULL_BACKUP_FIELDS = [
  'type',
  'format_version',
  'producer',
  'producer_version',
  'capabilities',
  'required_capabilities',
  'optional_capabilities',
  'exported_at',
  'includes_uploads',
  'portable_extensions',
  'manifest_extensions'
];

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
  'import_item'
];

export const CHUNK_SIZE_GUIDANCE = {
  minimum_bytes: 8 * 1024 * 1024,
  recommended_bytes: 64 * 1024 * 1024,
  maximum_bytes: 128 * 1024 * 1024
};
