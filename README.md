# BuildBook_Web

[![Docker Hub](https://img.shields.io/docker/pulls/illerin/buildbook_web?logo=docker&logoColor=white)](https://hub.docker.com/r/illerin/buildbook_web)
[![GitHub](https://img.shields.io/badge/source-GitHub-181717?logo=github)](https://github.com/illerin/buildbook_web)


A self-hosted web app for documenting electronics projects and keeping a searchable reference library of parts, datasheets, product links, files, and notes.

## Features

- Project tracking with notes, checklists, tags, photos, and step-by-step instructions
- Parts library with categories, documents, product links, storage locations, and project quantities
- Project file tracking with latest-file organization and browser previews
- CSV order import review flow for adding and matching parts
- Project import/export and portable full backup/restore
- Color themes and reusable project template settings
- Compatible interchange with the Windows desktop BuildBook app

For the Windows desktop version, see [BuildBook](https://github.com/illerin/BuildBook).

## Screenshots

### Project Overview

![Project overview](sample%20images/Project%20overview.PNG)

### Parts Library

![Parts library](sample%20images/Parts%20Library.PNG)

### Project Files

![Project files](sample%20images/Project%20Files.PNG)

## Quick Start

Create a folder for BuildBook_Web and save this as `docker-compose.yml`:

```yaml
services:
  buildbook_web:
    image: illerin/buildbook_web:latest
    ports:
      - "8079:8080"
    volumes:
      - buildbook-web-uploads:/app/uploads
      - buildbook-web-pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  buildbook-web-uploads:
  buildbook-web-pgdata:
```

Start the app:

```bash
docker compose up -d
```

Then open:

```text
http://localhost:8079
```

Docker will download `illerin/buildbook_web:latest` from Docker Hub the first time it starts. The app runs as a single container with the web UI, backend, nginx, and PostgreSQL inside it.

To stop the app:

```bash
docker compose down
```

To update to the latest published image:

```bash
docker compose pull
docker compose up -d
```

The two named Docker volumes preserve your database and uploaded files between restarts and updates. Do not delete them unless you intentionally want to remove your BuildBook_Web data.

## Local Development

The default `docker-compose.yml` is set up for people who want to run the published Docker Hub image. If you are working on the app from this repository and want Docker to rebuild from your local files, use the local override file:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

That keeps the same port and Docker volumes, but replaces the Docker Hub image with a local build tagged as `buildbook_web-local:latest`.

To go back to the published image:

```bash
docker compose down
docker compose pull
docker compose up -d
```

## What It Does

### Projects

- Rich project notes for wiring, pin choices, firmware notes, build decisions, and debugging history
- Fast step tags such as Design, Schematic, PCB Layout, Assembly, Programming, Testing, and Debugging
- Linked reference parts with quick access to specs, documents, product URLs, images, and storage location
- Project-specific build quantities for linked parts, useful for rebuild planning
- Checklist items for broader task tracking
- Project files with flexible categories such as PCB, firmware, drawing, enclosure, notes, or any custom category
- Latest-file marker for important/current files
- Project export/import packages for sharing notes, latest files, linked parts, documents, and metadata
- Project image and simple statuses: active, waiting, paused, completed, archived

### Parts Library

- Category and subcategory browsing
- Global part search
- Part image, product URL, storage location, notes, and manual spec summary
- Datasheet/document attachments
- Optional project linking while creating or editing a part
- Project back-references showing where a part is used

### Imports

- Import CSV order exports into a draft review batch
- Promote draft items into new parts
- Merge draft items into existing parts
- Skip items that should not enter the library
- Suggested matches by product URL and title search
- Imported quantities can inform review, but parts remain reference records

### Settings

- Configure project step tags, starter checklist items, and tracked file types
- Download a portable backup zip with database records and uploaded files
- Restore from a BuildBook_Web backup zip on the same install, a wiped Docker install, or another computer
- Older JSON-only backups can still be restored, but they do not contain uploaded files

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

The schema is centered on:

- `category`
- `part`
- `part_document`
- `project`
- `project_part`
- `project_file`
- `project_checklist_item`
- `import_batch`
- `import_item`

## Persistence

Docker Compose mounts:

- `buildbook-web-uploads` for uploaded images, project files, and part documents
- `buildbook-web-pgdata` for PostgreSQL data

Keep both volumes if you want to preserve the app state.

The in-app backup feature is the portable option. It downloads a zip containing the database backup plus uploaded images, documents, project files, and import files.

The import/export compatibility contract with BuildBook desktop is documented in [docs/import-export-format.md](docs/import-export-format.md).
