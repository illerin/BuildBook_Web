# ProjectTrack — Electronics Project Documentation Tracker

A self-hosted web app for documenting electronics projects and keeping a searchable reference library of parts, datasheets, product links, files, and notes.

This rebuild intentionally removes inventory quantity tracking. Parts are reference records, not stock records.

## Quick Start

```bash
docker compose up -d --build
```

Then open:

```text
http://localhost:8079
```

## What It Does

### Projects

- Rich project notes for wiring, pin choices, firmware notes, build decisions, and debugging history
- Fast step tags such as Design, Schematic, PCB Layout, Assembly, Programming, Testing, and Debugging
- Linked reference parts with quick access to specs, documents, product URLs, images, and storage location
- Checklist items for broader task tracking
- Project files with flexible categories such as PCB, firmware, drawing, enclosure, notes, or any custom category
- Latest-file marker for important/current files
- Project image and simple statuses: active, waiting, paused, completed, archived

### Parts Library

- Category and subcategory browsing
- Global part search
- Part image, product URL, storage location, notes, and manual spec summary
- Datasheet/document attachments
- Project back-references showing where a part is used

### Imports

- Import CSV order exports into a draft review batch
- Promote draft items into new parts
- Merge draft items into existing parts
- Skip items that should not enter the library
- Suggested matches by product URL and title search
- Quantity columns are ignored

### Settings

- Download a full JSON backup of database records
- Restore from a v2 backup
- Uploaded files are stored on disk in the Docker volume and are not embedded in the JSON backup

## Architecture

| Component | Tech |
| --- | --- |
| Frontend | React |
| Backend | Node.js / Express |
| Database | PostgreSQL |
| Proxy | nginx |
| Files | Local disk under `/app/uploads` |

Everything runs in a single Docker service.

## Data Model

The v2 schema is centered on:

- `category`
- `part`
- `part_document`
- `project`
- `project_part`
- `project_file`
- `project_checklist_item`
- `project_next_step`
- `import_batch`
- `import_item`

On first v2 startup, the schema migration drops the old v1 inventory/order tables and creates the documentation-first schema. After that, a schema marker preserves v2 data across restarts.

## Persistence

Docker Compose mounts:

- `parttrack-uploads` for uploaded images, project files, and part documents
- `parttrack-pgdata` for PostgreSQL data

Keep both volumes if you want to preserve the app state.
