import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

function statusBadge(status) {
  if (status === 'draft') return 'badge-yellow';
  if (status === 'promoted') return 'badge-green';
  if (status === 'merged') return 'badge-blue';
  return 'badge-gray';
}

const CATEGORY_KEYWORDS = [
  { name: 'Resistors', words: ['resistor', 'resistance', 'ohm', 'kohm', 'mohm', 'trimmer', 'potentiometer'] },
  { name: 'Capacitors', words: ['capacitor', 'cap ', 'uf', 'nf', 'pf', 'electrolytic', 'ceramic capacitor', 'tantalum'] },
  { name: 'LEDs & Displays', words: ['led', 'display', 'oled', 'lcd', 'tft', 'segment', 'pixel', 'matrix'] },
  { name: 'Sensors', words: ['sensor', 'thermistor', 'temperature', 'humidity', 'imu', 'accelerometer', 'gyro', 'camera', 'encoder', 'ultrasonic', 'hall'] },
  { name: 'Microcontrollers & Development Boards', words: ['arduino', 'esp32', 'esp8266', 'raspberry', 'pico', 'development board', 'microcontroller', 'mcu', 'stm32', 'atmega'] },
  { name: 'Modules', words: ['module', 'breakout', 'bluetooth', 'wifi', 'rf ', 'rfid', 'nfc', 'level shifter', 'adc module'] },
  { name: 'Power', words: ['voltage', 'regulator', 'converter', 'buck', 'boost', 'charger', 'battery', 'power', 'supply', 'bms', 'ldo'] },
  { name: 'Connectors & Wiring', words: ['connector', 'terminal', 'term blk', 'header', 'socket', 'plug', 'jack', 'cable', 'wire', 'wiring', 'jst', 'dupont', 'usb'] },
  { name: 'Switches & Relays', words: ['switch', 'relay', 'button', 'tact', 'toggle', 'dip switch'] },
  { name: 'Mechanical & Hardware', words: ['screw', 'nut', 'bolt', 'standoff', 'spacer', 'bracket', 'enclosure', 'bearing', 'washer'] },
  { name: 'Motors & Motion', words: ['motor', 'servo', 'stepper', 'actuator', 'gear', 'motion'] },
  { name: 'Prototyping & Tools', words: ['breadboard', 'perfboard', 'solder', 'flux', 'tool', 'iron', 'prototype', 'jumper'] },
  { name: 'Optics & Physics', words: ['lens', 'laser', 'optic', 'mirror', 'prism', 'physics'] },
];

function categoryLabel(category, categories) {
  const parent = categories.find((cat) => cat.id === category.parent_id);
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

function suggestCategoryId(item, categories) {
  const text = `${item.raw_name || ''} ${item.attributes || ''}`.toLowerCase();
  let best = null;
  for (const category of categories) {
    let score = 0;
    const name = category.name.toLowerCase();
    if (text.includes(name)) score += 8;
    for (const group of CATEGORY_KEYWORDS) {
      const groupName = group.name.toLowerCase();
      const parent = categories.find((cat) => cat.id === category.parent_id);
      const matchesCategory = name === groupName || parent?.name.toLowerCase() === groupName;
      if (!matchesCategory) continue;
      group.words.forEach((word) => {
        if (text.includes(word)) score += 2;
      });
    }
    if (score > 0 && (!best || score > best.score)) best = { id: category.id, score };
  }
  return best?.id || '';
}

export default function Imports() {
  const [imports, setImports] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [file, setFile] = useState(null);
  const [digikeyFile, setDigikeyFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingDigikey, setUploadingDigikey] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => setImports(await api.getImports());
  const loadSelected = useCallback(async () => {
    if (selectedId) setSelected(await api.getImport(selectedId));
  }, [selectedId]);

  useEffect(() => { load(); }, []);
  useEffect(() => { loadSelected(); }, [loadSelected]);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('file', file);
      const batch = await api.uploadImportCsv(form);
      setFile(null);
      await load();
      setSelectedId(batch.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  };

  const uploadDigiKey = async () => {
    if (!digikeyFile) return;
    setUploadingDigikey(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('file', digikeyFile);
      const batch = await api.uploadDigiKeyPdf(form);
      setDigikeyFile(null);
      setMsg(`Imported ${batch.items.length} Digi-Key draft item(s).`);
      await load();
      setSelectedId(batch.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setUploadingDigikey(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([load(), loadSelected()]);
  };

  const backfillImages = async () => {
    setBackfilling(true);
    setErr('');
    setMsg('');
    try {
      const result = await api.backfillImportImages(selectedId || 'all');
      setMsg(`Downloaded ${result.downloaded} image(s). ${result.failed ? `${result.failed} could not be downloaded.` : ''}`);
      await refreshAll();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Imports</h1>
          <p className="page-subtitle">Turn online order exports into draft parts for the library.</p>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <section className="card upload-card">
        <div>
          <h3>Import CSV</h3>
          <p className="muted">AliExpress-style exports work well. Quantity columns are ignored. Product images are saved locally when drafts are promoted or merged.</p>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0])} />
        <button className="btn btn-primary" disabled={!file || uploading} onClick={upload}>
          {uploading ? 'Importing...' : 'Import Drafts'}
        </button>
        <button className="btn btn-secondary" disabled={backfilling} onClick={backfillImages}>
          {backfilling ? 'Downloading...' : 'Backfill Images'}
        </button>
      </section>

      <section className="card upload-card">
        <div>
          <h3>Import Digi-Key PDF</h3>
          <p className="muted">Upload a Digi-Key order or invoice PDF to create draft parts. Digi-Key part links and image lookups are added when found.</p>
        </div>
        <input type="file" accept=".pdf,application/pdf" onChange={(e) => setDigikeyFile(e.target.files[0])} />
        <button className="btn btn-primary" disabled={!digikeyFile || uploadingDigikey} onClick={uploadDigiKey}>
          {uploadingDigikey ? 'Importing...' : 'Import Digi-Key PDF'}
        </button>
      </section>

      <div className="imports-layout">
        <aside className="library-sidebar">
          <h3>Batches</h3>
          {imports.length === 0 ? <p className="muted">No imports yet.</p> : imports.map((batch) => (
            <button
              key={batch.id}
              className={`import-row ${selectedId === batch.id ? 'active' : ''}`}
              onClick={() => setSelectedId(batch.id)}
            >
              <strong>{batch.original_filename || `Batch ${batch.id}`}</strong>
              <span>{new Date(batch.imported_at).toLocaleDateString()}</span>
              <small>{batch.draft_count} draft / {batch.item_count} total</small>
            </button>
          ))}
        </aside>
        <section>
          {!selectedId ? <div className="empty">Select an import batch.</div> :
            !selected ? <div className="loading">Loading...</div> :
              <BatchReview batch={selected} onChanged={refreshAll} />
          }
        </section>
      </div>
    </div>
  );
}

function BatchReview({ batch, onChanged }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [categories, setCategories] = useState([]);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const groups = useMemo(() => ({
    draft: batch.items.filter((item) => item.status === 'draft'),
    done: batch.items.filter((item) => item.status !== 'draft'),
  }), [batch.items]);
  const categoryOptions = useMemo(() => [...categories].sort((a, b) => categoryLabel(a, categories).localeCompare(categoryLabel(b, categories))), [categories]);
  const selectedDraftItems = useMemo(
    () => groups.draft.filter((item) => selectedIds.has(item.id)),
    [groups.draft, selectedIds],
  );

  useEffect(() => { api.getCategories().then(setCategories); }, []);
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkCategoryId('');
    setMsg('');
    setErr('');
  }, [batch.id]);

  const toggleSelected = (id, checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllDrafts = () => setSelectedIds(new Set(groups.draft.map((item) => item.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const createSelected = async () => {
    if (!selectedDraftItems.length) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      for (const item of selectedDraftItems) {
        const category_id = bulkCategoryId || suggestCategoryId(item, categories) || null;
        await api.promoteImportItem(item.id, {
          name: item.raw_name,
          category_id,
          storage_location: '',
          notes: item.attributes || '',
          spec_summary: '',
        });
      }
      setMsg(`Created ${selectedDraftItems.length} part(s).`);
      clearSelection();
      await onChanged();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const skipSelected = async () => {
    if (!selectedDraftItems.length) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      for (const item of selectedDraftItems) {
        await api.skipImportItem(item.id);
      }
      setMsg(`Skipped ${selectedDraftItems.length} draft item(s).`);
      clearSelection();
      await onChanged();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // TODO(post-MVP): restore missing-image search after improving result accuracy.

  return (
    <div>
      <div className="card batch-header">
        <div>
          <h2>{batch.original_filename || `Import ${batch.id}`}</h2>
          <p className="muted">{batch.items.length} items imported on {new Date(batch.imported_at).toLocaleString()}</p>
        </div>
        <div className="status-counts">
          <span>{groups.draft.length} draft</span>
          <span>{groups.done.length} resolved</span>
        </div>
      </div>

      {groups.draft.length === 0 && <div className="alert alert-success">All draft items in this batch are resolved.</div>}
      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}
      {groups.draft.length > 0 && (
        <div className="card bulk-import-toolbar">
          <div>
            <strong>{selectedDraftItems.length} selected</strong>
            <p className="muted">Create several straightforward imports at once, or skip the ones you do not want in the library.</p>
          </div>
          <select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
            <option value="">Use auto category</option>
            {categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{categoryLabel(cat, categories)}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={selectAllDrafts}>Select Drafts</button>
          <button className="btn btn-secondary btn-sm" onClick={clearSelection}>Clear</button>
          <button className="btn btn-primary btn-sm" disabled={!selectedDraftItems.length || busy} onClick={createSelected}>
            {busy ? 'Working...' : 'Create Selected'}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!selectedDraftItems.length || busy} onClick={skipSelected}>Skip Selected</button>
        </div>
      )}

      <div className="import-grid">
        {batch.items.map((item) => (
          <ImportItemCard
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onSelectedChange={toggleSelected}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

function ImportItemCard({ item, selected, onSelectedChange, onChanged }) {
  const [mode, setMode] = useState('review');
  const [categories, setCategories] = useState([]);
  const [parts, setParts] = useState([]);
  const [partSearch, setPartSearch] = useState('');
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', parent_id: '' });
  const [categoryErr, setCategoryErr] = useState('');
  const [autoCategoryId, setAutoCategoryId] = useState('');
  const [form, setForm] = useState({
    name: item.raw_name,
    category_id: '',
    storage_location: '',
    notes: item.attributes || '',
    spec_summary: '',
  });
  const disabled = item.status !== 'draft';
  const categoryOptions = useMemo(() => [...categories].sort((a, b) => categoryLabel(a, categories).localeCompare(categoryLabel(b, categories))), [categories]);

  useEffect(() => { api.getCategories().then(setCategories); }, []);
  useEffect(() => {
    if (!categories.length || form.category_id) return;
    const suggested = suggestCategoryId(item, categories);
    if (suggested) {
      setAutoCategoryId(suggested);
      setForm((p) => ({ ...p, category_id: String(suggested) }));
    }
  }, [categories, form.category_id, item]);
  useEffect(() => {
    const timer = setTimeout(async () => {
      setParts(await api.getParts({ search: partSearch || item.raw_name.slice(0, 40) }));
    }, 200);
    return () => clearTimeout(timer);
  }, [partSearch, item.raw_name]);

  const promote = async () => {
    await api.promoteImportItem(item.id, { ...form, category_id: form.category_id || null });
    onChanged();
  };

  const merge = async (partId) => {
    await api.mergeImportItem(item.id, { part_id: partId });
    onChanged();
  };

  const skip = async () => {
    await api.skipImportItem(item.id);
    onChanged();
  };

  // TODO(post-MVP): restore per-item image search after improving result accuracy.

  const createCategory = async () => {
    if (!newCategory.name.trim()) {
      setCategoryErr('Category name is required');
      return;
    }
    try {
      setCategoryErr('');
      const created = await api.createCategory({
        name: newCategory.name.trim(),
        parent_id: newCategory.parent_id || null,
      });
      const nextCategories = await api.getCategories();
      setCategories(nextCategories);
      setForm((p) => ({ ...p, category_id: String(created.id) }));
      setNewCategory({ name: '', parent_id: '' });
      setCategoryCreatorOpen(false);
    } catch (e) {
      setCategoryErr(e.message);
    }
  };

  return (
    <div className={`import-card ${disabled ? 'resolved' : ''}`}>
      <div className="import-card-top">
        {item.status === 'draft' && (
          <input
            className="import-select"
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectedChange(item.id, e.target.checked)}
            aria-label={`Select ${item.raw_name}`}
          />
        )}
        {item.product_image_url ? <img src={item.product_image_url} alt="" /> : <div className="import-image-placeholder" />}
        <div>
          <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
          <h3>{item.raw_name}</h3>
          {item.attributes && <p>{item.attributes}</p>}
          <div className="mini-meta">
            {item.store && <span>{item.store}</span>}
            {item.ordered_at && <span>{item.ordered_at}</span>}
            {item.product_url && <a href={item.product_url} target="_blank" rel="noreferrer">Product link</a>}
          </div>
        </div>
      </div>

      {item.suggested_part_name && item.status === 'draft' && (
        <div className="suggestion-box">
          Suggested match: <strong>{item.suggested_part_name}</strong>
          <button className="btn btn-secondary btn-sm" onClick={() => merge(item.suggested_part_id)}>Merge</button>
        </div>
      )}
      {item.status !== 'draft' ? (
        <p className="muted">Resolved as {item.resolved_part_name || item.status}.</p>
      ) : mode === 'review' ? (
        <div className="button-row">
          <button className="btn btn-primary btn-sm" onClick={() => setMode('promote')}>Create Part</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setMode('merge')}>Merge</button>
          <button className="btn btn-secondary btn-sm" onClick={skip}>Skip</button>
        </div>
      ) : mode === 'promote' ? (
        <div className="inline-form">
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <div className="category-picker-block">
            <div className="category-picker-row">
              <select value={form.category_id} onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}>
                <option value="">Uncategorized</option>
                {categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{categoryLabel(cat, categories)}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" onClick={() => setCategoryCreatorOpen((open) => !open)}>
                {categoryCreatorOpen ? 'Cancel Category' : 'New Category'}
              </button>
            </div>
            {autoCategoryId && String(autoCategoryId) === String(form.category_id) && (
              <small className="muted">Auto-selected from imported part name.</small>
            )}
            {categoryCreatorOpen && (
              <div className="category-create-box">
                {categoryErr && <div className="alert alert-error">{categoryErr}</div>}
                <input
                  value={newCategory.name}
                  onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
                  placeholder="New category name"
                />
                <select value={newCategory.parent_id} onChange={(e) => setNewCategory((p) => ({ ...p, parent_id: e.target.value }))}>
                  <option value="">Root category</option>
                  {categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{categoryLabel(cat, categories)}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={createCategory}>
                  Create and Select
                </button>
              </div>
            )}
          </div>
          <input value={form.storage_location} placeholder="Storage location" onChange={(e) => setForm((p) => ({ ...p, storage_location: e.target.value }))} />
          <textarea value={form.notes} placeholder="Notes" onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          <textarea value={form.spec_summary} placeholder="Spec summary" onChange={(e) => setForm((p) => ({ ...p, spec_summary: e.target.value }))} />
          <div className="button-row">
            <button className="btn btn-primary btn-sm" onClick={promote}>Create</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setMode('review')}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="inline-form">
          <input value={partSearch} onChange={(e) => setPartSearch(e.target.value)} placeholder="Search existing parts..." />
          <div className="merge-list">
            {parts.map((part) => (
              <button key={part.id} onClick={() => merge(part.id)}>
                <strong>{part.name}</strong>
                <span>{part.category_name || 'Uncategorized'}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setMode('review')}>Cancel</button>
        </div>
      )}
    </div>
  );
}
