-- BuildBook_Web v2 schema
-- This file is run on every container start. The reset block only runs when the
-- v2 marker is missing, so data is preserved after the first v2 boot.

CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM app_metadata
        WHERE key = 'schema_version' AND value = '2'
    ) THEN
        DROP TABLE IF EXISTS adjustment_log CASCADE;
        DROP TABLE IF EXISTS project_step CASCADE;
        DROP TABLE IF EXISTS step_definition CASCADE;
        DROP TABLE IF EXISTS project_checklist_item CASCADE;
        DROP TABLE IF EXISTS project_next_step CASCADE;
        DROP TABLE IF EXISTS project_file CASCADE;
        DROP TABLE IF EXISTS project_part CASCADE;
        DROP TABLE IF EXISTS project CASCADE;
        DROP TABLE IF EXISTS order_item CASCADE;
        DROP TABLE IF EXISTS "order" CASCADE;
        DROP TABLE IF EXISTS variant_document CASCADE;
        DROP TABLE IF EXISTS part_variant CASCADE;
        DROP TABLE IF EXISTS part_group CASCADE;
        DROP TABLE IF EXISTS import_item CASCADE;
        DROP TABLE IF EXISTS import_batch CASCADE;
        DROP TABLE IF EXISTS part_document CASCADE;
        DROP TABLE IF EXISTS part CASCADE;
        DROP TABLE IF EXISTS category CASCADE;

        INSERT INTO app_metadata (key, value)
        VALUES ('schema_version', '2')
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW();
    END IF;
END $$;

DROP TABLE IF EXISTS project_next_step CASCADE;

CREATE TABLE IF NOT EXISTS category (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    parent_id INTEGER REFERENCES category(id) ON DELETE SET NULL,
    image_path TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE category
ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS part (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES category(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    product_url TEXT,
    storage_location TEXT,
    notes TEXT,
    spec_summary TEXT,
    image_path TEXT,
    portable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE part
ADD COLUMN IF NOT EXISTS portable_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS part_document (
    id SERIAL PRIMARY KEY,
    part_id INTEGER NOT NULL REFERENCES part(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL DEFAULT 'file',
    file_path TEXT,
    text_content TEXT,
    original_filename TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    portable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE part_document
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE part_document
ADD COLUMN IF NOT EXISTS portable_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS project (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'waiting', 'completed', 'archived')),
    notes TEXT,
    image_path TEXT,
    portable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project
ADD COLUMN IF NOT EXISTS portable_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS project_part (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    part_id INTEGER NOT NULL REFERENCES part(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, part_id)
);

ALTER TABLE project_part
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS project_file (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'file',
    tracker_key TEXT,
    file_category TEXT NOT NULL DEFAULT 'other',
    version_note TEXT,
    is_latest BOOLEAN NOT NULL DEFAULT FALSE,
    portable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_file
ADD COLUMN IF NOT EXISTS tracker_key TEXT;

ALTER TABLE project_file
ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'file';

ALTER TABLE project_file
ADD COLUMN IF NOT EXISTS version_note TEXT;

ALTER TABLE project_file
ADD COLUMN IF NOT EXISTS portable_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS project_checklist_item (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE project_checklist_item
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS step_definition (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_step (
    project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    step_definition_id INTEGER NOT NULL REFERENCES step_definition(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, step_definition_id)
);

CREATE TABLE IF NOT EXISTS import_batch (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'csv',
    original_filename TEXT,
    portable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE import_batch
ADD COLUMN IF NOT EXISTS portable_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS import_item (
    id SERIAL PRIMARY KEY,
    import_batch_id INTEGER NOT NULL REFERENCES import_batch(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'imported', 'promoted', 'merged', 'skipped')),
    raw_name TEXT NOT NULL,
    product_url TEXT,
    product_image_url TEXT,
    attributes TEXT,
    store TEXT,
    ordered_at DATE,
    suggested_part_id INTEGER REFERENCES part(id) ON DELETE SET NULL,
    resolved_part_id INTEGER REFERENCES part(id) ON DELETE SET NULL,
    portable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE import_item
ADD COLUMN IF NOT EXISTS portable_data JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_category_parent ON category(parent_id);
CREATE INDEX IF NOT EXISTS idx_part_category ON part(category_id);
CREATE INDEX IF NOT EXISTS idx_part_search ON part USING gin(to_tsvector('english', coalesce(name,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(spec_summary,'')));
CREATE INDEX IF NOT EXISTS idx_project_status ON project(status);
CREATE INDEX IF NOT EXISTS idx_import_item_batch ON import_item(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_item_status ON import_item(status);

INSERT INTO category (id, name, parent_id, order_index)
SELECT id, name, parent_id, order_index
FROM (VALUES
    (1, 'Custom PCB''s', NULL, 1),
    (2, 'Microcontrollers & Development Boards', NULL, 2),
    (3, 'ESP32', 2, 3),
    (4, 'Arduino', 2, 4),
    (5, 'Modules', NULL, 5),
    (6, 'Displays', 5, 6),
    (7, 'Sensors', 5, 7),
    (8, 'Circuit Board Parts', NULL, 8),
    (9, 'IC''s', 8, 9),
    (10, 'LEDs', 8, 10),
    (11, 'Diodes', 10, 11),
    (12, 'LED Strings', 10, 12),
    (13, 'Resistors', 8, 13),
    (14, 'Capacitors', 8, 14),
    (15, 'Inductors', 8, 15),
    (16, 'Diodes', 8, 16),
    (17, 'Switches & Relays', 8, 17),
    (18, 'Power', NULL, 18),
    (19, 'Power Supplies', 18, 19),
    (20, 'Power Modules', 18, 20),
    (21, 'LED Current Supplies', 18, 21),
    (22, 'Battery', 18, 22),
    (23, 'Mechanical & Hardware', NULL, 23),
    (24, 'Nuts, Bolts & Screws', 23, 24),
    (25, 'Nuts', 24, 25),
    (26, 'Bolts', 24, 26),
    (27, 'Screws', 24, 27),
    (28, 'Motors & Motion', NULL, 28),
    (29, 'Magnets', NULL, 29),
    (30, 'Cooling', NULL, 30),
    (31, 'Sound', NULL, 31),
    (32, 'Optics & Physics', NULL, 32),
    (33, 'Connectors & Wiring', NULL, 33),
    (34, 'Prototyping & Tools', NULL, 34),
    (35, 'Miscellaneous', NULL, 35),
    (36, 'Tape', 35, 36)
) AS defaults(id, name, parent_id, order_index)
WHERE NOT EXISTS (
    SELECT 1 FROM category
);

SELECT setval(
    pg_get_serial_sequence('category', 'id'),
    GREATEST(COALESCE((SELECT MAX(id) FROM category), 0), 1),
    true
);

INSERT INTO step_definition (name, order_index)
SELECT name, order_index
FROM (VALUES
    ('Design', 10),
    ('Schematic', 20),
    ('PCB Layout', 30),
    ('Parts', 40),
    ('Assembly', 50),
    ('Programming', 60),
    ('Testing', 70),
    ('Debugging', 80),
    ('Enclosure', 90),
    ('Documentation', 100),
    ('Done', 110)
) AS defaults(name, order_index)
WHERE NOT EXISTS (
    SELECT 1 FROM step_definition
);
