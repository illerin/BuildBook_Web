-- Electronics Inventory & Project Tracking Schema

CREATE TABLE IF NOT EXISTS part_group (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS part_variant (
    id SERIAL PRIMARY KEY,
    part_group_id INTEGER NOT NULL REFERENCES part_group(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    quantity_available INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER NOT NULL DEFAULT 0,
    quantity_on_order INTEGER NOT NULL DEFAULT 0,
    storage_location TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS variant_document (
    id SERIAL PRIMARY KEY,
    part_variant_id INTEGER NOT NULL REFERENCES part_variant(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'image', 'text')),
    file_path TEXT,
    text_content TEXT,
    original_filename TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "order" (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'received'))
);

CREATE TABLE IF NOT EXISTS order_item (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
    part_variant_id INTEGER REFERENCES part_variant(id),
    raw_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS project (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'waiting_on_part', 'paused', 'completed', 'cancelled')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS project_part (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    part_variant_id INTEGER NOT NULL REFERENCES part_variant(id),
    quantity INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS project_file (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_checklist_item (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS step_definition (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS project_step (
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    step_definition_id INTEGER NOT NULL REFERENCES step_definition(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (project_id, step_definition_id)
);

CREATE TABLE IF NOT EXISTS adjustment_log (
    id SERIAL PRIMARY KEY,
    part_variant_id INTEGER NOT NULL REFERENCES part_variant(id),
    change_amount INTEGER NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT
);

-- Seed some common step definitions
INSERT INTO step_definition (name) VALUES
    ('Design'),
    ('Schematic'),
    ('PCB Layout'),
    ('Fabrication'),
    ('Assembly'),
    ('Programming'),
    ('Testing'),
    ('Debugging'),
    ('Documentation'),
    ('Enclosure'),
    ('Completed')
ON CONFLICT DO NOTHING;

-- Add image support to part_group
ALTER TABLE part_group ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Restructure: add parent_id to part_group for nested categories
ALTER TABLE part_group ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES part_group(id);
-- Variants get their own image
ALTER TABLE part_variant ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Add product URL to part_variant
ALTER TABLE part_variant ADD COLUMN IF NOT EXISTS product_url TEXT;

-- Spec sheet text scraped from product page
ALTER TABLE part_variant ADD COLUMN IF NOT EXISTS spec_sheet TEXT;

-- Project enhancements
ALTER TABLE project ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE project_file ADD COLUMN IF NOT EXISTS file_category TEXT NOT NULL DEFAULT 'other'
  CHECK (file_category IN ('drawing', 'program', 'pcb', 'other'));
ALTER TABLE project_file ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT FALSE;

-- Track when an order was imported into the system
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
