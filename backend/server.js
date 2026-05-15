import express from 'express';
import cors from 'cors';
import multer from 'multer';
import pg from 'pg';
import { parse } from 'csv-parse/sync';
import pdfParse from 'pdf-parse';
import archiver from 'archiver';
import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const APP_VERSION = '0.2.14';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://buildbook_web:buildbook_web@localhost:5432/buildbook_web',
});

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const DOC_DIR = path.join(UPLOAD_DIR, 'documents');
const PROJECT_DIR = path.join(UPLOAD_DIR, 'projects');
const IMAGE_DIR = path.join(UPLOAD_DIR, 'images');
const IMPORT_DIR = path.join(UPLOAD_DIR, 'imports');
const BACKUP_DIR = path.join(UPLOAD_DIR, 'backup-tmp');

[UPLOAD_DIR, DOC_DIR, PROJECT_DIR, IMAGE_DIR, IMPORT_DIR, BACKUP_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/files/documents', express.static(DOC_DIR));
app.use('/files/projects', express.static(PROJECT_DIR));
app.use('/files/images', express.static(IMAGE_DIR));

const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const makeStorage = (dir) => multer.diskStorage({
  destination: dir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`),
});
const guessFileType = (file) => {
  if (!file) return 'text';
  if (file.mimetype === 'application/pdf') return 'pdf';
  if (file.mimetype?.startsWith('image/')) return 'image';
  return 'file';
};
const imageFilter = (req, file, cb) => cb(null, file.mimetype?.startsWith('image/'));

const uploadDoc = multer({ storage: makeStorage(DOC_DIR) });
const uploadProject = multer({ storage: makeStorage(PROJECT_DIR) });
const uploadImage = multer({ storage: makeStorage(IMAGE_DIR), fileFilter: imageFilter });
const uploadCsv = multer({ storage: multer.memoryStorage() });
const uploadProjectImport = multer({ storage: makeStorage(IMPORT_DIR) });
const uploadBackup = multer({ storage: makeStorage(BACKUP_DIR) });

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const DEFAULT_FILE_TRACKERS = [
  { key: 'drawing', label: 'Drawings', extensions: '.dwg,.dxf' },
  { key: 'firmware', label: 'Firmware', extensions: '.ino,.cpp,.h' },
  { key: 'pcb', label: 'PCB Files', extensions: '.kicad_pcb,.kicad_sch,.brd,.sch' },
  { key: 'bom', label: 'PCB BOM', extensions: '.xlsx,.xls,.csv,.tsv' },
  { key: 'enclosure', label: 'Enclosure', extensions: '.stl,.step,.3mf' },
  { key: 'datasheet', label: 'Datasheets', extensions: '.pdf' },
  { key: 'other', label: 'Other', extensions: '' },
];

const DEFAULT_TEMPLATE_CHECKLIST = [
  'Capture goal and success criteria',
  'Link core parts and datasheets',
  'Save latest design or firmware files',
];

function normalizeExtensions(value) {
  if (!value) return [];
  const source = Array.isArray(value) ? value.join(',') : String(value);
  return [...new Set(source
    .split(/[\s,]+/)
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`)))];
}

function slugifyKey(value, fallback = 'tracker') {
  const key = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key || fallback;
}

function normalizeFileTrackers(trackers) {
  const seen = new Set();
  const rows = (Array.isArray(trackers) && trackers.length ? trackers : DEFAULT_FILE_TRACKERS)
    .map((tracker, index) => {
      const label = String(tracker.label || '').trim() || `File Type ${index + 1}`;
      let key = slugifyKey(tracker.key || label, `tracker_${index + 1}`);
      if (seen.has(key)) key = `${key}_${index + 1}`;
      seen.add(key);
      return {
        key,
        label,
        extensions: normalizeExtensions(tracker.extensions).join(','),
      };
    })
    .filter((tracker) => tracker.label);
  return rows.length ? rows : DEFAULT_FILE_TRACKERS;
}

function trackerDisplayName(tracker) {
  const extensions = normalizeExtensions(tracker.extensions).join('');
  return extensions ? `${tracker.label}-${extensions}` : tracker.label;
}

function parseJsonSetting(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

async function getJsonSetting(key, fallback) {
  const { rows } = await pool.query(`SELECT value FROM app_metadata WHERE key=$1`, [key]);
  return parseJsonSetting(rows[0]?.value, fallback);
}

async function setJsonSetting(client, key, value) {
  await client.query(
    `INSERT INTO app_metadata (key, value)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

async function getProjectTemplate() {
  const [stepResult, checklist, trackers] = await Promise.all([
    pool.query(`SELECT * FROM step_definition ORDER BY order_index, name`),
    getJsonSetting('template_checklist', DEFAULT_TEMPLATE_CHECKLIST),
    getJsonSetting('file_trackers', DEFAULT_FILE_TRACKERS),
  ]);
  const fileTrackers = normalizeFileTrackers(trackers);
  const bomTracker = DEFAULT_FILE_TRACKERS.find((tracker) => tracker.key === 'bom');
  const fileTrackersWithBom = fileTrackers.some((tracker) => tracker.key === 'bom')
    ? fileTrackers
    : [
      ...fileTrackers.slice(0, Math.min(fileTrackers.length, 3)),
      bomTracker,
      ...fileTrackers.slice(Math.min(fileTrackers.length, 3)),
    ];
  return {
    steps: stepResult.rows,
    default_checklist: Array.isArray(checklist) ? checklist : DEFAULT_TEMPLATE_CHECKLIST,
    file_trackers: fileTrackersWithBom,
  };
}

async function ensureRuntimeSchema() {
  await pool.query(`ALTER TABLE category ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE project_part ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE project_file ADD COLUMN IF NOT EXISTS tracker_key TEXT`);
  await pool.query(`ALTER TABLE project_file ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'file'`);
  await pool.query(`ALTER TABLE project_file ADD COLUMN IF NOT EXISTS version_note TEXT`);
  await pool.query(`ALTER TABLE part_document ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE`);
}

function rmUpload(dir, filename) {
  if (!filename) return;
  fs.rmSync(path.join(dir, filename), { force: true });
}

function safeZipName(value) {
  return safeName(String(value || 'file')).replace(/^_+|_+$/g, '') || 'file';
}

function pathLabel(pathParts) {
  const parts = Array.isArray(pathParts) ? pathParts.filter(Boolean) : [];
  return parts.length ? parts.join(' / ') : 'Uncategorized';
}

function extractImagePathsFromHtml(value) {
  const text = String(value || '');
  const found = new Set();
  const pattern = /\/files\/images\/([^"')\s<>]+)/g;
  let match;
  while ((match = pattern.exec(text))) found.add(match[1]);
  return [...found];
}

function guessFileTypeFromName(filename = '') {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
  return 'file';
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function extensionFromContentType(contentType, url) {
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('gif')) return '.gif';
  if (contentType?.includes('svg')) return '.svg';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg';
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext) ? ext : '.jpg';
}

function normalizeImageUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

async function downloadImageToLibrary(url) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  const response = await fetch(normalized, {
    headers: {
      'User-Agent': 'Mozilla/5.0 BuildBook_Web/2.0',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.startsWith('image/')) return null;

  const ext = extensionFromContentType(contentType, normalized);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return null;
  fs.writeFileSync(path.join(IMAGE_DIR, filename), buffer);
  return filename;
}

async function attachImportImageToPart(partId, imageUrl) {
  if (!partId || !imageUrl) return null;
  const { rows: [part] } = await pool.query(`SELECT image_path FROM part WHERE id=$1`, [partId]);
  if (!part || part.image_path) return part?.image_path || null;

  try {
    const filename = await downloadImageToLibrary(imageUrl);
    if (!filename) return null;
    await pool.query(`UPDATE part SET image_path=$1, updated_at=NOW() WHERE id=$2`, [filename, partId]);
    return filename;
  } catch (e) {
    console.warn('Import image download failed:', e.message);
    return null;
  }
}

function cleanDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const digiKeyDate = text.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i);
  if (digiKeyDate) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const month = months[digiKeyDate[2].toLowerCase()];
    if (month) return `${digiKeyDate[3]}-${month}-${digiKeyDate[1].padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function firstPresent(row, names, fallback = '') {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return fallback;
}

function normalizeDigiKeyPartNumber(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^\w.-]/g, '');
}

function isLikelyDigiKeyPartNumber(value) {
  const text = normalizeDigiKeyPartNumber(value);
  return text.length >= 4 && /[A-Z0-9]/i.test(text) && /[-A-Z0-9]/i.test(text) && !/^\d+(\.\d+)?$/.test(text);
}

function makeDigiKeyUrl(partNumber) {
  const part = normalizeDigiKeyPartNumber(partNumber);
  return part ? `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(part)}` : null;
}

function absolutizeUrl(url, base = 'https://www.digikey.com') {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function extractImageFromHtml(html) {
  const candidates = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<img[^>]+(?:id|class|data-testid)=["'][^"']*(?:product|image|photo)[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+(?:id|class|data-testid)=["'][^"']*(?:product|image|photo)[^"']*["']/i,
  ];
  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match?.[1]) return absolutizeUrl(match[1]);
  }
  return null;
}

function decodeHtmlImageUrl(value) {
  if (!value) return null;
  const text = String(value)
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .trim();
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function isLikelyNotFoundPage(html, finalUrl = '') {
  const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '';
  const heading = html.match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1] || '';
  const text = `${title} ${heading} ${finalUrl}`.toLowerCase();
  return /\b(404|not found|page unavailable|page not found|product not found|item not found|no longer available)\b/.test(text);
}

function isLikelyUsefulImageUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const lower = url.toLowerCase();
  return ![
    'logo',
    'favicon',
    'sprite',
    'placeholder',
    'noimage',
    'no-image',
    'notfound',
    'not-found',
    '404',
    'blank',
    'transparent',
    'tracking',
    'pixel',
  ].some((term) => lower.includes(term));
}

async function probeImageUrl(url) {
  if (!isLikelyUsefulImageUrl(url)) return null;
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 BuildBook_Web/2.0',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return null;
    const length = Number(response.headers.get('content-length') || 0);
    if (length && length < 500) return null;
    return url;
  } catch {
    return null;
  }
}

async function firstUsableImageUrl(candidates, limit = 8) {
  const unique = [...new Set(candidates.filter(Boolean))].filter(isLikelyUsefulImageUrl).slice(0, limit);
  for (const url of unique) {
    const usable = await probeImageUrl(url);
    if (usable) return usable;
  }
  return null;
}

function buildImageSearchQuery(item) {
  return [
    item.raw_name,
    item.attributes,
    item.store,
    'electronic component',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function extractImagesFromSearchHtml(html) {
  const found = new Set();
  const patterns = [
    /"murl"\s*:\s*"([^"]+)"/gi,
    /"contentUrl"\s*:\s*"([^"]+)"/gi,
    /mediaurl=([^&"']+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const decoded = decodeHtmlImageUrl(match[1]);
      if (decoded && /^https?:\/\//i.test(decoded)) found.add(decoded);
    }
  }
  return [...found].filter(isLikelyUsefulImageUrl);
}

async function findImageFromProductPage(url) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const response = await fetch(normalized, {
      headers: {
        'User-Agent': 'Mozilla/5.0 BuildBook_Web/2.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    if (isLikelyNotFoundPage(html, response.url)) return null;
    return firstUsableImageUrl([extractImageFromHtml(html)]);
  } catch (e) {
    console.warn('Product page image lookup failed:', e.message);
    return null;
  }
}

async function findWebImageForImportItem(item) {
  const productImage = await findImageFromProductPage(item.product_url);
  if (productImage) return productImage;

  const query = buildImageSearchQuery(item);
  if (!query) return null;
  try {
    const response = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&safeSearch=moderate`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 BuildBook_Web/2.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const images = extractImagesFromSearchHtml(await response.text());
    return firstUsableImageUrl(images, 12);
  } catch (e) {
    console.warn('Internet image search failed:', e.message);
    return null;
  }
}

async function findDigiKeyImage(partNumber) {
  const url = makeDigiKeyUrl(partNumber);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 BuildBook_Web/2.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    return extractImageFromHtml(html);
  } catch (e) {
    console.warn('Digi-Key image lookup failed:', e.message);
    return null;
  }
}

function mergeWrappedLines(lines) {
  const merged = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const startsNewItem = /^\d{1,4}\s+/.test(line) || /^[A-Z0-9][A-Z0-9.-]{3,}\s{2,}/i.test(raw);
    if (!startsNewItem && merged.length && !/^(subtotal|tax|shipping|total|invoice|sales order)\b/i.test(line)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

function parseDigiKeyInvoiceText(text) {
  const compactText = text.replace(/\s+/g, ' ').trim();
  const orderMatch = compactText.match(/(?:Sales\s*Order|WEBORDER\s*ID)\s*(?:Number|No\.?|ID)?\s*[:#]?\s*([0-9]{6,})/i);
  const dateMatch = compactText.match(/(?:Order|Invoice|Sales\s*Order)\s*Date\s*[:#]?\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|\d{1,2}-[A-Z]{3}-\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i)
    || compactText.match(/\b(\d{1,2}-[A-Z]{3}-\d{4})\b/i);
  const partBlockItems = [];
  const blockPattern = /(?:^|\s)(\d{3,8})?\s*PART:\s*([A-Z0-9.-]+)\s+MFG:\s*([^/]+?)\/\s*([A-Z0-9][A-Z0-9 ._-]*?)\s+DESC:\s*(.*?)(?=\s+COO:|\s+ECCN:|\s+HTSUS:|\s+PART:|$)/gi;
  let blockMatch;
  while ((blockMatch = blockPattern.exec(compactText))) {
    const itemQtyDigits = blockMatch[1] || '';
    const digiKeyPart = normalizeDigiKeyPartNumber(blockMatch[2]);
    const manufacturer = blockMatch[3].trim();
    const manufacturerPart = blockMatch[4].replace(/\s{2,}/g, ' ').trim();
    const description = blockMatch[5]
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+\d+\.\d{2,5}\d+\.\d{2}$/, '')
      .trim();
    const qty = itemQtyDigits.length >= 3 ? itemQtyDigits.slice(1, 2) : '';
    partBlockItems.push({
      raw_name: `${manufacturerPart} - ${description}`.trim(),
      product_url: makeDigiKeyUrl(digiKeyPart || manufacturerPart),
      product_image_url: '',
      attributes: [
        manufacturer && `Manufacturer: ${manufacturer}`,
        manufacturerPart && `Manufacturer part: ${manufacturerPart}`,
        digiKeyPart && `Digi-Key part: ${digiKeyPart}`,
        qty && `Invoice quantity: ${qty}`,
        orderMatch?.[1] && `Digi-Key order: ${orderMatch[1]}`,
      ].filter(Boolean).join('\n'),
      store: 'Digi-Key',
      ordered_at: cleanDate(dateMatch?.[1]),
      lookup_part: digiKeyPart || manufacturerPart,
    });
  }
  if (partBlockItems.length) return partBlockItems;

  const lines = mergeWrappedLines(text.split(/\r?\n/));
  const items = [];
  const seen = new Set();

  for (const line of lines) {
    if (/^(subtotal|tax|shipping|handling|total|invoice|sales order|customer|payment)\b/i.test(line)) continue;
    const partCandidates = [...line.matchAll(/\b[A-Z0-9][A-Z0-9.-]{3,}\b/gi)]
      .map((match) => normalizeDigiKeyPartNumber(match[0]))
      .filter((value) => isLikelyDigiKeyPartNumber(value))
      .filter((value) => !/^(USD|EACH|EA|ROHS|TARIFF)$/i.test(value));
    if (!partCandidates.length) continue;

    const digiKeyPart = partCandidates.find((value) => /-ND$/i.test(value)) || partCandidates[0];
    const manufacturerPart = partCandidates.find((value) => value !== digiKeyPart && !/-ND$/i.test(value)) || '';
    const qtyMatch = line.match(/(?:^|\s)(\d{1,6})(?:\s+(?:EA|Each|PCS?)\b)?/i);
    const qty = qtyMatch?.[1] || '';
    const cleaned = line
      .replace(/^\d{1,4}\s+/, '')
      .replace(/\s+\$?\d+\.\d{2}\b/g, '')
      .trim();
    const key = `${digiKeyPart}:${manufacturerPart}:${cleaned}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      raw_name: cleaned || manufacturerPart || digiKeyPart,
      product_url: makeDigiKeyUrl(manufacturerPart || digiKeyPart),
      product_image_url: '',
      attributes: [
        manufacturerPart && `Manufacturer part: ${manufacturerPart}`,
        digiKeyPart && `Digi-Key part: ${digiKeyPart}`,
        qty && `Invoice quantity: ${qty}`,
        orderMatch?.[1] && `Digi-Key order: ${orderMatch[1]}`,
      ].filter(Boolean).join('\n'),
      store: 'Digi-Key',
      ordered_at: cleanDate(dateMatch?.[1]),
      lookup_part: manufacturerPart || digiKeyPart,
    });
  }

  return items;
}

async function findSuggestedPart(client, item) {
  if (item.product_url) {
    const exact = await client.query(
      `SELECT id FROM part WHERE product_url=$1 LIMIT 1`,
      [item.product_url],
    );
    if (exact.rows[0]) return exact.rows[0].id;
  }

  const words = item.raw_name
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
  if (words.length === 0) return null;

  const search = words.map((w) => `%${w}%`);
  const clauses = search.map((_, i) => `name ILIKE $${i + 1}`).join(' OR ');
  const fuzzy = await client.query(
    `SELECT id FROM part WHERE ${clauses} ORDER BY updated_at DESC LIMIT 1`,
    search,
  );
  return fuzzy.rows[0]?.id || null;
}

async function categoryDescendants(categoryId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM category WHERE id=$1
       UNION ALL
       SELECT c.id FROM category c JOIN tree t ON c.parent_id=t.id
     )
     SELECT id FROM tree`,
    [categoryId],
  );
  return rows.map((r) => r.id);
}

function buildCategoryPathMap(categories) {
  const byId = new Map(categories.map((cat) => [cat.id, cat]));
  const pathFor = (categoryId, seen = new Set()) => {
    if (!categoryId || seen.has(categoryId)) return [];
    const category = byId.get(categoryId);
    if (!category) return [];
    return [...pathFor(category.parent_id, new Set([...seen, categoryId])), category.name];
  };
  return new Map(categories.map((cat) => [cat.id, pathFor(cat.id)]));
}

async function getCategoryOptions(client = pool) {
  const { rows } = await client.query(`SELECT * FROM category ORDER BY parent_id NULLS FIRST, order_index, name`);
  const pathMap = buildCategoryPathMap(rows);
  return rows.map((cat) => ({
    ...cat,
    path: pathMap.get(cat.id) || [cat.name],
    label: pathLabel(pathMap.get(cat.id) || [cat.name]),
  }));
}

function suggestCategoryForPath(exportedPath, localCategories) {
  const normalized = String(exportedPath || '').toLowerCase();
  const exact = localCategories.find((cat) => cat.label.toLowerCase() === normalized);
  if (exact) return { exact, suggested: exact };
  const leaf = normalized.split('/').map((part) => part.trim()).filter(Boolean).pop();
  const suggested = localCategories.find((cat) => cat.name.toLowerCase() === leaf)
    || localCategories.find((cat) => cat.label.toLowerCase().includes(leaf || ''));
  return { exact: null, suggested: suggested || null };
}

async function wouldCreateCategoryCycle(categoryId, parentId) {
  if (!parentId) return false;
  if (String(categoryId) === String(parentId)) return true;
  const descendants = await categoryDescendants(categoryId);
  return descendants.map(String).includes(String(parentId));
}

function partSelect() {
  return `
    SELECT p.*,
           c.name AS category_name,
           c.parent_id AS category_parent_id,
           parent.name AS parent_category_name,
           COUNT(pd.id)::int AS document_count
    FROM part p
    LEFT JOIN category c ON c.id=p.category_id
    LEFT JOIN category parent ON parent.id=c.parent_id
    LEFT JOIN part_document pd ON pd.part_id=p.id
  `;
}

// Global search
app.get('/api/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.json({ query: q, results: { projects: [], parts: [], files: [], documents: [], imports: [] } });
  }

  const like = `%${q}%`;
  const [projects, parts, files, documents, imports] = await Promise.all([
    pool.query(
      `SELECT id, name, status, updated_at
       FROM project
       WHERE name ILIKE $1 OR notes ILIKE $1 OR status ILIKE $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [like],
    ),
    pool.query(
      `SELECT p.id, p.name, p.storage_location, p.product_url, p.updated_at,
              c.name AS category_name, parent.name AS parent_category_name
       FROM part p
       LEFT JOIN category c ON c.id=p.category_id
       LEFT JOIN category parent ON parent.id=c.parent_id
       WHERE p.name ILIKE $1
          OR p.notes ILIKE $1
          OR p.spec_summary ILIKE $1
          OR p.storage_location ILIKE $1
          OR p.product_url ILIKE $1
          OR c.name ILIKE $1
          OR parent.name ILIKE $1
       ORDER BY p.updated_at DESC
       LIMIT 12`,
      [like],
    ),
    pool.query(
      `SELECT pf.id, pf.project_id, pf.original_filename, pf.file_category, pf.file_type,
              pf.tracker_key, pf.version_note, pf.is_latest, pf.uploaded_at,
              pr.name AS project_name
       FROM project_file pf
       JOIN project pr ON pr.id=pf.project_id
       WHERE pf.original_filename ILIKE $1
          OR pf.file_category ILIKE $1
          OR pf.file_type ILIKE $1
          OR pf.version_note ILIKE $1
          OR pr.name ILIKE $1
       ORDER BY pf.uploaded_at DESC
       LIMIT 12`,
      [like],
    ),
    pool.query(
      `SELECT pd.id, pd.part_id, pd.original_filename, pd.file_type, pd.uploaded_at,
              p.name AS part_name
       FROM part_document pd
       JOIN part p ON p.id=pd.part_id
       WHERE pd.original_filename ILIKE $1
          OR pd.file_type ILIKE $1
          OR p.name ILIKE $1
       ORDER BY pd.uploaded_at DESC
       LIMIT 12`,
      [like],
    ),
    pool.query(
      `SELECT i.id, i.import_batch_id, i.raw_name, i.status, i.store, i.attributes,
              b.original_filename
       FROM import_item i
       JOIN import_batch b ON b.id=i.import_batch_id
       WHERE i.raw_name ILIKE $1
          OR i.attributes ILIKE $1
          OR i.store ILIKE $1
          OR b.original_filename ILIKE $1
       ORDER BY i.updated_at DESC
       LIMIT 10`,
      [like],
    ),
  ]);

  res.json({
    query: q,
    results: {
      projects: projects.rows,
      parts: parts.rows,
      files: files.rows,
      documents: documents.rows,
      imports: imports.rows,
    },
  });
}));

// Categories
app.get('/api/categories', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*,
           COUNT(p.id)::int AS part_count
    FROM category c
    LEFT JOIN part p ON p.category_id=c.id
    GROUP BY c.id
    ORDER BY c.parent_id NULLS FIRST, c.order_index, c.name
  `);
  res.json(rows);
}));

app.post('/api/categories', asyncHandler(async (req, res) => {
  const { name, description, parent_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const { rows } = await pool.query(
    `INSERT INTO category (name, description, parent_id, order_index)
     VALUES (
       $1,
       $2,
       $3,
       COALESCE((SELECT MAX(order_index) + 10 FROM category WHERE parent_id IS NOT DISTINCT FROM $3::int), 10)
     ) RETURNING *`,
    [name.trim(), description || null, parent_id || null],
  );
  res.json(rows[0]);
}));

app.put('/api/categories/:id', asyncHandler(async (req, res) => {
  const { name, description, parent_id } = req.body;
  if (await wouldCreateCategoryCycle(req.params.id, parent_id)) {
    return res.status(400).json({ error: 'A category cannot be moved under itself or its own child.' });
  }
  const { rows } = await pool.query(
    `UPDATE category
     SET name=$1, description=$2, parent_id=$3, updated_at=NOW()
     WHERE id=$4 RETURNING *`,
    [name?.trim(), description || null, parent_id || null, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Category not found' });
  res.json(rows[0]);
}));

app.put('/api/categories/:id/order', asyncHandler(async (req, res) => {
  const { direction } = req.body;
  if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'Direction must be up or down' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [current] } = await client.query(`SELECT * FROM category WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found' });
    }
    const { rows: siblings } = await client.query(
      `SELECT * FROM category
       WHERE parent_id IS NOT DISTINCT FROM $1
       ORDER BY order_index, name, id
       FOR UPDATE`,
      [current.parent_id],
    );
    for (let i = 0; i < siblings.length; i += 1) {
      await client.query(`UPDATE category SET order_index=$1 WHERE id=$2`, [(i + 1) * 10, siblings[i].id]);
      siblings[i].order_index = (i + 1) * 10;
    }
    const index = siblings.findIndex((cat) => String(cat.id) === String(current.id));
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex >= 0 && swapIndex < siblings.length) {
      await client.query(`UPDATE category SET order_index=$1, updated_at=NOW() WHERE id=$2`, [siblings[swapIndex].order_index, siblings[index].id]);
      await client.query(`UPDATE category SET order_index=$1, updated_at=NOW() WHERE id=$2`, [siblings[index].order_index, siblings[swapIndex].id]);
    }
    await client.query('COMMIT');
    const { rows } = await pool.query(`SELECT * FROM category WHERE id=$1`, [req.params.id]);
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.put('/api/categories/reorder/siblings', asyncHandler(async (req, res) => {
  const { parent_id, ordered_ids } = req.body;
  if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
    return res.status(400).json({ error: 'ordered_ids is required' });
  }

  const ids = ordered_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  if (ids.length !== ordered_ids.length) return res.status(400).json({ error: 'Category IDs must be numbers' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: siblings } = await client.query(
      `SELECT id FROM category
       WHERE parent_id IS NOT DISTINCT FROM $1::int
       ORDER BY order_index, name, id
       FOR UPDATE`,
      [parent_id || null],
    );
    const siblingIds = siblings.map((row) => row.id);
    const siblingSet = new Set(siblingIds);
    if (ids.length !== siblingIds.length || ids.some((id) => !siblingSet.has(id))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Drag ordering can only reorder categories with the same parent.' });
    }

    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE category SET order_index=$1, updated_at=NOW() WHERE id=$2`,
        [(i + 1) * 10, ids[i]],
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/categories/:id/merge', asyncHandler(async (req, res) => {
  const { target_id } = req.body;
  if (!target_id) return res.status(400).json({ error: 'Target category is required' });
  if (String(req.params.id) === String(target_id)) return res.status(400).json({ error: 'Choose two different categories to merge.' });
  if (await wouldCreateCategoryCycle(req.params.id, target_id)) {
    return res.status(400).json({ error: 'Cannot merge a category into one of its own children.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [source] } = await client.query(`SELECT * FROM category WHERE id=$1 FOR UPDATE`, [req.params.id]);
    const { rows: [target] } = await client.query(`SELECT * FROM category WHERE id=$1 FOR UPDATE`, [target_id]);
    if (!source || !target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Category not found' });
    }
    await client.query(`UPDATE part SET category_id=$1, updated_at=NOW() WHERE category_id=$2`, [target.id, source.id]);
    await client.query(`UPDATE category SET parent_id=$1, updated_at=NOW() WHERE parent_id=$2`, [target.id, source.id]);
    await client.query(`DELETE FROM category WHERE id=$1`, [source.id]);
    rmUpload(IMAGE_DIR, source.image_path);
    await client.query('COMMIT');
    res.json({ ok: true, target_id: target.id });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.delete('/api/categories/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM category WHERE id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM category WHERE id=$1`, [req.params.id]);
  rmUpload(IMAGE_DIR, rows[0]?.image_path);
  res.json({ ok: true });
}));

app.post('/api/categories/:id/image', uploadImage.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const { rows: current } = await pool.query(`SELECT image_path FROM category WHERE id=$1`, [req.params.id]);
  const { rows } = await pool.query(
    `UPDATE category SET image_path=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [req.file.filename, req.params.id],
  );
  rmUpload(IMAGE_DIR, current[0]?.image_path);
  res.json(rows[0]);
}));

app.delete('/api/categories/:id/image', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM category WHERE id=$1`, [req.params.id]);
  await pool.query(`UPDATE category SET image_path=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
  rmUpload(IMAGE_DIR, rows[0]?.image_path);
  res.json({ ok: true });
}));

// Parts library
app.get('/api/parts', asyncHandler(async (req, res) => {
  const { search, category, uncategorized } = req.query;
  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.notes ILIKE $${params.length} OR p.spec_summary ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }
  if (category) {
    const ids = await categoryDescendants(category);
    if (ids.length > 0) {
      params.push(ids);
      where.push(`p.category_id = ANY($${params.length}::int[])`);
    }
  }
  if (uncategorized === 'true') {
    where.push(`p.category_id IS NULL`);
  }

  const { rows } = await pool.query(
    `${partSelect()}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY p.id, c.id, parent.id
     ORDER BY p.updated_at DESC, p.name`,
    params,
  );
  res.json(rows);
}));

app.post('/api/parts', asyncHandler(async (req, res) => {
  const { name, category_id, product_url, storage_location, notes, spec_summary } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Part name is required' });
  const { rows } = await pool.query(
    `INSERT INTO part (name, category_id, product_url, storage_location, notes, spec_summary)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name.trim(), category_id || null, product_url || null, storage_location || null, notes || null, spec_summary || null],
  );
  res.json(rows[0]);
}));

app.get('/api/parts/:id', asyncHandler(async (req, res) => {
  const [partResult, docs, projects] = await Promise.all([
    pool.query(
      `${partSelect()}
       WHERE p.id=$1
       GROUP BY p.id, c.id, parent.id`,
      [req.params.id],
    ),
    pool.query(`SELECT * FROM part_document WHERE part_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
    pool.query(
      `SELECT pp.id AS project_part_id, pr.id, pr.name, pr.status
       FROM project_part pp
       JOIN project pr ON pr.id=pp.project_id
       WHERE pp.part_id=$1
       ORDER BY pr.updated_at DESC`,
      [req.params.id],
    ),
  ]);
  if (!partResult.rows[0]) return res.status(404).json({ error: 'Part not found' });
  res.json({ ...partResult.rows[0], documents: docs.rows, projects: projects.rows });
}));

app.put('/api/parts/:id', asyncHandler(async (req, res) => {
  const { name, category_id, product_url, storage_location, notes, spec_summary } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Part name is required' });
  const { rows } = await pool.query(
    `UPDATE part
     SET name=$1, category_id=$2, product_url=$3, storage_location=$4,
         notes=$5, spec_summary=$6, updated_at=NOW()
     WHERE id=$7 RETURNING *`,
    [name.trim(), category_id || null, product_url || null, storage_location || null, notes || null, spec_summary || null, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Part not found' });
  res.json(rows[0]);
}));

app.delete('/api/parts/:id', asyncHandler(async (req, res) => {
  const { rows: partRows } = await pool.query(`SELECT image_path FROM part WHERE id=$1`, [req.params.id]);
  const { rows: docRows } = await pool.query(`SELECT file_path FROM part_document WHERE part_id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM part WHERE id=$1`, [req.params.id]);
  rmUpload(IMAGE_DIR, partRows[0]?.image_path);
  docRows.forEach((doc) => rmUpload(DOC_DIR, doc.file_path));
  res.json({ ok: true });
}));

app.post('/api/parts/:id/image', uploadImage.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const { rows: current } = await pool.query(`SELECT image_path FROM part WHERE id=$1`, [req.params.id]);
  const { rows } = await pool.query(
    `UPDATE part SET image_path=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [req.file.filename, req.params.id],
  );
  rmUpload(IMAGE_DIR, current[0]?.image_path);
  res.json(rows[0]);
}));

app.post('/api/parts/:id/find-image', asyncHandler(async (req, res) => {
  const { rows: [part] } = await pool.query(`SELECT * FROM part WHERE id=$1`, [req.params.id]);
  if (!part) return res.status(404).json({ error: 'Part not found' });
  if (part.image_path) return res.json({ ok: true, found: false, part });

  const imageUrl = await findWebImageForImportItem({
    raw_name: part.name,
    attributes: [part.spec_summary, part.notes].filter(Boolean).join('\n'),
    store: '',
    product_url: part.product_url,
  });
  if (!imageUrl) return res.json({ ok: true, found: false, part });

  const filename = await downloadImageToLibrary(imageUrl);
  if (!filename) return res.json({ ok: true, found: false, part });

  const { rows: [updated] } = await pool.query(
    `UPDATE part SET image_path=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [filename, part.id],
  );
  res.json({ ok: true, found: true, image_url: imageUrl, part: updated });
}));

app.delete('/api/parts/:id/image', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM part WHERE id=$1`, [req.params.id]);
  await pool.query(`UPDATE part SET image_path=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
  rmUpload(IMAGE_DIR, rows[0]?.image_path);
  res.json({ ok: true });
}));

app.post('/api/parts/:id/documents', uploadDoc.single('file'), asyncHandler(async (req, res) => {
  const { text_content, original_filename } = req.body;
  if (!req.file && !text_content) return res.status(400).json({ error: 'File or text content is required' });
  const fileType = req.file ? guessFileType(req.file) : 'text';
  const { rows: existingPrimary } = await pool.query(
    `SELECT id FROM part_document WHERE part_id=$1 AND is_primary IS TRUE LIMIT 1`,
    [req.params.id],
  );
  const { rows } = await pool.query(
    `INSERT INTO part_document (part_id, file_type, file_path, text_content, original_filename, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      req.params.id,
      fileType,
      req.file?.filename || null,
      text_content || null,
      req.file?.originalname || original_filename || 'text-entry',
      fileType === 'pdf' && !existingPrimary[0],
    ],
  );
  await pool.query(`UPDATE part SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json(rows[0]);
}));

app.put('/api/part-documents/:id/primary', asyncHandler(async (req, res) => {
  const { rows: docs } = await pool.query(`SELECT * FROM part_document WHERE id=$1`, [req.params.id]);
  if (!docs[0]) return res.status(404).json({ error: 'Document not found' });
  await pool.query(`UPDATE part_document SET is_primary=FALSE WHERE part_id=$1`, [docs[0].part_id]);
  const { rows } = await pool.query(`UPDATE part_document SET is_primary=TRUE WHERE id=$1 RETURNING *`, [req.params.id]);
  res.json(rows[0]);
}));

app.delete('/api/part-documents/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT file_path FROM part_document WHERE id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM part_document WHERE id=$1`, [req.params.id]);
  rmUpload(DOC_DIR, rows[0]?.file_path);
  res.json({ ok: true });
}));

// Lightweight spec helper. The saved manual spec summary remains the source of truth.
app.post('/api/scrape-spec', asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 BuildBook_Web/2.0' } });
    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const match = text.match(/(?:specifications?|features?|parameters?)[\s\S]{0,1800}/i);
    res.json({ spec: match ? match[0].slice(0, 1800).trim() : null });
  } catch (e) {
    res.json({ spec: null, message: e.message });
  }
}));

// Settings and project template
app.get('/api/settings/project-template', asyncHandler(async (req, res) => {
  res.json(await getProjectTemplate());
}));

app.put('/api/settings/project-template', asyncHandler(async (req, res) => {
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  const checklist = Array.isArray(req.body.default_checklist)
    ? req.body.default_checklist.map((item) => String(item || '').trim()).filter(Boolean)
    : DEFAULT_TEMPLATE_CHECKLIST;
  const trackers = normalizeFileTrackers(req.body.file_trackers);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const keepIds = [];
    for (const [index, step] of steps.entries()) {
      const name = String(step.name || '').trim();
      if (!name) continue;
      if (step.id) {
        const { rows } = await client.query(
          `UPDATE step_definition SET name=$1, order_index=$2 WHERE id=$3 RETURNING id`,
          [name, index, step.id],
        );
        if (rows[0]) keepIds.push(rows[0].id);
      } else {
        const { rows } = await client.query(
          `INSERT INTO step_definition (name, order_index)
           VALUES ($1,$2)
           ON CONFLICT (name) DO UPDATE SET order_index=EXCLUDED.order_index
           RETURNING id`,
          [name, index],
        );
        keepIds.push(rows[0].id);
      }
    }
    if (keepIds.length) {
      await client.query(`DELETE FROM step_definition WHERE NOT (id = ANY($1::int[]))`, [keepIds]);
    } else {
      await client.query(`DELETE FROM step_definition`);
    }
    await setJsonSetting(client, 'template_checklist', checklist);
    await setJsonSetting(client, 'file_trackers', trackers);
    await client.query('COMMIT');
    res.json(await getProjectTemplate());
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// Projects
app.get('/api/projects', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.*,
           COUNT(DISTINCT pp.id)::int AS part_count,
           COUNT(DISTINCT pc.id)::int AS checklist_total,
           COUNT(DISTINCT pc.id) FILTER (WHERE pc.is_completed)::int AS checklist_done,
           COALESCE(
             jsonb_agg(DISTINCT jsonb_build_object('id', sd.id, 'name', sd.name, 'order_index', sd.order_index))
               FILTER (WHERE sd.id IS NOT NULL),
             '[]'::jsonb
           ) AS steps
    FROM project p
    LEFT JOIN project_part pp ON pp.project_id=p.id
    LEFT JOIN project_checklist_item pc ON pc.project_id=p.id
    LEFT JOIN project_step ps ON ps.project_id=p.id
    LEFT JOIN step_definition sd ON sd.id=ps.step_definition_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.id DESC
  `);
  rows.forEach((row) => row.steps.sort((a, b) => a.order_index - b.order_index));
  res.json(rows);
}));

app.post('/api/projects', asyncHandler(async (req, res) => {
  const { name, status, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });
  const checklist = await getJsonSetting('template_checklist', DEFAULT_TEMPLATE_CHECKLIST);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO project (name, status, notes) VALUES ($1,$2,$3) RETURNING *`,
      [name.trim(), status || 'active', notes || null],
    );
    for (const [index, text] of (Array.isArray(checklist) ? checklist : DEFAULT_TEMPLATE_CHECKLIST).entries()) {
      const clean = String(text || '').trim();
      if (clean) {
        await client.query(
          `INSERT INTO project_checklist_item (project_id, text, order_index) VALUES ($1,$2,$3)`,
          [rows[0].id, clean, index],
        );
      }
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.get('/api/projects/:id', asyncHandler(async (req, res) => {
  const [projectResult, parts, files, checklist, steps] = await Promise.all([
    pool.query(`SELECT * FROM project WHERE id=$1`, [req.params.id]),
    pool.query(
      `SELECT pp.id AS project_part_id, pp.quantity, p.*,
              c.name AS category_name, parent.name AS parent_category_name
       FROM project_part pp
       JOIN part p ON p.id=pp.part_id
       LEFT JOIN category c ON c.id=p.category_id
       LEFT JOIN category parent ON parent.id=c.parent_id
       WHERE pp.project_id=$1
       ORDER BY p.name`,
      [req.params.id],
    ),
    pool.query(`SELECT * FROM project_file WHERE project_id=$1 ORDER BY uploaded_at DESC`, [req.params.id]),
    pool.query(
      `SELECT * FROM project_checklist_item
       WHERE project_id=$1
       ORDER BY is_completed, order_index, id`,
      [req.params.id],
    ),
    pool.query(
      `SELECT sd.*
       FROM project_step ps
       JOIN step_definition sd ON sd.id=ps.step_definition_id
       WHERE ps.project_id=$1
       ORDER BY sd.order_index, sd.name`,
      [req.params.id],
    ),
  ]);
  if (!projectResult.rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json({
    ...projectResult.rows[0],
    parts: parts.rows,
    files: files.rows,
    checklist: checklist.rows,
    steps: steps.rows,
  });
}));

app.put('/api/projects/:id', asyncHandler(async (req, res) => {
  const { name, status, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });
  const { rows } = await pool.query(
    `UPDATE project SET name=$1, status=$2, notes=$3, updated_at=NOW()
     WHERE id=$4 RETURNING *`,
    [name.trim(), status || 'active', notes || null, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json(rows[0]);
}));

app.delete('/api/projects/:id', asyncHandler(async (req, res) => {
  const { rows: projectRows } = await pool.query(`SELECT image_path FROM project WHERE id=$1`, [req.params.id]);
  const { rows: fileRows } = await pool.query(`SELECT file_path FROM project_file WHERE project_id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM project WHERE id=$1`, [req.params.id]);
  rmUpload(IMAGE_DIR, projectRows[0]?.image_path);
  fileRows.forEach((file) => rmUpload(PROJECT_DIR, file.file_path));
  res.json({ ok: true });
}));

app.get('/api/projects/:id/export', asyncHandler(async (req, res) => {
  const [projectResult, parts, files, checklist, steps, docs, categories] = await Promise.all([
    pool.query(`SELECT * FROM project WHERE id=$1`, [req.params.id]),
    pool.query(
      `SELECT pp.id AS project_part_id, pp.quantity, p.*,
              c.id AS category_id, c.name AS category_name, parent.name AS parent_category_name
       FROM project_part pp
       JOIN part p ON p.id=pp.part_id
       LEFT JOIN category c ON c.id=p.category_id
       LEFT JOIN category parent ON parent.id=c.parent_id
       WHERE pp.project_id=$1
       ORDER BY p.name`,
      [req.params.id],
    ),
    pool.query(`SELECT * FROM project_file WHERE project_id=$1 ORDER BY file_category, uploaded_at DESC`, [req.params.id]),
    pool.query(`SELECT * FROM project_checklist_item WHERE project_id=$1 ORDER BY is_completed, order_index, id`, [req.params.id]),
    pool.query(
      `SELECT sd.*
       FROM project_step ps
       JOIN step_definition sd ON sd.id=ps.step_definition_id
       WHERE ps.project_id=$1
       ORDER BY sd.order_index, sd.name`,
      [req.params.id],
    ),
    pool.query(
      `SELECT pd.*, p.name AS part_name
       FROM project_part pp
       JOIN part p ON p.id=pp.part_id
       JOIN part_document pd ON pd.part_id=p.id
       WHERE pp.project_id=$1
       ORDER BY p.name, pd.is_primary DESC, pd.uploaded_at DESC`,
      [req.params.id],
    ),
    pool.query(`SELECT * FROM category ORDER BY parent_id NULLS FIRST, order_index, name`),
  ]);
  const project = projectResult.rows[0];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const categoryPathMap = buildCategoryPathMap(categories.rows);
  const latestFiles = files.rows.filter((file) => file.is_latest);
  const noteImages = extractImagePathsFromHtml(project.notes);
  const partRows = parts.rows.map((part) => {
    const categoryPath = categoryPathMap.get(part.category_id) || [];
    return {
      ...part,
      category_path: categoryPath,
      category_label: pathLabel(categoryPath),
      image_archive_path: part.image_path ? `part-images/${part.id}-${safeZipName(part.image_path)}` : null,
      documents: docs.rows
        .filter((doc) => doc.part_id === part.id)
        .map((doc) => ({
          id: doc.id,
          file_type: doc.file_type,
          file_path: doc.file_path,
          text_content: doc.text_content,
          original_filename: doc.original_filename,
          is_primary: doc.is_primary,
          uploaded_at: doc.uploaded_at,
          archive_path: doc.file_path ? `part-documents/${part.id}/${doc.id}-${safeZipName(doc.original_filename)}` : null,
        })),
    };
  });
  const manifest = {
    type: 'buildbook-web-project-export',
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    project: {
      name: project.name,
      status: project.status,
      notes: project.notes,
      image_path: project.image_path,
      image_archive_path: project.image_path ? `project-image/${safeZipName(project.image_path)}` : null,
    },
    note_images: noteImages.map((imagePath) => ({
      image_path: imagePath,
      archive_path: `note-images/${safeZipName(imagePath)}`,
    })),
    steps: steps.rows.map((step) => ({ name: step.name, order_index: step.order_index })),
    checklist: checklist.rows.map((item) => ({
      text: item.text,
      is_completed: item.is_completed,
      completed_at: item.completed_at,
      order_index: item.order_index,
    })),
    files: latestFiles.map((file) => ({
      id: file.id,
      original_filename: file.original_filename,
      file_type: file.file_type,
      tracker_key: file.tracker_key,
      file_category: file.file_category,
      version_note: file.version_note,
      is_latest: true,
      uploaded_at: file.uploaded_at,
      archive_path: `latest-files/${file.id}-${safeZipName(file.original_filename)}`,
    })),
    parts: partRows.map((part) => ({
      name: part.name,
      quantity: part.quantity || 1,
      category_path: part.category_path,
      category_label: part.category_label,
      product_url: part.product_url,
      storage_location: part.storage_location,
      notes: part.notes,
      spec_summary: part.spec_summary,
      image_archive_path: part.image_archive_path,
      documents: part.documents,
    })),
  };

  const summary = `<!doctype html>
<html><head><meta charset="utf-8"><title>${project.name}</title>
<style>body{font-family:Arial,sans-serif;line-height:1.5;max-width:980px;margin:32px auto;padding:0 18px;color:#222}h1,h2{line-height:1.2}.muted{color:#666}.box{border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}pre{white-space:pre-wrap;background:#f6f8fa;padding:12px;border-radius:6px}</style>
</head><body>
<h1>${project.name}</h1>
<p class="muted">Status: ${project.status} | Exported ${new Date().toLocaleString()}</p>
<h2>Step Tags</h2><p>${steps.rows.map((step) => step.name).join(', ') || 'None'}</p>
<h2>Notes</h2><div class="box">${project.notes || '<p>No notes.</p>'}</div>
<h2>Checklist</h2><ul>${checklist.rows.map((item) => `<li>${item.is_completed ? '[x]' : '[ ]'} ${item.text}${item.completed_at ? ` (${new Date(item.completed_at).toLocaleDateString()})` : ''}</li>`).join('') || '<li>No checklist items.</li>'}</ul>
<h2>Linked Parts</h2>${partRows.map((part) => `<div class="box"><strong>${part.name}</strong><br><span class="muted">Qty ${part.quantity || 1} | ${part.category_label} | ${part.storage_location || 'No location'}</span>${part.product_url ? `<br><a href="${part.product_url}">${part.product_url}</a>` : ''}<pre>${part.spec_summary || ''}</pre></div>`).join('') || '<p>No linked parts.</p>'}
<h2>Latest Files</h2><ul>${latestFiles.map((file) => `<li>${file.file_category}: ${file.original_filename}${file.version_note ? ` - ${file.version_note}` : ''}</li>`).join('') || '<li>No latest files.</li>'}</ul>
</body></html>`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeZipName(project.name)}-export.zip"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { throw err; });
  archive.pipe(res);
  archive.append(summary, { name: 'project-summary.html' });
  archive.append(stripHtml(project.notes || ''), { name: 'notes.txt' });
  archive.append(JSON.stringify(manifest, null, 2), { name: 'project-manifest.json' });
  archive.append(JSON.stringify(manifest, null, 2), { name: 'project-data.json' });

  if (project.image_path) {
    const source = path.join(IMAGE_DIR, project.image_path);
    if (fs.existsSync(source)) archive.file(source, { name: manifest.project.image_archive_path });
  }
  manifest.note_images.forEach((image) => {
    const source = path.join(IMAGE_DIR, image.image_path);
    if (fs.existsSync(source)) archive.file(source, { name: image.archive_path });
  });
  latestFiles.forEach((file) => {
    const source = path.join(PROJECT_DIR, file.file_path);
    if (fs.existsSync(source)) {
      const manifestFile = manifest.files.find((item) => item.id === file.id);
      archive.file(source, { name: manifestFile.archive_path });
    }
  });
  partRows.forEach((part) => {
    const info = [
      `Name: ${part.name}`,
      `Category: ${part.category_label}`,
      `Storage location: ${part.storage_location || ''}`,
      `Product URL: ${part.product_url || ''}`,
      `Created: ${part.created_at || ''}`,
      `Updated: ${part.updated_at || ''}`,
      '',
      'Spec Summary:',
      part.spec_summary || '',
      '',
      'Notes:',
      part.notes || '',
    ].join('\n');
    archive.append(info, { name: `part-info/${safeZipName(part.name)}/part-info.txt` });
    if (part.image_path && part.image_archive_path) {
      const source = path.join(IMAGE_DIR, part.image_path);
      if (fs.existsSync(source)) archive.file(source, { name: part.image_archive_path });
    }
    part.documents.forEach((doc) => {
      if (!doc.file_path || !doc.archive_path) return;
      const source = path.join(DOC_DIR, doc.file_path);
      if (fs.existsSync(source)) archive.file(source, { name: doc.archive_path });
    });
  });
  await archive.finalize();
}));

async function loadProjectManifest(zipPath) {
  const directory = await unzipper.Open.file(zipPath);
  const entry = directory.files.find((file) => file.path === 'project-manifest.json');
  if (!entry) throw new Error('This zip does not include a project manifest. Export it again with BuildBook_Web 0.2.1 or newer.');
  const manifest = JSON.parse((await entry.buffer()).toString('utf-8'));
  if (manifest.type !== 'buildbook-web-project-export') {
    throw new Error('This is not a BuildBook_Web project export.');
  }
  return { manifest, directory };
}

async function writeZipEntry(directory, archivePath, targetDir, originalFilename) {
  if (!archivePath) return null;
  const entry = directory.files.find((file) => file.path === archivePath);
  if (!entry) return null;
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName(originalFilename || path.basename(archivePath))}`;
  fs.writeFileSync(path.join(targetDir, filename), await entry.buffer());
  return filename;
}

async function uniqueProjectImportName(client, baseName) {
  const root = `${String(baseName || 'Imported Project').trim() || 'Imported Project'} (Imported)`;
  let candidate = root;
  let index = 2;
  while (true) {
    const { rows } = await client.query(`SELECT id FROM project WHERE lower(name)=lower($1) LIMIT 1`, [candidate]);
    if (!rows[0]) return candidate;
    candidate = `${root} ${index}`;
    index += 1;
  }
}

async function findExistingPartForImport(client, part) {
  if (part.product_url) {
    const { rows } = await client.query(`SELECT * FROM part WHERE product_url=$1 LIMIT 1`, [part.product_url]);
    if (rows[0]) return rows[0];
  }
  const { rows } = await client.query(`SELECT * FROM part WHERE lower(name)=lower($1) ORDER BY updated_at DESC LIMIT 1`, [part.name]);
  return rows[0] || null;
}

async function findOrCreateCategoryPath(client, categoryPath) {
  const parts = (Array.isArray(categoryPath) ? categoryPath : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!parts.length) return null;
  let parentId = null;
  let current = null;
  for (const name of parts) {
    const { rows } = await client.query(
      `SELECT * FROM category WHERE parent_id IS NOT DISTINCT FROM $1::int AND lower(name)=lower($2) LIMIT 1`,
      [parentId, name],
    );
    current = rows[0];
    if (!current) {
      const created = await client.query(
        `INSERT INTO category (name, parent_id, order_index)
         VALUES (
           $1,
           $2,
           COALESCE((SELECT MAX(order_index) + 10 FROM category WHERE parent_id IS NOT DISTINCT FROM $2::int), 10)
         ) RETURNING *`,
        [name, parentId],
      );
      current = created.rows[0];
    }
    parentId = current.id;
  }
  return current?.id || null;
}

async function resolveImportCategory(client, part, categoryMap = {}) {
  const label = part.category_label || pathLabel(part.category_path);
  const choice = categoryMap[label];
  if (choice === '__none__' || choice === '') return null;
  if (choice === '__create__') return findOrCreateCategoryPath(client, part.category_path);
  if (choice) return Number(choice);

  const localCategories = await getCategoryOptions(client);
  const { exact } = suggestCategoryForPath(label, localCategories);
  return exact?.id || null;
}

function rewriteImportedNoteImages(notes, noteImages, importedImageMap) {
  let next = String(notes || '');
  (noteImages || []).forEach((image) => {
    const imported = importedImageMap.get(image.archive_path);
    if (!imported) return;
    next = next.split(`/files/images/${image.image_path}`).join(`/files/images/${imported}`);
  });
  return next;
}

app.post('/api/projects/import/preview', uploadProjectImport.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Project export zip is required' });
  try {
    const { manifest } = await loadProjectManifest(req.file.path);
    const localCategories = await getCategoryOptions();
    const exportedCategoryLabels = [...new Set((manifest.parts || [])
      .map((part) => part.category_label || pathLabel(part.category_path))
      .filter((label) => label && label !== 'Uncategorized'))];

    const category_matches = exportedCategoryLabels.map((label) => {
      const { exact, suggested } = suggestCategoryForPath(label, localCategories);
      return {
        exported_category: label,
        exact_category_id: exact?.id || null,
        suggested_category_id: suggested?.id || null,
        needs_review: !exact,
      };
    });

    const parts = await Promise.all((manifest.parts || []).map(async (part) => ({
      name: part.name,
      category_label: part.category_label || pathLabel(part.category_path),
      product_url: part.product_url,
      document_count: (part.documents || []).length,
      existing_match: await findExistingPartForImport(pool, part),
    })));

    res.json({
      token: path.basename(req.file.filename),
      version: manifest.version,
      project: manifest.project,
      files: manifest.files || [],
      parts: parts.map((part) => ({
        ...part,
        existing_match: part.existing_match ? { id: part.existing_match.id, name: part.existing_match.name } : null,
      })),
      categories: localCategories.map((cat) => ({ id: cat.id, name: cat.name, label: cat.label })),
      category_matches,
    });
  } catch (e) {
    rmUpload(IMPORT_DIR, req.file.filename);
    throw e;
  }
}));

app.post('/api/projects/import/commit', asyncHandler(async (req, res) => {
  const { token, category_map } = req.body;
  if (!token) return res.status(400).json({ error: 'Import token is required' });
  const zipPath = path.join(IMPORT_DIR, path.basename(token));
  if (!fs.existsSync(zipPath)) return res.status(404).json({ error: 'Pending import was not found. Upload the zip again.' });

  const { manifest, directory } = await loadProjectManifest(zipPath);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const importedImageMap = new Map();
    for (const image of manifest.note_images || []) {
      const filename = await writeZipEntry(directory, image.archive_path, IMAGE_DIR, image.image_path);
      if (filename) importedImageMap.set(image.archive_path, filename);
    }
    const projectImage = await writeZipEntry(
      directory,
      manifest.project?.image_archive_path,
      IMAGE_DIR,
      manifest.project?.image_path || 'project-image',
    );
    const projectName = await uniqueProjectImportName(client, manifest.project?.name);
    const notes = rewriteImportedNoteImages(manifest.project?.notes, manifest.note_images, importedImageMap);
    const { rows: [project] } = await client.query(
      `INSERT INTO project (name, status, notes, image_path)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [projectName, manifest.project?.status || 'active', notes || null, projectImage],
    );

    for (const step of manifest.steps || []) {
      const { rows: [definition] } = await client.query(
        `INSERT INTO step_definition (name, order_index)
         VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET order_index=step_definition.order_index
         RETURNING *`,
        [step.name, step.order_index || 0],
      );
      await client.query(
        `INSERT INTO project_step (project_id, step_definition_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [project.id, definition.id],
      );
    }

    for (const item of manifest.checklist || []) {
      await client.query(
        `INSERT INTO project_checklist_item (project_id, text, is_completed, completed_at, order_index)
         VALUES ($1,$2,$3,$4,$5)`,
        [project.id, item.text, !!item.is_completed, item.completed_at || null, item.order_index || 0],
      );
    }

    for (const file of manifest.files || []) {
      const filename = await writeZipEntry(directory, file.archive_path, PROJECT_DIR, file.original_filename);
      if (!filename) continue;
      await client.query(
        `INSERT INTO project_file (project_id, file_path, original_filename, file_type, tracker_key, file_category, version_note, is_latest, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,COALESCE($8::timestamptz,NOW()))`,
        [project.id, filename, file.original_filename, file.file_type || guessFileTypeFromName(file.original_filename), file.tracker_key || null, file.file_category || 'Imported', file.version_note || null, file.uploaded_at || null],
      );
    }

    for (const importedPart of manifest.parts || []) {
      let part = await findExistingPartForImport(client, importedPart);
      if (!part) {
        const categoryId = await resolveImportCategory(client, importedPart, category_map || {});
        const partImage = await writeZipEntry(directory, importedPart.image_archive_path, IMAGE_DIR, `${importedPart.name}-image`);
        const { rows: [created] } = await client.query(
          `INSERT INTO part (name, category_id, product_url, storage_location, notes, spec_summary, image_path)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [
            importedPart.name,
            categoryId,
            importedPart.product_url || null,
            importedPart.storage_location || null,
            importedPart.notes || null,
            importedPart.spec_summary || null,
            partImage,
          ],
        );
        part = created;
      } else if (!part.image_path && importedPart.image_archive_path) {
        const partImage = await writeZipEntry(directory, importedPart.image_archive_path, IMAGE_DIR, `${importedPart.name}-image`);
        if (partImage) {
          const { rows: [updated] } = await client.query(
            `UPDATE part SET image_path=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
            [partImage, part.id],
          );
          part = updated;
        }
      }

      await client.query(
        `INSERT INTO project_part (project_id, part_id, quantity)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [project.id, part.id, importedPart.quantity || 1],
      );

      for (const doc of importedPart.documents || []) {
        if (!doc.archive_path) continue;
        const existingDoc = await client.query(
          `SELECT id FROM part_document WHERE part_id=$1 AND original_filename=$2 LIMIT 1`,
          [part.id, doc.original_filename],
        );
        if (existingDoc.rows[0]) continue;
        const docFile = await writeZipEntry(directory, doc.archive_path, DOC_DIR, doc.original_filename);
        await client.query(
          `INSERT INTO part_document (part_id, file_type, file_path, text_content, original_filename, is_primary, uploaded_at)
           VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,NOW()))`,
          [
            part.id,
            doc.file_type || guessFileTypeFromName(doc.original_filename),
            docFile,
            doc.text_content || null,
            doc.original_filename,
            !!doc.is_primary,
            doc.uploaded_at || null,
          ],
        );
      }
    }

    await client.query('COMMIT');
    rmUpload(IMPORT_DIR, path.basename(token));
    res.json({ ok: true, project });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/projects/:id/image', uploadImage.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const { rows: current } = await pool.query(`SELECT image_path FROM project WHERE id=$1`, [req.params.id]);
  const { rows } = await pool.query(
    `UPDATE project SET image_path=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [req.file.filename, req.params.id],
  );
  rmUpload(IMAGE_DIR, current[0]?.image_path);
  res.json(rows[0]);
}));

app.delete('/api/projects/:id/image', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT image_path FROM project WHERE id=$1`, [req.params.id]);
  await pool.query(`UPDATE project SET image_path=NULL, updated_at=NOW() WHERE id=$1`, [req.params.id]);
  rmUpload(IMAGE_DIR, rows[0]?.image_path);
  res.json({ ok: true });
}));

app.post('/api/projects/:id/note-images', uploadImage.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  await pool.query(`UPDATE project SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json({
    image_path: req.file.filename,
    url: `/files/images/${req.file.filename}`,
  });
}));

app.post('/api/projects/:id/parts', asyncHandler(async (req, res) => {
  const { part_id } = req.body;
  if (!part_id) return res.status(400).json({ error: 'Part is required' });
  const { rows } = await pool.query(
    `INSERT INTO project_part (project_id, part_id, quantity)
     VALUES ($1,$2,1)
     ON CONFLICT (project_id, part_id) DO UPDATE SET added_at=project_part.added_at
     RETURNING *`,
    [req.params.id, part_id],
  );
  await pool.query(`UPDATE project SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json(rows[0]);
}));

app.put('/api/project-parts/:id', asyncHandler(async (req, res) => {
  const quantity = Math.max(1, Number.parseInt(req.body.quantity, 10) || 1);
  const { rows } = await pool.query(
    `UPDATE project_part SET quantity=$1 WHERE id=$2 RETURNING *`,
    [quantity, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project part not found' });
  res.json(rows[0]);
}));

app.delete('/api/project-parts/:id', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM project_part WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.post('/api/projects/:id/files', uploadProject.array('files'), asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'File is required' });
  const { tracker_key, file_category, version_note } = req.body;
  const template = await getProjectTemplate();
  const tracker = template.file_trackers.find((item) => item.key === tracker_key);
  const allowed = normalizeExtensions(tracker?.extensions);
  for (const file of files) {
    const uploadedExt = path.extname(file.originalname).toLowerCase();
    if (allowed.length && !allowed.includes(uploadedExt)) {
      files.forEach((uploaded) => rmUpload(PROJECT_DIR, uploaded.filename));
      return res.status(400).json({ error: `This tracker only accepts ${allowed.join(', ')} files.` });
    }
  }

  const category = tracker ? trackerDisplayName(tracker) : (file_category || 'Other');
  await pool.query(
    `UPDATE project_file
     SET is_latest=FALSE
     WHERE project_id=$1 AND COALESCE(tracker_key, file_category)=COALESCE($2, $3)`,
    [req.params.id, tracker?.key || null, category],
  );
  const relativePaths = (() => {
    try { return JSON.parse(req.body.relative_paths || '[]'); } catch { return []; }
  })();
  const rows = [];
  for (const [index, file] of files.entries()) {
    const originalName = String(relativePaths[index] || file.originalname).replace(/\\/g, '/');
    const inserted = await pool.query(
      `INSERT INTO project_file (project_id, file_path, original_filename, file_type, tracker_key, file_category, version_note, is_latest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING *`,
      [req.params.id, file.filename, originalName, guessFileType(file), tracker?.key || null, category, version_note || null],
    );
    rows.push(inserted.rows[0]);
  }
  await pool.query(`UPDATE project SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json(files.length === 1 ? rows[0] : rows);
}));

app.get('/api/project-files/:id/download', asyncHandler(async (req, res) => {
  const { rows: [file] } = await pool.query(`SELECT * FROM project_file WHERE id=$1`, [req.params.id]);
  if (!file) return res.status(404).json({ error: 'File not found' });
  const source = path.join(PROJECT_DIR, file.file_path);
  if (!fs.existsSync(source)) return res.status(404).json({ error: 'File missing on disk' });
  const ext = path.extname(file.original_filename).toLowerCase();
  const base = safeZipName(path.basename(file.original_filename, ext));
  if (ext === '.ino') {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);
    archive.file(source, { name: `${base}/${base}.ino` });
    await archive.finalize();
    return;
  }
  res.download(source, path.basename(file.original_filename));
}));

app.delete('/api/project-files/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT file_path FROM project_file WHERE id=$1`, [req.params.id]);
  await pool.query(`DELETE FROM project_file WHERE id=$1`, [req.params.id]);
  rmUpload(PROJECT_DIR, rows[0]?.file_path);
  res.json({ ok: true });
}));

app.put('/api/project-files/:id/latest', asyncHandler(async (req, res) => {
  const { is_latest } = req.body;
  if (is_latest) {
    const { rows: current } = await pool.query(`SELECT * FROM project_file WHERE id=$1`, [req.params.id]);
    if (current[0]) {
      await pool.query(
        `UPDATE project_file
         SET is_latest=FALSE
         WHERE project_id=$1 AND id<>$2 AND COALESCE(tracker_key, file_category)=COALESCE($3, $4)`,
        [current[0].project_id, req.params.id, current[0].tracker_key || null, current[0].file_category],
      );
    }
  }
  const { rows } = await pool.query(
    `UPDATE project_file SET is_latest=$1 WHERE id=$2 RETURNING *`,
    [!!is_latest, req.params.id],
  );
  res.json(rows[0]);
}));

app.post('/api/projects/:id/checklist', asyncHandler(async (req, res) => {
  const { text, order_index } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Checklist text is required' });
  const { rows } = await pool.query(
    `INSERT INTO project_checklist_item (project_id, text, order_index)
     VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, text.trim(), order_index ?? 0],
  );
  res.json(rows[0]);
}));

app.put('/api/checklist/:id', asyncHandler(async (req, res) => {
  const { text, is_completed, order_index } = req.body;
  const { rows } = await pool.query(
    `UPDATE project_checklist_item
     SET text=COALESCE($1,text),
         is_completed=COALESCE($2,is_completed),
         completed_at=CASE
           WHEN $2::boolean IS TRUE AND is_completed IS FALSE THEN NOW()
           WHEN $2::boolean IS FALSE THEN NULL
           ELSE completed_at
         END,
         order_index=COALESCE($3,order_index)
     WHERE id=$4 RETURNING *`,
    [text ?? null, is_completed ?? null, order_index ?? null, req.params.id],
  );
  res.json(rows[0]);
}));

app.delete('/api/checklist/:id', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM project_checklist_item WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/step-definitions', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM step_definition ORDER BY order_index, name`);
  res.json(rows);
}));

app.post('/api/projects/:id/steps', asyncHandler(async (req, res) => {
  const { step_definition_id } = req.body;
  if (!step_definition_id) return res.status(400).json({ error: 'Step is required' });
  const { rows } = await pool.query(
    `INSERT INTO project_step (project_id, step_definition_id)
     VALUES ($1,$2)
     ON CONFLICT (project_id, step_definition_id) DO NOTHING
     RETURNING *`,
    [req.params.id, step_definition_id],
  );
  await pool.query(`UPDATE project SET updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json(rows[0] || { project_id: Number(req.params.id), step_definition_id });
}));

app.delete('/api/projects/:projectId/steps/:stepId', asyncHandler(async (req, res) => {
  await pool.query(
    `DELETE FROM project_step WHERE project_id=$1 AND step_definition_id=$2`,
    [req.params.projectId, req.params.stepId],
  );
  await pool.query(`UPDATE project SET updated_at=NOW() WHERE id=$1`, [req.params.projectId]);
  res.json({ ok: true });
}));

// Import batches and draft review
app.get('/api/imports', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*,
           COUNT(i.id)::int AS item_count,
           COUNT(i.id) FILTER (WHERE i.status='draft')::int AS draft_count,
           COUNT(i.id) FILTER (WHERE i.status='promoted')::int AS promoted_count,
           COUNT(i.id) FILTER (WHERE i.status='merged')::int AS merged_count,
           COUNT(i.id) FILTER (WHERE i.status='skipped')::int AS skipped_count
    FROM import_batch b
    LEFT JOIN import_item i ON i.import_batch_id=b.id
    GROUP BY b.id
    ORDER BY b.imported_at DESC
  `);
  res.json(rows);
}));

app.post('/api/imports/upload', uploadCsv.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
  const records = parse(req.file.buffer.toString('utf-8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [batch] } = await client.query(
      `INSERT INTO import_batch (source, original_filename) VALUES ('csv',$1) RETURNING *`,
      [req.file.originalname],
    );
    const items = [];
    for (const record of records) {
      const item = {
        raw_name: firstPresent(record, ['Title', 'Name', 'Item', 'Product Name'], Object.values(record)[0] || 'Imported part'),
        product_url: firstPresent(record, ['Product Url', 'Product URL', 'URL', 'Link'], ''),
        product_image_url: firstPresent(record, ['Product Image Url', 'Product Image URL', 'Image Url', 'Image URL'], ''),
        attributes: firstPresent(record, ['Attributes', 'Variation', 'Options'], ''),
        store: firstPresent(record, ['Store Name', 'Store', 'Seller'], ''),
        ordered_at: cleanDate(firstPresent(record, ['Order Date', 'Date'], '')),
      };
      const suggested = await findSuggestedPart(client, item);
      const { rows } = await client.query(
        `INSERT INTO import_item
         (import_batch_id, raw_name, product_url, product_image_url, attributes, store, ordered_at, suggested_part_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [batch.id, item.raw_name, item.product_url || null, item.product_image_url || null, item.attributes || null, item.store || null, item.ordered_at, suggested],
      );
      items.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json({ ...batch, items });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/imports/digikey-pdf', uploadCsv.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Digi-Key PDF is required' });
  const parsed = await pdfParse(req.file.buffer);
  const items = parseDigiKeyInvoiceText(parsed.text || '');
  if (!items.length) {
    return res.status(400).json({ error: 'No Digi-Key line items were found in this PDF.' });
  }

  for (const item of items) {
    item.product_image_url = await findDigiKeyImage(item.lookup_part);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [batch] } = await client.query(
      `INSERT INTO import_batch (source, original_filename) VALUES ('digikey_pdf',$1) RETURNING *`,
      [req.file.originalname],
    );
    const inserted = [];
    for (const item of items) {
      const suggested = await findSuggestedPart(client, item);
      const { rows } = await client.query(
        `INSERT INTO import_item
         (import_batch_id, raw_name, product_url, product_image_url, attributes, store, ordered_at, suggested_part_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          batch.id,
          item.raw_name,
          item.product_url || null,
          item.product_image_url || null,
          item.attributes || null,
          item.store || null,
          item.ordered_at,
          suggested,
        ],
      );
      inserted.push(rows[0]);
    }
    await client.query('COMMIT');
    res.json({ ...batch, items: inserted });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.get('/api/imports/:id', asyncHandler(async (req, res) => {
  const [batch, items] = await Promise.all([
    pool.query(`SELECT * FROM import_batch WHERE id=$1`, [req.params.id]),
    pool.query(
      `SELECT i.*,
              sp.name AS suggested_part_name,
              rp.name AS resolved_part_name
       FROM import_item i
       LEFT JOIN part sp ON sp.id=i.suggested_part_id
       LEFT JOIN part rp ON rp.id=i.resolved_part_id
       WHERE i.import_batch_id=$1
       ORDER BY i.id`,
      [req.params.id],
    ),
  ]);
  if (!batch.rows[0]) return res.status(404).json({ error: 'Import batch not found' });
  res.json({ ...batch.rows[0], items: items.rows });
}));

app.post('/api/import-items/:id/find-image', asyncHandler(async (req, res) => {
  const { rows: [item] } = await pool.query(`SELECT * FROM import_item WHERE id=$1`, [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Import item not found' });
  if (item.product_image_url) return res.json({ ok: true, found: false, image_url: item.product_image_url, item });

  const imageUrl = await findWebImageForImportItem(item);
  if (!imageUrl) return res.json({ ok: true, found: false, image_url: null, item });

  const { rows: [updated] } = await pool.query(
    `UPDATE import_item SET product_image_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [imageUrl, item.id],
  );
  res.json({ ok: true, found: true, image_url: imageUrl, item: updated });
}));

app.post('/api/imports/:id/find-missing-images', asyncHandler(async (req, res) => {
  const params = [];
  let where = `(product_image_url IS NULL OR product_image_url = '') AND status='draft'`;
  if (req.params.id !== 'all') {
    params.push(req.params.id);
    where += ` AND import_batch_id=$${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM import_item WHERE ${where} ORDER BY id`,
    params,
  );

  let found = 0;
  let failed = 0;
  const items = [];
  for (const item of rows) {
    const imageUrl = await findWebImageForImportItem(item);
    if (!imageUrl) {
      failed += 1;
      items.push({ id: item.id, found: false, image_url: null });
      continue;
    }
    await pool.query(
      `UPDATE import_item SET product_image_url=$1, updated_at=NOW() WHERE id=$2`,
      [imageUrl, item.id],
    );
    found += 1;
    items.push({ id: item.id, found: true, image_url: imageUrl });
  }
  res.json({ ok: true, checked: rows.length, found, failed, items });
}));

app.post('/api/import-items/:id/promote', asyncHandler(async (req, res) => {
  const { category_id, name, notes, spec_summary, storage_location } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [item] } = await client.query(`SELECT * FROM import_item WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Import item not found' });
    }
    const { rows: [part] } = await client.query(
      `INSERT INTO part (name, category_id, product_url, notes, spec_summary, storage_location)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        (name || item.raw_name).trim(),
        category_id || null,
        item.product_url || null,
        notes || item.attributes || null,
        spec_summary || null,
        storage_location || null,
      ],
    );
    await client.query(
      `UPDATE import_item
       SET status='promoted', resolved_part_id=$1, updated_at=NOW()
       WHERE id=$2`,
      [part.id, item.id],
    );
    await client.query('COMMIT');
    const imagePath = await attachImportImageToPart(part.id, item.product_image_url);
    res.json({ ...part, image_path: imagePath || part.image_path });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.post('/api/import-items/:id/merge', asyncHandler(async (req, res) => {
  const { part_id } = req.body;
  if (!part_id) return res.status(400).json({ error: 'Part is required' });
  const { rows } = await pool.query(
    `UPDATE import_item
     SET status='merged', resolved_part_id=$1, updated_at=NOW()
     WHERE id=$2 RETURNING *`,
    [part_id, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Import item not found' });
  const imagePath = await attachImportImageToPart(part_id, rows[0].product_image_url);
  res.json({ ...rows[0], image_path: imagePath });
}));

app.post('/api/imports/:id/backfill-images', asyncHandler(async (req, res) => {
  const params = [];
  let where = `
    i.resolved_part_id IS NOT NULL
    AND i.product_image_url IS NOT NULL
    AND i.product_image_url <> ''
    AND p.image_path IS NULL
  `;
  if (req.params.id !== 'all') {
    params.push(req.params.id);
    where += ` AND i.import_batch_id=$${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT i.id, i.product_image_url, i.resolved_part_id
     FROM import_item i
     JOIN part p ON p.id=i.resolved_part_id
     WHERE ${where}
     ORDER BY i.id`,
    params,
  );

  let downloaded = 0;
  let failed = 0;
  for (const row of rows) {
    const imagePath = await attachImportImageToPart(row.resolved_part_id, row.product_image_url);
    if (imagePath) downloaded += 1;
    else failed += 1;
  }
  res.json({ ok: true, checked: rows.length, downloaded, failed });
}));

app.post('/api/import-items/:id/skip', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE import_item SET status='skipped', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Import item not found' });
  res.json(rows[0]);
}));

app.delete('/api/imports/:id', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM import_batch WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

const BACKUP_TABLES = [
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
const BACKUP_WIPE_ORDER = [
  'import_item',
  'import_batch',
  'project_step',
  'project_checklist_item',
  'project_file',
  'project_part',
  'project',
  'step_definition',
  'part_document',
  'part',
  'category',
];
const BACKUP_SEQ_TABLES = [
  'import_item',
  'import_batch',
  'project_checklist_item',
  'project_file',
  'project_part',
  'project',
  'step_definition',
  'part_document',
  'part',
  'category',
];

async function buildBackupData() {
  const tables = [
    ...BACKUP_TABLES,
  ];
  const backupOrderBy = {
    app_metadata: 'key',
    project_step: 'project_id, step_definition_id',
  };
  const data = {
    type: 'buildbook-web-backup',
    version: 3,
    app_version: APP_VERSION,
    exported_at: new Date().toISOString(),
    includes_uploads: true,
  };
  for (const table of tables) {
    const where = table === 'app_metadata' ? ` WHERE key <> 'schema_version'` : '';
    const orderBy = backupOrderBy[table] || 'id';
    const { rows } = await pool.query(`SELECT * FROM ${table}${where} ORDER BY ${orderBy}`);
    data[table] = rows;
  }
  return data;
}

function addUploadDirToArchive(archive, dir, archiveRoot) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const source = path.join(dir, entry.name);
    const archivePath = `${archiveRoot}/${entry.name}`;
    if (entry.isDirectory()) addUploadDirToArchive(archive, source, archivePath);
    else if (entry.isFile()) archive.file(source, { name: archivePath });
  });
}

function emptyUploadDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
    else fs.rmSync(target, { force: true });
  });
}

async function restoreBackupData(client, data) {
  if (data.type !== 'buildbook-web-backup' || ![2, 3].includes(data.version)) {
    throw new Error('Not a BuildBook_Web backup file');
  }
  for (const table of BACKUP_WIPE_ORDER) await client.query(`DELETE FROM ${table}`);
  await client.query(`DELETE FROM app_metadata WHERE key <> 'schema_version'`);

  const insertRows = async (table, rows) => {
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    for (const row of rows) {
      const values = cols.map((col) => row[col]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      await client.query(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`,
        values,
      );
    }
  };

  if (Array.isArray(data.app_metadata)) {
    for (const row of data.app_metadata) {
      await setJsonSetting(client, row.key, row.value);
    }
  }
  for (const table of BACKUP_WIPE_ORDER.slice().reverse()) await insertRows(table, data[table]);

  for (const table of BACKUP_SEQ_TABLES) {
    await client.query(`SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE(MAX(id),0)+1, false) FROM ${table}`);
  }
}

function restoreUploadsFromZip(directory) {
  [DOC_DIR, PROJECT_DIR, IMAGE_DIR, IMPORT_DIR].forEach(emptyUploadDir);
  const uploadRoots = new Set(['documents', 'projects', 'images', 'imports']);
  return Promise.all(directory.files
    .filter((file) => file.path.startsWith('uploads/') && file.type !== 'Directory')
    .map(async (file) => {
      const parts = file.path.split('/').filter(Boolean);
      const root = parts[1];
      if (!uploadRoots.has(root) || parts.length < 3) return;
      const relative = parts.slice(2).join('/');
      const targetRoot = path.join(UPLOAD_DIR, root);
      const target = path.resolve(targetRoot, relative);
      if (!target.startsWith(path.resolve(targetRoot) + path.sep)) return;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await file.buffer());
    }));
}

// Settings: full portable backup and restore.
app.get('/api/settings/backup', asyncHandler(async (req, res) => {
  const data = await buildBackupData();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="buildbook-web-backup-${Date.now()}.zip"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { throw err; });
  archive.pipe(res);
  archive.append(JSON.stringify(data, null, 2), { name: 'backup.json' });
  addUploadDirToArchive(archive, DOC_DIR, 'uploads/documents');
  addUploadDirToArchive(archive, PROJECT_DIR, 'uploads/projects');
  addUploadDirToArchive(archive, IMAGE_DIR, 'uploads/images');
  addUploadDirToArchive(archive, IMPORT_DIR, 'uploads/imports');
  await archive.finalize();
}));

app.post('/api/settings/restore', uploadBackup.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Backup file is required' });
  let data;
  let directory = null;
  const isZip = req.file.originalname?.toLowerCase().endsWith('.zip') || req.file.mimetype === 'application/zip';
  if (isZip) {
    directory = await unzipper.Open.file(req.file.path);
    const backupEntry = directory.files.find((file) => file.path === 'backup.json');
    if (!backupEntry) return res.status(400).json({ error: 'This backup zip does not include backup.json.' });
    data = JSON.parse((await backupEntry.buffer()).toString('utf-8'));
  } else {
    data = JSON.parse(fs.readFileSync(req.file.path, 'utf-8'));
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await restoreBackupData(client, data);
    if (directory) await restoreUploadsFromZip(directory);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    rmUpload(BACKUP_DIR, req.file.filename);
  }
}));

app.get('/api/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

await ensureRuntimeSchema();
app.listen(PORT, () => console.log(`BuildBook_Web backend on :${PORT}`));
