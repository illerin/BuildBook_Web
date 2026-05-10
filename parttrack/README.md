# PartTrack — Electronics Inventory & Project Tracker

A self-hosted, single-container web app for tracking electronic components and projects.

## Quick Start

### Docker Compose (recommended)
```bash
docker compose up -d
```
Then open http://localhost:8080

### Docker only
```bash
docker build -t parttrack .
docker run -d \
  -p 8080:8080 \
  -v parttrack-uploads:/app/uploads \
  -v parttrack-pgdata:/var/lib/postgresql/data \
  --name parttrack \
  parttrack
```

---

## Architecture

| Component | Tech |
|-----------|------|
| Frontend  | React (served as static build) |
| Backend   | Node.js / Express |
| Database  | PostgreSQL (embedded in container) |
| Proxy     | nginx (port 8080) |
| Files     | Local disk (`/app/uploads`) |

Everything runs in a **single container** — no external dependencies.

---

## Features

### Inventory
- Part Groups (Resistor, Capacitor, IC, etc.) with categories
- Variants per group (0805 1%, 100nF 50V, etc.)
- Track `available`, `reserved`, `on_order` quantities
- Negative stock clearly flagged
- Manual edits logged with delta + note
- Attach files/datasheets (PDF, images, text notes)
- Storage location tracking
- Full-text search + filter by category/location/stock level

### Projects
- Status workflow: Active → Waiting on Part → Paused → Completed / Cancelled
- Reserve parts from inventory (decrements available, increments reserved)
- Status transitions handle inventory correctly:
  - Completed: releases reserved (does NOT restore available — parts are used)
  - Cancelled: releases reserved AND restores available
- Checklist items
- File attachments
- Step/tag system (Design, PCB Layout, Assembly, etc.) with primary step marking

### Orders
- Import AliExpress CSV export (or any CSV with Order ID, Title, Qty, Status columns)
- Preview parsed orders, then map each line item to existing variants or create new ones
- Confirms: increments `quantity_on_order` on mapped variants
- Mark orders as received: moves qty from `on_order` → `available`
- Re-map items at any time from order detail view

---

## Inventory Logic

```
Reserve:    available -= qty,  reserved += qty
Receive:    on_order  -= qty,  available += qty
Complete:   reserved  -= qty   (available unchanged — parts consumed)
Cancel:     reserved  -= qty,  available += qty
Manual set: available = new_value, logs delta in adjustment_log
```

---

## CSV Format

The app parses AliExpress order exports. Expected columns:
- `Order Date` — date of order
- `Order ID` — groups items into a single order
- `Title` — item description (used as `raw_name`)
- `Qty` — quantity
- `Status` — "Completed" → received, else ordered
- `Attributes`, `Store`, `Price` — displayed for reference during mapping

Other CSV formats work if they have similar column names.

---

## Data Persistence

Mount Docker volumes for persistence:
- `/app/uploads` — uploaded files (datasheets, project files)
- `/var/lib/postgresql/data` — PostgreSQL data

Without volumes, data is lost on container restart.

---

## API Reference

### Part Groups
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/part-groups | List all groups |
| POST | /api/part-groups | Create group |
| GET | /api/part-groups/:id | Get group |
| PUT | /api/part-groups/:id | Update group |
| DELETE | /api/part-groups/:id | Delete group |
| GET | /api/part-groups/:id/variants | List variants |
| POST | /api/part-groups/:id/variants | Create variant |

### Variants
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/variants | Search/filter all variants |
| GET | /api/variants/:id | Get variant |
| PUT | /api/variants/:id | Update (logs delta) |
| DELETE | /api/variants/:id | Delete |
| POST | /api/variants/:id/documents | Attach document |
| GET | /api/variants/:id/adjustments | Adjustment log |
| DELETE | /api/documents/:id | Delete document |

### Orders
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/orders | List orders |
| GET | /api/orders/:id | Order with items |
| POST | /api/orders/import-csv | Parse CSV → preview |
| POST | /api/orders/confirm-import | Save parsed orders |
| PUT | /api/order-items/:id/map | Map item to variant |
| POST | /api/orders/:id/receive | Mark received |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| GET | /api/projects/:id | Project with parts/files/checklist |
| PUT | /api/projects/:id | Update (handles status transitions) |
| DELETE | /api/projects/:id | Delete |
| POST | /api/projects/:id/parts | Reserve part |
| DELETE | /api/project-parts/:id | Remove reservation |
| POST | /api/projects/:id/files | Upload file |
| DELETE | /api/project-files/:id | Delete file |
| POST | /api/projects/:id/checklist | Add item |
| PUT | /api/checklist/:id | Update item |
| DELETE | /api/checklist/:id | Delete item |
| POST | /api/projects/:id/steps | Add/update step |
| DELETE | /api/projects/:id/steps/:stepId | Remove step |

### Misc
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/categories | All categories |
| GET | /api/step-definitions | All step types |
| POST | /api/step-definitions | Create step type |
| GET | /api/health | Health check |

---

## Development (without Docker)

```bash
# Start PostgreSQL separately, then:

# Backend
cd backend
npm install
DATABASE_URL=postgresql://... node server.js

# Frontend
cd frontend
npm install
REACT_APP_API_URL=http://localhost:3001/api npm start
```
