import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pg from 'pg';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://parttrack:parttrack@localhost:5432/parttrack'
});

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const DOC_DIR    = path.join(UPLOAD_DIR, 'documents');
const PROJECT_DIR= path.join(UPLOAD_DIR, 'projects');
const IMAGE_DIR  = path.join(UPLOAD_DIR, 'images');
[UPLOAD_DIR, DOC_DIR, PROJECT_DIR, IMAGE_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const makeStorage = (dir) => multer.diskStorage({
  destination: dir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const imageFilter = (req, file, cb) => cb(null, file.mimetype.startsWith('image/'));

const uploadDoc     = multer({ storage: makeStorage(DOC_DIR) });
const uploadProject = multer({ storage: makeStorage(PROJECT_DIR) });
const uploadImage   = multer({ storage: makeStorage(IMAGE_DIR), fileFilter: imageFilter });
const uploadCsv     = multer({ storage: multer.memoryStorage() });

app.use('/files/documents', express.static(DOC_DIR));
app.use('/files/projects',  express.static(PROJECT_DIR));
app.use('/files/images',    express.static(IMAGE_DIR));

// ─── CATEGORIES (part_group with parent_id) ──────────────────────────────────

// Return full tree with variant counts
app.get('/api/categories', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pg.*,
           COUNT(pv.id)::int AS variant_count
    FROM part_group pg
    LEFT JOIN part_variant pv ON pv.part_group_id = pg.id
    GROUP BY pg.id
    ORDER BY pg.parent_id NULLS FIRST, pg.name
  `);
  res.json(rows);
});

// Flat list of all categories (for selects)
app.get('/api/categories/flat', async (req, res) => {
  const { rows } = await pool.query(`SELECT id, name, parent_id FROM part_group ORDER BY name`);
  res.json(rows);
});

app.post('/api/categories', async (req, res) => {
  const { name, category, description, parent_id } = req.body;
  // 'category' field kept for backwards compat; if parent_id given, derive category from parent
  let resolvedCategory = category || 'General';
  if (parent_id) {
    const { rows } = await pool.query(`SELECT category FROM part_group WHERE id=$1`, [parent_id]);
    if (rows[0]) resolvedCategory = rows[0].category;
  }
  const { rows } = await pool.query(
    `INSERT INTO part_group (name, category, description, parent_id) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, resolvedCategory, description || null, parent_id || null]
  );
  res.json(rows[0]);
});

app.get('/api/categories/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM part_group WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.put('/api/categories/:id', async (req, res) => {
  const { name, category, description, parent_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE part_group SET name=$1, category=COALESCE($2,category), description=$3, parent_id=$4 WHERE id=$5 RETURNING *`,
    [name, category || null, description || null, parent_id || null, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/categories/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM part_group WHERE id=$1`, [req.params.id]);
  if (rows[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, rows[0].image_path), { force: true });
  await pool.query(`DELETE FROM part_group WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/categories/:id/image', uploadImage.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const { rows: cur } = await pool.query(`SELECT image_path FROM part_group WHERE id=$1`, [req.params.id]);
  if (cur[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, cur[0].image_path), { force: true });
  const { rows } = await pool.query(
    `UPDATE part_group SET image_path=$1 WHERE id=$2 RETURNING *`, [req.file.filename, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/categories/:id/image', async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM part_group WHERE id=$1`, [req.params.id]);
  if (rows[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, rows[0].image_path), { force: true });
  await pool.query(`UPDATE part_group SET image_path=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// Keep /api/part-groups aliases for backwards compat
app.get('/api/part-groups', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pg.*, COUNT(pv.id)::int AS variant_count
    FROM part_group pg LEFT JOIN part_variant pv ON pv.part_group_id = pg.id
    GROUP BY pg.id ORDER BY pg.parent_id NULLS FIRST, pg.name
  `);
  res.json(rows);
});
app.get('/api/part-groups/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM part_group WHERE id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});
app.put('/api/part-groups/:id', async (req, res) => {
  const { name, category, description, parent_id } = req.body;
  const { rows } = await pool.query(
    `UPDATE part_group SET name=$1, category=COALESCE($2,category), description=$3, parent_id=$4 WHERE id=$5 RETURNING *`,
    [name, category||null, description||null, parent_id||null, req.params.id]
  );
  res.json(rows[0]);
});
app.delete('/api/part-groups/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM part_group WHERE id=$1`, [req.params.id]);
  if (rows[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, rows[0].image_path), { force: true });
  await pool.query(`DELETE FROM part_group WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── VARIANTS ────────────────────────────────────────────────────────────────

app.get('/api/variants', async (req, res) => {
  const { search, category, location, availability } = req.query;
  let where = ['1=1'];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(pg.name ILIKE $${params.length} OR pv.label ILIKE $${params.length} OR parent.name ILIKE $${params.length})`);
  }
  if (category) { params.push(category); where.push(`(pg.id=$${params.length} OR pg.parent_id=$${params.length})`); }
  if (location) { params.push(`%${location}%`); where.push(`pv.storage_location ILIKE $${params.length}`); }
  if (availability === 'negative') where.push('pv.quantity_available < 0');
  else if (availability === 'low') where.push('pv.quantity_available >= 0 AND pv.quantity_available <= 5');
  else if (availability === 'in_stock') where.push('pv.quantity_available > 5');

  const { rows } = await pool.query(
    `SELECT pv.*, pv.image_path AS variant_image_path,
            pg.name AS group_name, pg.category, pg.image_path AS group_image_path,
            pg.parent_id,
            parent.name AS parent_name, parent.image_path AS parent_image_path
     FROM part_variant pv
     JOIN part_group pg ON pg.id = pv.part_group_id
     LEFT JOIN part_group parent ON parent.id = pg.parent_id
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(parent.name, pg.name), pg.name, pv.label`,
    params
  );
  res.json(rows);
});

app.get('/api/part-groups/:groupId/variants', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pv.*, array_agg(row_to_json(vd.*)) FILTER (WHERE vd.id IS NOT NULL) AS documents
     FROM part_variant pv
     LEFT JOIN variant_document vd ON vd.part_variant_id = pv.id
     WHERE pv.part_group_id=$1
     GROUP BY pv.id ORDER BY pv.label`,
    [req.params.groupId]
  );
  res.json(rows);
});

app.post('/api/part-groups/:groupId/variants', async (req, res) => {
  const { label, quantity_available, storage_location, notes, product_url } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO part_variant (part_group_id, label, quantity_available, storage_location, notes, product_url)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.groupId, label, quantity_available || 0, storage_location || null, notes || null, product_url || null]
  );
  res.json(rows[0]);
});

app.get('/api/variants/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pv.*, pg.name AS group_name, pg.category, pg.parent_id,
            parent.name AS parent_name
     FROM part_variant pv
     JOIN part_group pg ON pg.id = pv.part_group_id
     LEFT JOIN part_group parent ON parent.id = pg.parent_id
     WHERE pv.id=$1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.put('/api/variants/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { label, quantity_available, storage_location, notes, product_url, spec_sheet } = req.body;
    const { rows: cur } = await client.query(
      `SELECT quantity_available FROM part_variant WHERE id=$1 FOR UPDATE`, [req.params.id]
    );
    if (!cur[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const delta = quantity_available - cur[0].quantity_available;
    const { rows } = await client.query(
      `UPDATE part_variant SET label=$1, quantity_available=$2, storage_location=$3, notes=$4, product_url=$5, spec_sheet=$6 WHERE id=$7 RETURNING *`,
      [label, quantity_available, storage_location || null, notes || null, product_url || null, spec_sheet ?? null, req.params.id]
    );
    if (delta !== 0) {
      await client.query(
        `INSERT INTO adjustment_log (part_variant_id, change_amount, note) VALUES ($1,$2,$3)`,
        [req.params.id, delta, req.body.note || 'Manual edit']
      );
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.delete('/api/variants/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT image_path FROM part_variant WHERE id=$1`, [req.params.id]);

    // Restore inventory for any active project reservations before removing
    const { rows: reservations } = await client.query(
      `SELECT * FROM project_part WHERE part_variant_id=$1`, [req.params.id]
    );
    for (const r of reservations) {
      await client.query(
        `UPDATE part_variant SET quantity_available = quantity_available + $1, quantity_reserved = quantity_reserved - $1 WHERE id=$2`,
        [r.quantity, req.params.id]
      );
    }
    // Remove project reservations
    await client.query(`DELETE FROM project_part WHERE part_variant_id=$1`, [req.params.id]);
    // Null out order_item references (keep order history, just unlink the variant)
    await client.query(`UPDATE order_item SET part_variant_id=NULL WHERE part_variant_id=$1`, [req.params.id]);
    // Remove documents
    await client.query(`DELETE FROM variant_document WHERE part_variant_id=$1`, [req.params.id]);
    // Remove adjustment log
    await client.query(`DELETE FROM adjustment_log WHERE part_variant_id=$1`, [req.params.id]);
    // Now safe to delete
    await client.query(`DELETE FROM part_variant WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');

    // Clean up image file after commit
    if (rows[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, rows[0].image_path), { force: true });

    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Variant image
app.post('/api/variants/:id/image', uploadImage.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const { rows: cur } = await pool.query(`SELECT image_path FROM part_variant WHERE id=$1`, [req.params.id]);
  if (cur[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, cur[0].image_path), { force: true });
  const { rows } = await pool.query(
    `UPDATE part_variant SET image_path=$1 WHERE id=$2 RETURNING *`, [req.file.filename, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/variants/:id/image', async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM part_variant WHERE id=$1`, [req.params.id]);
  if (rows[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, rows[0].image_path), { force: true });
  await pool.query(`UPDATE part_variant SET image_path=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── VARIANT DOCUMENTS ───────────────────────────────────────────────────────

app.post('/api/variants/:id/documents', uploadDoc.single('file'), async (req, res) => {
  const { file_type, text_content } = req.body;
  let file_path = null;
  let original_filename = req.body.original_filename || 'text-entry';
  if (req.file) { file_path = req.file.filename; original_filename = req.file.originalname; }
  function guessType(mime) {
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/')) return 'image';
    return 'text';
  }
  const { rows } = await pool.query(
    `INSERT INTO variant_document (part_variant_id, file_type, file_path, text_content, original_filename)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, file_type || (req.file ? guessType(req.file.mimetype) : 'text'), file_path, text_content || null, original_filename]
  );
  res.json(rows[0]);
});

app.delete('/api/documents/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM variant_document WHERE id=$1`, [req.params.id]);
  if (rows[0]?.file_path) fs.rmSync(path.join(DOC_DIR, rows[0].file_path), { force: true });
  await pool.query(`DELETE FROM variant_document WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ─── ORDERS ──────────────────────────────────────────────────────────────────

app.get('/api/orders', async (req, res) => {
  const sort = req.query.sort === 'imported' ? 'o.imported_at' : 'o.date';
  const { rows } = await pool.query(
    `SELECT o.*, COUNT(oi.id)::int AS item_count
     FROM "order" o LEFT JOIN order_item oi ON oi.order_id = o.id
     GROUP BY o.id ORDER BY ${sort} DESC`
  );
  res.json(rows);
});

app.get('/api/orders/:id', async (req, res) => {
  const [order, items] = await Promise.all([
    pool.query(`SELECT * FROM "order" WHERE id=$1`, [req.params.id]),
    pool.query(
      `SELECT oi.*, pv.label AS variant_label, pg.name AS group_name
       FROM order_item oi
       LEFT JOIN part_variant pv ON pv.id = oi.part_variant_id
       LEFT JOIN part_group pg ON pg.id = pv.part_group_id
       WHERE oi.order_id=$1 ORDER BY oi.id`,
      [req.params.id]
    )
  ]);
  if (!order.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...order.rows[0], items: items.rows });
});

app.post('/api/orders/import-csv', uploadCsv.single('file'), async (req, res) => {
  try {
    const text = req.file.buffer.toString('utf-8');
    const records = parse(text, { columns: true, skip_empty_lines: true, trim: true });

    // Group by ORDER DATE (not order ID) — all items on same day = one order
    const dateMap = new Map();
    for (const r of records) {
      const rawDate = r['Order Date'] || r['Date'] || new Date().toISOString().slice(0, 10);
      // Normalise date: take first 10 chars (handles "2024-03-15 00:00:00" etc.)
      const date = rawDate.slice(0, 10);
      const rowStatus = (r['Status'] || '').toLowerCase();
      const isCompleted = rowStatus === 'completed' || rowStatus === 'received';

      if (!dateMap.has(date)) {
        dateMap.set(date, { date, status: isCompleted ? 'received' : 'ordered', items: [] });
      }
      const order = dateMap.get(date);
      // If ANY item on this date is not completed, mark whole order as ordered
      if (!isCompleted) order.status = 'ordered';

      order.items.push({
        raw_name: r['Title'] || r['Name'] || r['Item'] || Object.values(r)[0],
        quantity: parseInt(r['Qty'] || r['Quantity'] || 1, 10) || 1,
        attributes: r['Attributes'] || r['Variation'] || '',
        store: r['Store Name'] || r['Store'] || '',
        product_url: r['Product Url'] || r['Product URL'] || r['URL'] || r['Link'] || '',
        product_image_url: r['Product Image Url'] || r['Product Image URL'] || r['Image Url'] || r['Image URL'] || '',
        sku_id: r['SKU ID'] || r['SKU'] || '',
        is_completed: isCompleted,
      });
    }
    res.json({ orders: Array.from(dateMap.values()) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Helper: extract specifications from AliExpress embedded JSON (window.runParams or __NEXT_DATA__)
function extractAliExpressSpecs(html) {
  // AliExpress embeds product data as JSON in a script tag
  // Try window.runParams = {...} pattern first
  const patterns = [
    /window\.runParams\s*=\s*(\{[\s\S]{100,500000}?\});\s*(?:window|var|let|const|<\/script>)/,
    /window\._dida_config_\s*=\s*(\{[\s\S]{100,200000}?\});\s*(?:<\/script>|window)/,
    /"__NEXT_DATA__"[^>]*>(\{[\s\S]{100,500000}?\})<\/script>/,
    /window\.pageData\s*=\s*(\{[\s\S]{100,200000}?\});\s*(?:window|<\/script>)/,
  ];

  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (!m) continue;
    try {
      const data = JSON.parse(m[1]);

      // Walk the object looking for specification/property arrays
      const specs = findSpecsInObject(data);
      if (specs) return specs;
    } catch (e) {
      // JSON parse failed, try next pattern
    }
  }

  // Fallback: look for the specification data inline as a simpler pattern
  // AliExpress often has: "specifications":[{"attrName":"Material","attrValue":"..."}]
  const specArrayMatch = html.match(/"(?:specifications?|properties|attrs?)":\s*(\[[\s\S]{10,20000}?\])/i);
  if (specArrayMatch) {
    try {
      const arr = JSON.parse(specArrayMatch[1]);
      return formatSpecArray(arr);
    } catch(e) {}
  }

  return null;
}

function findSpecsInObject(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;

  // Check for array of spec objects like [{attrName, attrValue}] or [{name, value}]
  if (Array.isArray(obj)) {
    const formatted = formatSpecArray(obj);
    if (formatted) return formatted;
    for (const item of obj.slice(0, 20)) {
      const r = findSpecsInObject(item, depth + 1);
      if (r) return r;
    }
    return null;
  }

  // Check for keys that suggest specifications
  const specKeys = ['specifications', 'specification', 'properties', 'props', 'attrs', 'attributes', 'specList', 'propList'];
  for (const key of specKeys) {
    if (obj[key] && (Array.isArray(obj[key]) || typeof obj[key] === 'object')) {
      const arr = Array.isArray(obj[key]) ? obj[key] : Object.values(obj[key]);
      const formatted = formatSpecArray(arr);
      if (formatted) return formatted;
    }
  }

  // Recurse into promising child keys
  const searchKeys = ['data', 'product', 'item', 'detail', 'pageComponent', 'props', 'skuModule', 'specsModule', 'descriptionModule'];
  for (const key of searchKeys) {
    if (obj[key] && typeof obj[key] === 'object') {
      const r = findSpecsInObject(obj[key], depth + 1);
      if (r) return r;
    }
  }

  return null;
}

function formatSpecArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  // Each element should be an object with name+value or attrName+attrValue
  const lines = [];
  for (const item of arr) {
    if (typeof item !== 'object' || !item) continue;
    const name = item.attrName || item.name || item.label || item.key || item.prop_name || '';
    const value = item.attrValue || item.value || item.val || item.prop_value || '';
    if (name && value && typeof name === 'string' && typeof value === 'string') {
      // Skip items that look like HTML or are too long
      if (name.length < 80 && value.length < 200 && !name.includes('<') && !value.includes('<')) {
        lines.push(`${name}: ${value}`);
      }
    }
  }

  if (lines.length < 2) return null;
  return lines.join('\n');
}

// Generic spec scraper for non-AliExpress sites
function extractGenericSpecs(html) {
  // Strip scripts and styles
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Look for a spec table or dl list after a "Specifications" heading
  // Stop at "Features", "Description", "Reviews", etc.
  const stopWords = /(?:feature|description|review|related|recommend|overview|highlight)/i;

  // Try: heading containing "spec" followed by table or list
  const headingPattern = /<(?:h[1-6]|div|span|p|th)[^>]*>[^<]*specification[^<]*<\/[^>]+>([\s\S]{0,5000}?)(?=<(?:h[1-6])[^>]*>[^<]*(?:feature|description|review)|<footer|id="[^"]*(?:review|related))/i;
  const m = clean.match(headingPattern);
  if (m && m[1]) {
    // Check it doesn't immediately contain feature keywords
    const section = m[1];
    const featureStart = section.search(stopWords);
    const content = featureStart > 100 ? section.slice(0, featureStart) : section;

    const text = htmlToText(content);
    if (text.length > 30) return text.slice(0, 3000);
  }

  // Try: table with two columns (label: value) near the word "specification"
  const tablePattern = /specification[\s\S]{0,500}?(<table[\s\S]{50,5000}?<\/table>)/i;
  const tm = clean.match(tablePattern);
  if (tm && tm[1]) {
    const text = htmlToText(tm[1]);
    if (text.length > 30) return text.slice(0, 3000);
  }

  return null;
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:tr|li|p|div|dt)>/gi, '\n')
    .replace(/<\/td>/gi, ': ')
    .replace(/<\/dd>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Main scrape function
async function scrapeSpecSheet(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
      }
    });
    clearTimeout(timeout);
    if (!r.ok) {
      console.warn('Scrape HTTP error:', r.status, url);
      return null;
    }
    const html = await r.text();
    if (html.length < 100) return null;

    // Try AliExpress JSON extraction first (works for aliexpress.com and aliexpress.us)
    const isAliExpress = url.includes('aliexpress');
    if (isAliExpress) {
      const specs = extractAliExpressSpecs(html);
      if (specs) return specs;
      console.warn('AliExpress JSON extraction found nothing, falling back to generic');
    }

    // Generic HTML extraction
    return extractGenericSpecs(html);
  } catch (e) {
    console.warn('Spec scrape failed:', e.message, url);
    return null;
  }
}

// Scrape endpoint — called from frontend on demand
app.post('/api/variants/:id/scrape-spec', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const spec = await scrapeSpecSheet(url);
    if (spec) {
      await pool.query(`UPDATE part_variant SET spec_sheet=$1 WHERE id=$2`, [spec, req.params.id]);
      res.json({ ok: true, spec });
    } else {
      res.json({ ok: false, spec: null, message: 'Could not extract specifications from that page. The site may require JavaScript to load, or the specs may be structured differently. You can paste them manually below.' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// On-demand scrape without saving (used during import preview)
app.post('/api/scrape-spec', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const spec = await scrapeSpecSheet(url);
    res.json({ spec: spec || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper: download an image from a URL and save to IMAGE_DIR, return filename or null
async function downloadProductImage(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PartTrack/1.0)' }
    });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg';
    const filename = `import-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(IMAGE_DIR, filename), buf);
    return filename;
  } catch (e) {
    console.warn('Image download failed:', url, e.message);
    return null;
  }
}

app.post('/api/orders/confirm-import', async (req, res) => {
  const { orders } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];

    for (const ord of orders) {
      const { rows: [order] } = await client.query(
        `INSERT INTO "order" (date, status, imported_at) VALUES ($1,$2,NOW()) RETURNING *`, [ord.date, ord.status]
      );

      for (const item of ord.items) {
        await client.query(
          `INSERT INTO order_item (order_id, part_variant_id, raw_name, quantity) VALUES ($1,$2,$3,$4)`,
          [order.id, item.part_variant_id || null, item.raw_name, item.quantity]
        );

        if (item.part_variant_id) {
          // Determine if this is a completed/received item
          const isReceived = ord.status === 'received' || item.is_completed;

          if (isReceived) {
            // Completed import: go straight to available
            await client.query(
              `UPDATE part_variant SET quantity_available = quantity_available + $1 WHERE id=$2`,
              [item.quantity, item.part_variant_id]
            );
          } else {
            // Not yet received: add to on_order
            await client.query(
              `UPDATE part_variant SET quantity_on_order = quantity_on_order + $1 WHERE id=$2`,
              [item.quantity, item.part_variant_id]
            );
          }

          // Store product_url on variant (only if variant doesn't already have one)
          if (item.product_url) {
            await client.query(
              `UPDATE part_variant SET product_url = $1 WHERE id=$2 AND (product_url IS NULL OR product_url = '')`,
              [item.product_url, item.part_variant_id]
            );
          }

          // Download and store product image — only if variant has no image yet
          if (item.product_image_url) {
            const { rows: [vrow] } = await client.query(
              `SELECT image_path FROM part_variant WHERE id=$1`, [item.part_variant_id]
            );
            if (!vrow?.image_path) {
              // Release transaction lock while downloading (re-acquire after)
              await client.query('COMMIT');
              const imgFile = await downloadProductImage(item.product_image_url);
              await client.query('BEGIN');
              if (imgFile) {
                // Re-check in case of race
                const { rows: [cur] } = await client.query(
                  `SELECT image_path FROM part_variant WHERE id=$1 FOR UPDATE`, [item.part_variant_id]
                );
                if (!cur?.image_path) {
                  await client.query(
                    `UPDATE part_variant SET image_path=$1 WHERE id=$2`,
                    [imgFile, item.part_variant_id]
                  );
                } else {
                  fs.rmSync(path.join(IMAGE_DIR, imgFile), { force: true });
                }
              }
            }
          }

          // Scrape spec sheet from product URL — only if variant has no spec yet
          if (item.product_url) {
            const { rows: [specRow] } = await client.query(
              `SELECT spec_sheet FROM part_variant WHERE id=$1`, [item.part_variant_id]
            );
            if (!specRow?.spec_sheet) {
              await client.query('COMMIT');
              const spec = await scrapeSpecSheet(item.product_url);
              await client.query('BEGIN');
              if (spec) {
                await client.query(
                  `UPDATE part_variant SET spec_sheet=$1 WHERE id=$2 AND (spec_sheet IS NULL OR spec_sheet = '')`,
                  [spec, item.part_variant_id]
                );
              }
            }
          }
        }
      }
      created.push(order);
    }
    await client.query('COMMIT');
    res.json({ created });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.put('/api/order-items/:id/map', async (req, res) => {
  const { part_variant_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [item] } = await client.query(`SELECT * FROM order_item WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (item.part_variant_id) {
      await client.query(`UPDATE part_variant SET quantity_on_order = quantity_on_order - $1 WHERE id=$2`, [item.quantity, item.part_variant_id]);
    }
    if (part_variant_id) {
      await client.query(`UPDATE part_variant SET quantity_on_order = quantity_on_order + $1 WHERE id=$2`, [item.quantity, part_variant_id]);
    }
    const { rows } = await client.query(`UPDATE order_item SET part_variant_id=$1 WHERE id=$2 RETURNING *`, [part_variant_id || null, req.params.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.delete('/api/orders/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // If order was received, reverse the inventory changes
    const { rows: [order] } = await client.query(`SELECT * FROM "order" WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (order.status === 'received') {
      const { rows: items } = await client.query(
        `SELECT * FROM order_item WHERE order_id=$1 AND part_variant_id IS NOT NULL`, [req.params.id]
      );
      for (const item of items) {
        await client.query(
          `UPDATE part_variant SET quantity_available = quantity_available - $1 WHERE id=$2`,
          [item.quantity, item.part_variant_id]
        );
      }
    } else {
      // If still on order, remove from on_order count
      const { rows: items } = await client.query(
        `SELECT * FROM order_item WHERE order_id=$1 AND part_variant_id IS NOT NULL`, [req.params.id]
      );
      for (const item of items) {
        await client.query(
          `UPDATE part_variant SET quantity_on_order = GREATEST(0, quantity_on_order - $1) WHERE id=$2`,
          [item.quantity, item.part_variant_id]
        );
      }
    }
    await client.query(`DELETE FROM order_item WHERE order_id=$1`, [req.params.id]);
    await client.query(`DELETE FROM "order" WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/orders/:id/receive', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query(`SELECT * FROM "order" WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (order.status === 'received') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already received' }); }
    const { rows: items } = await client.query(`SELECT * FROM order_item WHERE order_id=$1 AND part_variant_id IS NOT NULL`, [order.id]);
    for (const item of items) {
      await client.query(
        `UPDATE part_variant SET quantity_on_order = quantity_on_order - $1, quantity_available = quantity_available + $1 WHERE id=$2`,
        [item.quantity, item.part_variant_id]
      );
    }
    await client.query(`UPDATE "order" SET status='received' WHERE id=$1`, [order.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ─── PROJECTS ────────────────────────────────────────────────────────────────

app.get('/api/projects', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*,
       COUNT(DISTINCT pp.id)::int AS part_count,
       COUNT(DISTINCT pci.id) FILTER (WHERE pci.is_completed)::int AS checklist_done,
       COUNT(DISTINCT pci.id)::int AS checklist_total
     FROM project p
     LEFT JOIN project_part pp ON pp.project_id = p.id
     LEFT JOIN project_checklist_item pci ON pci.project_id = p.id
     GROUP BY p.id ORDER BY p.id DESC`
  );
  res.json(rows);
});

app.post('/api/projects', async (req, res) => {
  const { name, status, description } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO project (name, status, description) VALUES ($1,$2,$3) RETURNING *`,
    [name, status || 'active', description || null]
  );
  res.json(rows[0]);
});

app.get('/api/projects/:id', async (req, res) => {
  const [proj, parts, files, checklist, steps] = await Promise.all([
    pool.query(`SELECT * FROM project WHERE id=$1`, [req.params.id]),
    pool.query(
      `SELECT pp.*, pv.label, pv.quantity_available, pv.storage_location,
              pv.image_path AS variant_image_path,
              pg.name AS group_name, pg.category, pg.image_path AS group_image_path,
              pg.parent_id, parent.name AS parent_name
       FROM project_part pp
       JOIN part_variant pv ON pv.id = pp.part_variant_id
       JOIN part_group pg ON pg.id = pv.part_group_id
       LEFT JOIN part_group parent ON parent.id = pg.parent_id
       WHERE pp.project_id=$1`,
      [req.params.id]
    ),
    pool.query(`SELECT * FROM project_file WHERE project_id=$1 ORDER BY uploaded_at`, [req.params.id]),
    pool.query(`SELECT * FROM project_checklist_item WHERE project_id=$1 ORDER BY order_index, id`, [req.params.id]),
    pool.query(
      `SELECT ps.*, sd.name FROM project_step ps
       JOIN step_definition sd ON sd.id = ps.step_definition_id WHERE ps.project_id=$1`,
      [req.params.id]
    )
  ]);
  if (!proj.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...proj.rows[0], parts: parts.rows, files: files.rows, checklist: checklist.rows, steps: steps.rows });
});

app.put('/api/projects/:id', async (req, res) => {
  const { name, status, description } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [old] } = await client.query(`SELECT status FROM project WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!old) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (old.status !== status) {
      if (status === 'completed') {
        const { rows: parts } = await client.query(`SELECT * FROM project_part WHERE project_id=$1`, [req.params.id]);
        for (const p of parts) {
          await client.query(`UPDATE part_variant SET quantity_reserved = quantity_reserved - $1 WHERE id=$2`, [p.quantity, p.part_variant_id]);
        }
      } else if (status === 'cancelled') {
        const { rows: parts } = await client.query(`SELECT * FROM project_part WHERE project_id=$1`, [req.params.id]);
        for (const p of parts) {
          await client.query(
            `UPDATE part_variant SET quantity_reserved = quantity_reserved - $1, quantity_available = quantity_available + $1 WHERE id=$2`,
            [p.quantity, p.part_variant_id]
          );
        }
      }
    }
    const { rows } = await client.query(
      `UPDATE project SET name=$1, status=$2, description=$3 WHERE id=$4 RETURNING *`,
      [name, status, description || null, req.params.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.delete('/api/projects/:id', async (req, res) => {
  await pool.query(`DELETE FROM project WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/projects/:id/parts', async (req, res) => {
  const { part_variant_id, quantity } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO project_part (project_id, part_variant_id, quantity) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, part_variant_id, quantity]
    );
    await client.query(
      `UPDATE part_variant SET quantity_available = quantity_available - $1, quantity_reserved = quantity_reserved + $1 WHERE id=$2`,
      [quantity, part_variant_id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.delete('/api/project-parts/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [pp] } = await client.query(`SELECT * FROM project_part WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!pp) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    await client.query(
      `UPDATE part_variant SET quantity_available = quantity_available + $1, quantity_reserved = quantity_reserved - $1 WHERE id=$2`,
      [pp.quantity, pp.part_variant_id]
    );
    await client.query(`DELETE FROM project_part WHERE id=$1`, [req.params.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/api/projects/:id/files', uploadProject.single('file'), async (req, res) => {
  const { file_category } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO project_file (project_id, file_path, original_filename, file_category)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, req.file.filename, req.file.originalname, file_category || 'other']
  );
  res.json(rows[0]);
});

app.delete('/api/project-files/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM project_file WHERE id=$1`, [req.params.id]);
  if (rows[0]) fs.rmSync(path.join(PROJECT_DIR, rows[0].file_path), { force: true });
  await pool.query(`DELETE FROM project_file WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.put('/api/project-files/:id/latest', async (req, res) => {
  const { is_latest } = req.body;
  const { rows } = await pool.query(
    `UPDATE project_file SET is_latest=$1 WHERE id=$2 RETURNING *`,
    [is_latest, req.params.id]
  );
  res.json(rows[0]);
});

app.post('/api/projects/:id/image', uploadImage.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const { rows: cur } = await pool.query(`SELECT image_path FROM project WHERE id=$1`, [req.params.id]);
  if (cur[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, cur[0].image_path), { force: true });
  const { rows } = await pool.query(
    `UPDATE project SET image_path=$1 WHERE id=$2 RETURNING *`, [req.file.filename, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/projects/:id/image', async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM project WHERE id=$1`, [req.params.id]);
  if (rows[0]?.image_path) fs.rmSync(path.join(IMAGE_DIR, rows[0].image_path), { force: true });
  await pool.query(`UPDATE project SET image_path=NULL WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/projects/:id/checklist', async (req, res) => {
  const { text, order_index } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO project_checklist_item (project_id, text, order_index) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, text, order_index ?? 0]
  );
  res.json(rows[0]);
});

app.put('/api/checklist/:id', async (req, res) => {
  const { text, is_completed, order_index } = req.body;
  const { rows } = await pool.query(
    `UPDATE project_checklist_item SET text=COALESCE($1,text), is_completed=COALESCE($2,is_completed), order_index=COALESCE($3,order_index) WHERE id=$4 RETURNING *`,
    [text ?? null, is_completed ?? null, order_index ?? null, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/api/checklist/:id', async (req, res) => {
  await pool.query(`DELETE FROM project_checklist_item WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/step-definitions', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM step_definition ORDER BY name`);
  res.json(rows);
});

app.post('/api/step-definitions', async (req, res) => {
  const { name } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO step_definition (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *`, [name]
  );
  res.json(rows[0]);
});

app.post('/api/projects/:id/steps', async (req, res) => {
  const { step_definition_id, is_primary } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO project_step (project_id, step_definition_id, is_primary) VALUES ($1,$2,$3)
     ON CONFLICT (project_id, step_definition_id) DO UPDATE SET is_primary=$3 RETURNING *`,
    [req.params.id, step_definition_id, is_primary || false]
  );
  res.json(rows[0]);
});

app.delete('/api/projects/:projectId/steps/:stepId', async (req, res) => {
  await pool.query(`DELETE FROM project_step WHERE project_id=$1 AND step_definition_id=$2`, [req.params.projectId, req.params.stepId]);
  res.json({ ok: true });
});

// ─── ADJUSTMENT LOG ──────────────────────────────────────────────────────────

app.get('/api/variants/:id/adjustments', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM adjustment_log WHERE part_variant_id=$1 ORDER BY timestamp DESC LIMIT 50`, [req.params.id]
  );
  res.json(rows);
});

// ─── SETTINGS: EXPORT / IMPORT / BACKUP / RESTORE ───────────────────────────

// Export inventory (categories + variants, no orders/projects)
app.get('/api/settings/export-inventory', async (req, res) => {
  const [cats, variants] = await Promise.all([
    pool.query(`SELECT id, name, category, description, parent_id, image_path FROM part_group ORDER BY id`),
    pool.query(`SELECT * FROM part_variant ORDER BY id`)
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="inventory-${Date.now()}.json"`);
  res.json({ type: 'inventory', exported_at: new Date(), categories: cats.rows, variants: variants.rows });
});

// Import inventory JSON — merge categories and variants
app.post('/api/settings/import-inventory', uploadCsv.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const data = JSON.parse(req.file.buffer.toString('utf-8'));
    if (data.type !== 'inventory') return res.status(400).json({ error: 'Not an inventory file' });

    await client.query('BEGIN');
    const catIdMap = {}; // old id -> new id

    // Insert categories in order (parents first since ordered by id)
    for (const c of data.categories) {
      const parent_id = c.parent_id ? catIdMap[c.parent_id] : null;
      const { rows } = await client.query(
        `INSERT INTO part_group (name, category, description, parent_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        [c.name, c.category, c.description, parent_id]
      );
      if (rows[0]) catIdMap[c.id] = rows[0].id;
      else {
        // Already exists — find it
        const { rows: ex } = await client.query(`SELECT id FROM part_group WHERE name=$1 AND COALESCE(parent_id,-1)=COALESCE($2,-1)`, [c.name, parent_id]);
        if (ex[0]) catIdMap[c.id] = ex[0].id;
      }
    }

    let imported = 0;
    for (const v of data.variants) {
      const gid = catIdMap[v.part_group_id];
      if (!gid) continue;
      await client.query(
        `INSERT INTO part_variant (part_group_id, label, quantity_available, quantity_reserved, quantity_on_order, storage_location, notes, product_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [gid, v.label, v.quantity_available, v.quantity_reserved, v.quantity_on_order, v.storage_location, v.notes, v.product_url]
      );
      imported++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, categories: Object.keys(catIdMap).length, variants: imported });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// Import category template (categories/subcategories only, no variants)
app.post('/api/settings/import-template', uploadCsv.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const data = JSON.parse(req.file.buffer.toString('utf-8'));
    const categories = data.categories || data; // allow bare array
    if (!Array.isArray(categories)) return res.status(400).json({ error: 'Expected array of categories' });

    await client.query('BEGIN');
    const nameMap = {}; // name -> id, for resolving parent references by name

    // Support two formats: {name, parent} or {name, children:[...]}
    const toInsert = [];
    const flatten = (items, parentName = null) => {
      for (const item of items) {
        toInsert.push({ name: item.name, description: item.description||null, parentName });
        if (item.children) flatten(item.children, item.name);
      }
    };
    flatten(Array.isArray(categories) ? categories : [categories]);

    for (const item of toInsert) {
      const parent_id = item.parentName ? nameMap[item.parentName] : null;
      const { rows } = await client.query(
        `INSERT INTO part_group (name, category, description, parent_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
        [item.name, item.name, item.description, parent_id]
      );
      if (rows[0]) nameMap[item.name] = rows[0].id;
    }
    await client.query('COMMIT');
    res.json({ ok: true, created: Object.keys(nameMap).length });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// Full backup (everything except files on disk)
app.get('/api/settings/backup', async (req, res) => {
  const [cats, variants, docs, orders, orderItems, projects, projectParts,
    projectFiles, checklist, stepDefs, projectSteps, adjLog] = await Promise.all([
    pool.query(`SELECT * FROM part_group ORDER BY id`),
    pool.query(`SELECT * FROM part_variant ORDER BY id`),
    pool.query(`SELECT * FROM variant_document ORDER BY id`),
    pool.query(`SELECT * FROM "order" ORDER BY id`),
    pool.query(`SELECT * FROM order_item ORDER BY id`),
    pool.query(`SELECT * FROM project ORDER BY id`),
    pool.query(`SELECT * FROM project_part ORDER BY id`),
    pool.query(`SELECT * FROM project_file ORDER BY id`),
    pool.query(`SELECT * FROM project_checklist_item ORDER BY id`),
    pool.query(`SELECT * FROM step_definition ORDER BY id`),
    pool.query(`SELECT * FROM project_step`),
    pool.query(`SELECT * FROM adjustment_log ORDER BY id`)
  ]);
  res.setHeader('Content-Disposition', `attachment; filename="parttrack-backup-${Date.now()}.json"`);
  res.json({
    type: 'backup', version: 1, exported_at: new Date(),
    part_group: cats.rows, part_variant: variants.rows, variant_document: docs.rows,
    order: orders.rows, order_item: orderItems.rows,
    project: projects.rows, project_part: projectParts.rows, project_file: projectFiles.rows,
    project_checklist_item: checklist.rows, step_definition: stepDefs.rows,
    project_step: projectSteps.rows, adjustment_log: adjLog.rows
  });
});

// Restore from backup — wipes and replaces all data
app.post('/api/settings/restore', uploadCsv.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const data = JSON.parse(req.file.buffer.toString('utf-8'));
    if (data.type !== 'backup') return res.status(400).json({ error: 'Not a backup file' });

    await client.query('BEGIN');

    // Wipe in dependency order
    await client.query(`DELETE FROM adjustment_log`);
    await client.query(`DELETE FROM project_step`);
    await client.query(`DELETE FROM project_checklist_item`);
    await client.query(`DELETE FROM project_file`);
    await client.query(`DELETE FROM project_part`);
    await client.query(`DELETE FROM project`);
    await client.query(`DELETE FROM order_item`);
    await client.query(`DELETE FROM "order"`);
    await client.query(`DELETE FROM variant_document`);
    await client.query(`DELETE FROM part_variant`);
    await client.query(`DELETE FROM part_group`);
    await client.query(`DELETE FROM step_definition`);

    const ins = async (table, cols, rows) => {
      if (!rows?.length) return;
      for (const row of rows) {
        const vals = cols.map(c => row[c] ?? null);
        const placeholders = cols.map((_,i) => `$${i+1}`).join(',');
        await client.query(`INSERT INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${placeholders})`, vals);
      }
    };

    await ins('part_group', ['id','name','category','description','parent_id','image_path'], data.part_group);
    await ins('part_variant', ['id','part_group_id','label','quantity_available','quantity_reserved','quantity_on_order','storage_location','notes','image_path','product_url'], data.part_variant);
    await ins('variant_document', ['id','part_variant_id','file_type','file_path','text_content','original_filename','uploaded_at'], data.variant_document);
    await ins('step_definition', ['id','name'], data.step_definition);
    await ins('order', ['id','date','status','imported_at'], data.order);
    await ins('order_item', ['id','order_id','part_variant_id','raw_name','quantity'], data.order_item);
    await ins('project', ['id','name','status','description','image_path'], data.project);
    await ins('project_part', ['id','project_id','part_variant_id','quantity'], data.project_part);
    await ins('project_file', ['id','project_id','file_path','original_filename','file_category','is_latest','uploaded_at'], data.project_file);
    await ins('project_checklist_item', ['id','project_id','text','is_completed','order_index'], data.project_checklist_item);
    await ins('project_step', ['project_id','step_definition_id','is_primary'], data.project_step);
    await ins('adjustment_log', ['id','part_variant_id','change_amount','timestamp','note'], data.adjustment_log);

    // Reset sequences
    const seqTables = ['part_group','part_variant','variant_document','order','order_item',
      'project','project_part','project_file','project_checklist_item','step_definition','adjustment_log'];
    for (const t of seqTables) {
      await client.query(`SELECT setval(pg_get_serial_sequence('"${t}"','id'), COALESCE(MAX(id),0)+1, false) FROM "${t}"`);
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ─── HEALTH ──────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`PartTrack backend on :${PORT}`));
