# BuildBook Import/Export Compatibility Format

This document is the compatibility contract between BuildBook_Web and the Windows/Tauri BuildBook desktop app. Do not rename type strings, database columns, or JSON fields in these formats unless a new explicit format version is introduced.

## Type Strings

- Project export: `buildbook-web-project-export`
- Full backup: `buildbook-web-backup`

## Version Policy

- BuildBook_Web currently accepts full backup versions `2` and `3`.
- Unknown future backup versions must fail with a clear user-facing error, for example: `Backup format version 5 is newer than this app supports.`
- Missing required fields must fail with a field path, for example: `Project export is missing files[0].archive_path.`
- Nullable fields may be present with `null` when the database allows null.
- Existing field names must remain stable. Additive fields are allowed when consumers ignore unknown fields.

## Project Export Zip

A project export is a zip package containing:

```text
project-summary.html
notes.txt
project-manifest.json
project-data.json
project-image/*
note-images/*
latest-files/*
part-images/*
part-documents/*
part-info/*
```

`project-manifest.json` and `project-data.json` contain the same compatibility payload. `project-manifest.json` is the authoritative import file.

### Project Export Required Fields

Top-level fields:

- `type`
- `version`
- `exported_at`
- `project`
- `note_images`
- `steps`
- `checklist`
- `files`
- `parts`

`project` fields:

- `name`
- `status`
- `notes`
- `image_path`
- `image_archive_path`

`note_images[]` fields:

- `image_path`
- `archive_path`

`steps[]` fields:

- `name`
- `order_index`

`checklist[]` fields:

- `text`
- `is_completed`
- `completed_at`
- `order_index`

`files[]` fields:

- `id`
- `original_filename`
- `file_type`
- `tracker_key`
- `file_category`
- `version_note`
- `is_latest`
- `uploaded_at`
- `archive_path`

`parts[]` fields:

- `name`
- `quantity`
- `category_path`
- `category_label`
- `product_url`
- `storage_location`
- `storage_container_id`
- `storage_slot_id`
- `notes`
- `spec_summary`
- `image_archive_path`
- `documents`

`parts[].documents[]` fields:

- `id`
- `file_type`
- `file_path`
- `text_content`
- `original_filename`
- `is_primary`
- `uploaded_at`
- `archive_path`

## Full Backup Zip

A full backup is a portable zip package containing:

```text
backup.json
uploads/documents/*
uploads/projects/*
uploads/images/*
uploads/imports/*
```

`backup.json` contains table-shaped arrays for all database data needed to rebuild the app. The upload folders contain the actual file bytes referenced by file path fields.

### Full Backup Required Fields

Top-level fields:

- `type`
- `version`
- `app_version`
- `exported_at`
- `includes_uploads`
- `app_metadata`
- `category`
- `part`
- `part_document`
- `project`
- `project_part`
- `project_file`
- `project_checklist_item`
- `step_definition`
- `project_step`
- `import_batch`
- `import_item`

## Upload Folder Mapping

- `uploads/documents/*` maps to `part_document.file_path`
- `uploads/projects/*` maps to `project_file.file_path`
- `uploads/images/*` maps to `project.image_path`, `part.image_path`, `category.image_path`, and image references inside project notes
- `uploads/imports/*` maps to import-related files when used by an import workflow
- `app_metadata` key `storage_locations` stores structured storage containers and slots used by parts

## Project Export vs Full Backup

Project export is for sharing one project package. It contains one project, notes, step tags, checklist items, linked parts, part quantities, latest project files, part images, and part documents relevant to that project.

Full backup is for moving or restoring the whole app. It contains all supported database tables and all uploaded file folders needed to restore BuildBook_Web on a wiped install or another computer.

## Desktop-Dependent Fields

The desktop app depends on these fields remaining present and semantically stable:

- `archive_path`
- `image_archive_path`
- `category_path`
- `category_label`
- `tracker_key`
- `file_category`
- `quantity`
- `original_filename`
- `file_path`
- `image_path`
- `storage_location`
- `storage_container_id`
- `storage_slot_id`

## Manual Compatibility Checklist

Before releasing changes to these formats, manually verify:

- Export a project from BuildBook_Web and import into desktop BuildBook.
- Export a web project from desktop BuildBook and import into BuildBook_Web.
- Export a full backup from BuildBook_Web and restore into desktop BuildBook.
- Export a web full backup from desktop BuildBook and restore into BuildBook_Web.
- Confirm files, images, PDFs, categories, child categories, linked parts, and quantities survive both directions.
