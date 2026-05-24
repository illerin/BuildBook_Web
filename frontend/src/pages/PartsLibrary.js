import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE, api } from '../api/client';
import ModalOverlay from '../components/ModalOverlay';

function imageUrl(path) {
  return path ? `${API_BASE}/files/images/${encodeURIComponent(path)}` : '';
}

function docUrl(path) {
  return `${API_BASE}/files/documents/${path}`;
}

function fileExtension(name) {
  const match = String(name || '').toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : '';
}

const IMAGE_PREVIEW_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SPREADSHEET_PREVIEW_EXTS = ['.xlsx', '.xls', '.csv', '.tsv'];
const TEXT_PREVIEW_EXTS = [
  '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts', '.jsx', '.tsx',
  '.ino', '.c', '.cpp', '.h', '.hpp', '.py', '.yaml', '.yml', '.gcode', '.nc',
  '.kicad_pcb', '.kicad_sch', '.sch', '.brd',
];

function categoryPath(part) {
  if (!part.category_name) return 'Uncategorized';
  return part.parent_category_name ? `${part.parent_category_name} / ${part.category_name}` : part.category_name;
}

function buildCategoryTree(categories) {
  const nodes = categories.map((category) => ({ ...category, children: [] }));
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const roots = [];
  nodes.forEach((node) => {
    if (node.parent_id && byId[node.parent_id]) byId[node.parent_id].children.push(node);
    else roots.push(node);
  });
  const sortTree = (items) => items
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.name.localeCompare(b.name))
    .map((item) => ({ ...item, children: sortTree(item.children) }));
  return sortTree(roots);
}

function flattenCategoryTree(items) {
  return items.flatMap((item) => [item, ...flattenCategoryTree(item.children || [])]);
}

function categoryFullLabel(category, categories, seen = new Set()) {
  if (!category) return '';
  if (!category.parent_id || seen.has(category.id)) return category.name;
  const parent = categories.find((cat) => String(cat.id) === String(category.parent_id));
  if (!parent) return category.name;
  return `${categoryFullLabel(parent, categories, new Set([...seen, category.id]))} / ${category.name}`;
}

function categoryOptionText(category) {
  const depth = String(category.label || category.name || '').split('/').filter(Boolean).length - 1;
  return `${'  '.repeat(depth)}${depth > 0 ? '- ' : ''}${category.name}`;
}

function totalTreeCount(node) {
  return node.part_count + node.children.reduce((sum, child) => sum + totalTreeCount(child), 0);
}

function CategoryTreeNode({ node, activeId, onSelect, onDropPart, dragOverCategoryId, setDragOverCategoryId, depth = 0 }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const isDragOver = String(dragOverCategoryId) === String(node.id);
  return (
    <div>
      <div className="category-tree-line" style={{ paddingLeft: `${depth * 14}px` }}>
        {hasChildren ? (
          <button className="tree-toggle" onClick={() => setOpen((value) => !value)}>{open ? '-' : '+'}</button>
        ) : <span className="tree-toggle-spacer" />}
        <button
          className={`category-row tree-row ${String(activeId) === String(node.id) ? 'active' : ''} ${isDragOver ? 'drop-target' : ''}`}
          onClick={() => onSelect(node.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverCategoryId(node.id);
          }}
          onDragLeave={() => setDragOverCategoryId((current) => (String(current) === String(node.id) ? '' : current))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverCategoryId('');
            onDropPart(node.id, e);
          }}
        >
          {node.name} <span>{totalTreeCount(node)}</span>
        </button>
      </div>
      {open && hasChildren && node.children.map((child) => (
        <CategoryTreeNode
          key={child.id}
          node={child}
          activeId={activeId}
          onSelect={onSelect}
          onDropPart={onDropPart}
          dragOverCategoryId={dragOverCategoryId}
          setDragOverCategoryId={setDragOverCategoryId}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function categoryTemplateFromTree(nodes) {
  return nodes.map((node) => ({
    name: node.name,
    ...(node.children.length ? { children: categoryTemplateFromTree(node.children) } : {}),
  }));
}

function descendantIds(categories, categoryId) {
  const direct = categories.filter((cat) => String(cat.parent_id) === String(categoryId));
  return direct.flatMap((cat) => [cat.id, ...descendantIds(categories, cat.id)]);
}

function categoryDepth(category, categories, seen = new Set()) {
  if (!category?.parent_id || seen.has(category.id)) return 0;
  const parent = categories.find((cat) => String(cat.id) === String(category.parent_id));
  if (!parent) return 0;
  return 1 + categoryDepth(parent, categories, new Set([...seen, category.id]));
}

function CategoryManagerModal({ categories, onClose, onChanged }) {
  const [rows, setRows] = useState(categories);
  const [newCategory, setNewCategory] = useState({ name: '', parent_id: '' });
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [err, setErr] = useState('');
  const importRef = useRef(null);

  useEffect(() => { setRows(categories); }, [categories]);

  const options = useMemo(() => {
    return rows
      .map((cat) => ({
        ...cat,
        label: categoryFullLabel(cat, rows),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const tree = useMemo(() => buildCategoryTree(options), [options]);
  const treeOrderedOptions = useMemo(() => {
    const flatten = (items) => items.flatMap((item) => [item, ...flatten(item.children)]);
    return flatten(tree);
  }, [tree]);

  const refresh = async () => {
    const latest = await api.getCategories();
    setRows(latest);
    onChanged();
  };

  const create = async () => {
    if (!newCategory.name.trim()) return setErr('Category name is required');
    await api.createCategory({ name: newCategory.name.trim(), parent_id: newCategory.parent_id || null });
    setNewCategory({ name: '', parent_id: '' });
    setErr('');
    refresh();
  };

  const updateRow = async (row) => {
    if (!row.name.trim()) return setErr('Category name is required');
    await api.updateCategory(row.id, {
      name: row.name.trim(),
      description: row.description || '',
      parent_id: row.parent_id || null,
    });
    setErr('');
    refresh();
  };

  const deleteRow = async (row) => {
    if (!window.confirm(`Delete category "${row.name}"? Parts in this category will become unassigned.`)) return;
    await api.deleteCategory(row.id);
    refresh();
  };

  const reorderRows = async (sourceRow, targetRow) => {
    if (!sourceRow || !targetRow || sourceRow.id === targetRow.id) return;
    if (String(sourceRow.parent_id || '') !== String(targetRow.parent_id || '')) {
      setErr('Drag categories within the same parent. Use the parent dropdown to move a category to another level.');
      return;
    }

    const siblings = treeOrderedOptions.filter((cat) => String(cat.parent_id || '') === String(sourceRow.parent_id || ''));
    const orderedIds = siblings.map((cat) => cat.id);
    const from = orderedIds.findIndex((id) => id === sourceRow.id);
    const to = orderedIds.findIndex((id) => id === targetRow.id);
    if (from < 0 || to < 0) return;
    orderedIds.splice(to, 0, orderedIds.splice(from, 1)[0]);

    try {
      setErr('');
      setRows((current) => current.map((cat) => {
        const index = orderedIds.findIndex((id) => id === cat.id);
        return index >= 0 ? { ...cat, order_index: (index + 1) * 10 } : cat;
      }));
      await api.reorderCategories({ parent_id: sourceRow.parent_id || null, ordered_ids: orderedIds });
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  };

  const mergeRows = async () => {
    if (!mergeSource || !mergeTarget) {
      setErr('Choose a category to merge and a destination category.');
      return;
    }
    const source = rows.find((row) => String(row.id) === String(mergeSource));
    const target = rows.find((row) => String(row.id) === String(mergeTarget));
    if (!source || !target) return;
    if (!window.confirm(`Merge "${source.name}" into "${target.name}"? Parts move to the destination and child categories move under it.`)) return;
    try {
      setErr('');
      await api.mergeCategory(mergeSource, { target_id: mergeTarget });
      setMergeSource('');
      setMergeTarget('');
      refresh();
    } catch (e) {
      setErr(e.message);
    }
  };

  const exportTemplate = () => {
    const data = JSON.stringify({ categories: categoryTemplateFromTree(tree) }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'electronics-category-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTemplate = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.categories;
      if (!Array.isArray(incoming)) throw new Error('Template must contain a categories array.');
      let latest = await api.getCategories();
      const findExisting = (name, parentId) => latest.find((cat) => (
        String(cat.parent_id || '') === String(parentId || '')
        && cat.name.trim().toLowerCase() === String(name || '').trim().toLowerCase()
      ));
      const createTree = async (items, parentId = null) => {
        for (const item of items) {
          const name = String(item.name || '').trim();
          if (!name) continue;
          let existing = findExisting(name, parentId);
          if (!existing) {
            existing = await api.createCategory({ name, parent_id: parentId });
            latest = [...latest, existing];
          }
          if (Array.isArray(item.children)) await createTree(item.children, existing.id);
        }
      };
      await createTree(incoming);
      setErr('');
      await refresh();
    } catch (error) {
      setErr(error.message);
    } finally {
      e.target.value = '';
    }
  };

  const blockedMergeTargetIds = new Set(
    mergeSource ? [mergeSource, ...descendantIds(rows, mergeSource)].map(String) : [],
  );

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal category-manager-modal">
        <div className="card-header">
          <h2>Edit Categories</h2>
          <button className="btn-icon" onClick={onClose}>x</button>
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="button-row">
          <button className="btn btn-secondary btn-sm" onClick={exportTemplate}>Export Template</button>
          <button className="btn btn-secondary btn-sm" onClick={() => importRef.current.click()}>Import Template</button>
          <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importTemplate} />
        </div>

        <section className="category-create-box category-manager-create">
          <input value={newCategory.name} onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))} placeholder="New category name" />
          <select value={newCategory.parent_id} onChange={(e) => setNewCategory((p) => ({ ...p, parent_id: e.target.value }))}>
            <option value="">Root category</option>
            {options.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={create}>Add Category</button>
        </section>

        <section className="category-merge-box">
          <div>
            <strong>Merge Categories</strong>
            <p className="muted">Move parts out of one category and delete it. Child categories move under the destination.</p>
          </div>
          <select value={mergeSource} onChange={(e) => { setMergeSource(e.target.value); setMergeTarget(''); }}>
            <option value="">Category to merge...</option>
            {options.map((cat) => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
          </select>
          <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} disabled={!mergeSource}>
            <option value="">Destination...</option>
            {options.filter((cat) => !blockedMergeTargetIds.has(String(cat.id))).map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={mergeRows}>Merge</button>
        </section>

        <div className="category-manager-list">
          {treeOrderedOptions.map((row) => {
            const blockedParentIds = new Set([row.id, ...descendantIds(rows, row.id)].map(String));
            const depth = Math.min(categoryDepth(row, rows), 5);
            return (
              <div
                className={`category-edit-row category-depth-${depth} ${String(draggedId) === String(row.id) ? 'dragging' : ''} ${String(dragOverId) === String(row.id) ? 'drag-over' : ''}`}
                style={{ marginLeft: `${depth * 18}px` }}
                key={row.id}
                draggable
                onDragStart={(e) => {
                  setDraggedId(row.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(row.id));
                }}
                onDragOver={(e) => {
                  const source = rows.find((cat) => String(cat.id) === String(draggedId));
                  if (source && String(source.parent_id || '') === String(row.parent_id || '') && source.id !== row.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverId(row.id);
                  }
                }}
                onDragLeave={() => setDragOverId((id) => (String(id) === String(row.id) ? null : id))}
                onDrop={async (e) => {
                  e.preventDefault();
                  const sourceId = e.dataTransfer.getData('text/plain') || draggedId;
                  const source = rows.find((cat) => String(cat.id) === String(sourceId));
                  setDraggedId(null);
                  setDragOverId(null);
                  await reorderRows(source, row);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
              >
                <span className="category-drag-handle" title="Drag to reorder">::</span>
                <span className="category-depth-pill">{depth === 0 ? 'Root' : `Sub ${depth}`}</span>
                <input value={row.name} onChange={(e) => setRows((current) => current.map((cat) => cat.id === row.id ? { ...cat, name: e.target.value } : cat))} />
                <select value={row.parent_id || ''} onChange={(e) => setRows((current) => current.map((cat) => cat.id === row.id ? { ...cat, parent_id: e.target.value || null } : cat))}>
                  <option value="">Root category</option>
                  {options.filter((cat) => !blockedParentIds.has(String(cat.id))).map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm" onClick={() => updateRow(row)}>Save</button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteRow(row)}>Delete</button>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

export default function PartsLibrary() {
  const [searchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState('');
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingPart, setEditingPart] = useState(null);
  const [editingCategories, setEditingCategories] = useState(false);
  const [detailId, setDetailId] = useState(searchParams.get('part'));
  const [dragPartId, setDragPartId] = useState('');
  const [dragOverCategoryId, setDragOverCategoryId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const [cats, rows] = await Promise.all([
      api.getCategories(),
      api.getParts({ search, category, uncategorized: showUnassigned ? 'true' : undefined }),
    ]);
    setCategories(cats);
    setParts(rows);
    if (showSpinner) setLoading(false);
  }, [search, category, showUnassigned]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const nextSearch = searchParams.get('search');
    const nextPart = searchParams.get('part');
    if (nextSearch !== null) setSearch(nextSearch);
    if (nextPart) setDetailId(nextPart);
  }, [searchParams]);

  const categoryOptions = useMemo(() => {
    const withLabels = categories.map((c) => ({
      ...c,
      label: categoryFullLabel(c, categories),
    }));
    return flattenCategoryTree(buildCategoryTree(withLabels));
  }, [categories]);

  const categoryTree = useMemo(() => buildCategoryTree(categoryOptions), [categoryOptions]);
  const unassignedCount = useMemo(() => parts.filter((part) => !part.category_id).length, [parts]);
  const setCategoryFilter = (id) => {
    setShowUnassigned(false);
    setCategory(id);
  };
  const setUnassignedFilter = () => {
    setShowUnassigned(true);
    setCategory('');
  };
  const flash = (text, isErr = false) => {
    if (isErr) setErr(text); else setMsg(text);
    setTimeout(() => {
      setMsg('');
      setErr('');
    }, 3500);
  };
  const movePartToCategory = async (targetCategoryId, e) => {
    const sourceId = e?.dataTransfer?.getData('application/x-buildbook-part-id') || dragPartId;
    const part = parts.find((row) => String(row.id) === String(sourceId));
    if (!part) return;
    const nextCategoryId = targetCategoryId || null;
    if (String(part.category_id || '') === String(nextCategoryId || '')) return;
    const scrollContainer = document.querySelector('.content');
    const scrollTop = scrollContainer?.scrollTop || 0;
    try {
      await api.updatePart(part.id, {
        name: part.name,
        category_id: nextCategoryId,
        product_url: part.product_url || '',
        storage_location: part.storage_location || '',
        notes: part.notes || '',
        spec_summary: part.spec_summary || '',
      });
      const categoryName = nextCategoryId
        ? categoryOptions.find((cat) => String(cat.id) === String(nextCategoryId))?.label || 'category'
        : 'Unassigned';
      flash(`Moved "${part.name}" to ${categoryName}.`);
      await load(false);
      requestAnimationFrame(() => {
        if (scrollContainer) scrollContainer.scrollTop = scrollTop;
      });
    } catch (error) {
      flash(error.message, true);
    } finally {
      setDragPartId('');
      setDragOverCategoryId('');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Parts Library</h1>
          <p className="page-subtitle">Reference parts, specs, datasheets, storage locations, and product links.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setEditingCategories(true)}>Edit Categories</button>
          <button className="btn btn-primary" onClick={() => setEditingPart({})}>New Part</button>
        </div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <div className="filters">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parts, notes, specs..." />
        <select value={showUnassigned ? '__unassigned' : category} onChange={(e) => {
          if (e.target.value === '__unassigned') setUnassignedFilter();
          else setCategoryFilter(e.target.value);
        }}>
          <option value="">All categories</option>
          <option value="__unassigned">Unassigned</option>
          {categoryOptions.map((c) => <option key={c.id} value={c.id}>{categoryOptionText(c)}</option>)}
        </select>
        {(search || category || showUnassigned) && <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setCategory(''); setShowUnassigned(false); }}>Clear</button>}
      </div>

      <div className="library-layout">
        <aside className="library-sidebar">
          <h3>Categories</h3>
          <button className={`category-row ${category === '' && !showUnassigned ? 'active' : ''}`} onClick={() => setCategoryFilter('')}>
            All parts <span>{parts.length}</span>
          </button>
          <button
            className={`category-row ${showUnassigned ? 'active' : ''} ${dragOverCategoryId === '__unassigned' ? 'drop-target' : ''}`}
            onClick={setUnassignedFilter}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCategoryId('__unassigned');
            }}
            onDragLeave={() => setDragOverCategoryId((current) => (current === '__unassigned' ? '' : current))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverCategoryId('');
              movePartToCategory(null, e);
            }}
          >
            Unassigned <span>{showUnassigned ? parts.length : unassignedCount}</span>
          </button>
          <div className="category-tree">
            {categoryTree.map((node) => (
              <CategoryTreeNode
                key={node.id}
                node={node}
                activeId={category}
                onSelect={setCategoryFilter}
                onDropPart={movePartToCategory}
                dragOverCategoryId={dragOverCategoryId}
                setDragOverCategoryId={setDragOverCategoryId}
              />
            ))}
          </div>
        </aside>

        <section>
          {loading ? <div className="loading">Loading...</div> :
            parts.length === 0 ? <div className="empty">No parts found.</div> : (
              <div className="item-grid">
                {parts.map((part) => (
                  <button
                    key={part.id}
                    className={`part-card ${String(dragPartId) === String(part.id) ? 'dragging' : ''}`}
                    draggable
                    onClick={() => setDetailId(part.id)}
                    onDragStart={(e) => {
                      setDragPartId(part.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('application/x-buildbook-part-id', String(part.id));
                      e.dataTransfer.setData('text/plain', part.name);
                    }}
                    onDragEnd={() => {
                      setDragPartId('');
                      setDragOverCategoryId('');
                    }}
                  >
                    {part.image_path ? <img src={imageUrl(part.image_path)} alt="" /> : <div className="thumb-placeholder">Part</div>}
                    <div className="part-card-body">
                      <span>{categoryPath(part)}</span>
                      <strong>{part.name}</strong>
                      <p>{part.storage_location || 'No location set'}</p>
                      <div className="mini-meta">
                        <span>{part.document_count} docs</span>
                        {part.product_url && <span>Product link</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          }
        </section>
      </div>

      {editingCategories && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setEditingCategories(false)}
          onChanged={load}
        />
      )}
      {editingPart && (
        <PartModal
          part={editingPart.id ? editingPart : null}
          categories={categoryOptions}
          onClose={() => setEditingPart(null)}
          onSave={() => { setEditingPart(null); load(); }}
        />
      )}
      {detailId && (
        <PartDetailModal
          partId={detailId}
          categories={categoryOptions}
          onClose={() => setDetailId(null)}
          onEdit={(part) => { setDetailId(null); setEditingPart(part); }}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CategoryModal({ category, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    name: category?.name || '',
    description: category?.description || '',
    parent_id: category?.parent_id || '',
  });
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.name.trim()) return setErr('Name is required');
    const body = { ...form, parent_id: form.parent_id || null };
    if (category) await api.updateCategory(category.id, body);
    else await api.createCategory(body);
    onSave();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal">
        <h2>{category ? 'Edit Category' : 'New Category'}</h2>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="form-group">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
        </div>
        <div className="form-group">
          <label>Parent category</label>
          <select value={form.parent_id} onChange={(e) => setForm((p) => ({ ...p, parent_id: e.target.value }))}>
            <option value="">Top level</option>
            {categories.filter((c) => c.id !== category?.id).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PartModal({ part, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    name: part?.name || '',
    category_id: part?.category_id || '',
    product_url: part?.product_url || '',
    storage_location: part?.storage_location || '',
    notes: part?.notes || '',
    spec_summary: part?.spec_summary || '',
  });
  const [err, setErr] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProjects().then(setProjects).catch((e) => setErr(e.message));
  }, []);

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) return setErr('Name is required');
    setSaving(true);
    setErr('');
    try {
      const body = { ...form, category_id: form.category_id || null };
      const saved = part ? await api.updatePart(part.id, body) : await api.createPart(body);
      if (imageFile) {
        const upload = new FormData();
        upload.append('image', imageFile);
        await api.uploadPartImage(saved.id, upload);
      }
      if (documentFile) {
        const upload = new FormData();
        upload.append('file', documentFile);
        await api.uploadPartDocument(saved.id, upload);
      }
      if (projectId) {
        await api.addProjectPart(projectId, { part_id: saved.id });
      }
      onSave();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };
  // TODO(post-MVP): reintroduce automatic spec/image lookup after quality improves.
  const openImageSearch = () => {
    const query = form.name.trim() || part?.name?.trim();
    if (!query) {
      setErr('Enter a part name before searching for images.');
      return;
    }
    const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${query} part image`)}`;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal large-modal">
        <div className="card-header">
          <h2>{part ? 'Edit Part' : 'New Part'}</h2>
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{categoryOptionText(c)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Product URL</label>
            <input value={form.product_url} onChange={(e) => set('product_url', e.target.value)} placeholder="https://..." />
          </div>
          <div className="form-group">
            <label>Storage location</label>
            <input value={form.storage_location} onChange={(e) => set('storage_location', e.target.value)} placeholder="Bin, drawer, shelf..." />
          </div>
        </div>
        <div className="form-group">
          <label>Image</label>
          <div className="image-picker-row">
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
            <button type="button" className="btn btn-secondary" onClick={openImageSearch}>Search Images</button>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Document</label>
            <input type="file" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} />
          </div>
          <div className="form-group">
            <label>Add to project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Do not link yet</option>
              {projects
                .filter((project) => !part?.projects?.some((linked) => linked.id === project.id))
                .map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Spec summary</label>
          <textarea value={form.spec_summary} onChange={(e) => set('spec_summary', e.target.value)} rows={7} />
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={4} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function PartDetailModal({ partId, categories, onClose, onEdit, onChanged }) {
  const [part, setPart] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [expandedImage, setExpandedImage] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const fileRef = useRef(null);
  const nameInputRef = useRef(null);

  const load = useCallback(async () => setPart(await api.getPart(partId)), [partId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getProjects().then(setProjects); }, []);
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  if (!part) {
    return (
      <div className="modal-overlay">
        <div className="modal"><div className="loading">Loading...</div></div>
      </div>
    );
  }

  const docs = part.documents || [];
  const selectedDoc = docs.find((doc) => String(doc.id) === String(selectedDocId))
    || docs.find((doc) => doc.is_primary)
    || docs[0];

  const startNameEdit = () => {
    setNameDraft(part.name || '');
    setNameErr('');
    setEditingName(true);
  };

  const cancelNameEdit = () => {
    setNameDraft('');
    setNameErr('');
    setEditingName(false);
  };

  const saveNameEdit = async () => {
    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameErr('Name is required');
      return;
    }
    if (nextName === part.name) {
      cancelNameEdit();
      return;
    }
    setNameSaving(true);
    setNameErr('');
    try {
      const updated = await api.updatePart(part.id, {
        name: nextName,
        category_id: part.category_id || null,
        product_url: part.product_url || '',
        storage_location: part.storage_location || '',
        notes: part.notes || '',
        spec_summary: part.spec_summary || '',
      });
      setPart((current) => ({ ...current, ...updated, documents: current.documents, projects: current.projects }));
      setEditingName(false);
      setNameDraft('');
      onChanged();
    } catch (error) {
      setNameErr(error.message);
    } finally {
      setNameSaving(false);
    }
  };

  const uploadImage = async (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    const form = new FormData();
    form.append('image', selected);
    await api.uploadPartImage(part.id, form);
    await load();
    onChanged();
  };

  const uploadDoc = async () => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    await api.uploadPartDocument(part.id, form);
    setFile(null);
    setUploading(false);
    await load();
  };

  const removeDoc = async (id) => {
    await api.deletePartDocument(id);
    await load();
  };

  const setPrimaryDoc = async (id) => {
    await api.setPrimaryPartDocument(id);
    await load();
  };

  const addToProject = async () => {
    if (!projectId) return;
    await api.addProjectPart(projectId, { part_id: part.id });
    setProjectId('');
    await load();
  };

  const removePart = async () => {
    if (!window.confirm(`Delete "${part.name}"?`)) return;
    await api.deletePart(part.id);
    onChanged();
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal detail-modal">
        <div className="detail-header">
          <div className="detail-image-slot">
            {part.image_path ? (
              <button className="detail-image-button" onClick={() => setExpandedImage(true)} aria-label={`Expand image for ${part.name}`}>
                <img src={imageUrl(part.image_path)} alt="" />
              </button>
            ) : (
              <div className="detail-placeholder">
                <span>Part</span>
              </div>
            )}
          </div>
          <div>
            <span>{categoryPath(part)}</span>
            {editingName ? (
              <div className="quick-title-edit">
                <input
                  ref={nameInputRef}
                  value={nameDraft}
                  disabled={nameSaving}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveNameEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveNameEdit();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelNameEdit();
                    }
                  }}
                />
                {nameErr && <small className="inline-error">{nameErr}</small>}
              </div>
            ) : (
              <h2 className="quick-edit-title" title="Double-click to rename" onDoubleClick={startNameEdit}>{part.name}</h2>
            )}
            <p>{part.storage_location || 'No location set'}</p>
            {part.product_url && <a href={part.product_url} target="_blank" rel="noreferrer">Open product page</a>}
          </div>
          <div className="detail-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>Image</button>
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(part)}>Edit</button>
            <button className="btn btn-danger btn-sm" onClick={removePart}>Delete</button>
            <button className="btn-icon" onClick={onClose}>x</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadImage} />
        </div>

        <div className="part-detail-layout">
          <div>
            <div className="detail-grid">
              <section className="card">
                <h3>Spec Summary</h3>
                {part.spec_summary ? <pre className="spec-box">{part.spec_summary}</pre> : <p className="muted">No specs saved yet.</p>}
              </section>
              <section className="card">
                <h3>Notes</h3>
                {part.notes ? <p className="notes-text">{part.notes}</p> : <p className="muted">No notes yet.</p>}
              </section>
            </div>

            <section className="card">
              <h3>Documents</h3>
              {part.documents?.length ? part.documents.map((doc) => (
                <div key={doc.id} className={`file-row ${selectedDoc?.id === doc.id ? 'selected-file-row' : ''}`}>
                  <a href={doc.file_path ? docUrl(doc.file_path) : undefined} target="_blank" rel="noreferrer">{doc.original_filename}</a>
                  <span>{doc.is_primary ? 'Default' : new Date(doc.uploaded_at).toLocaleDateString()}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedDocId(doc.id)}>Preview</button>
                  {!doc.is_primary && <button className="btn btn-secondary btn-sm" onClick={() => setPrimaryDoc(doc.id)}>Make Default</button>}
                  <button className="btn-icon" onClick={() => removeDoc(doc.id)}>x</button>
                </div>
              )) : <p className="muted">No documents attached.</p>}
              <div className="upload-line">
                <input type="file" onChange={(e) => setFile(e.target.files[0])} />
                <button className="btn btn-primary btn-sm" disabled={!file || uploading} onClick={uploadDoc}>
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </section>
          </div>

          <section className="card part-preview-card">
            <div className="card-title-row">
              <h3>File Preview</h3>
              {selectedDoc?.file_path && <a className="sub-link" href={docUrl(selectedDoc.file_path)} target="_blank" rel="noreferrer">Open</a>}
            </div>
            {selectedDoc ? (
              <>
                {docs.length > 1 && (
                  <select value={selectedDoc.id} onChange={(e) => setSelectedDocId(e.target.value)}>
                    {docs.map((doc) => <option key={doc.id} value={doc.id}>{doc.original_filename}</option>)}
                  </select>
                )}
                <button className="file-document-preview-button" onClick={() => setExpandedDoc(selectedDoc)}>
                  <PartDocumentPreview doc={selectedDoc} compact />
                  <span>Click to expand</span>
                </button>
              </>
            ) : (
              <p className="muted">Attach a supported file to preview it here.</p>
            )}
          </section>
        </div>

        <section className="card">
          <h3>Add To Project</h3>
          <div className="upload-line">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Choose project...</option>
              {projects
                .filter((project) => !(part.projects || []).some((linked) => linked.id === project.id))
                .map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!projectId} onClick={addToProject}>Add</button>
          </div>
        </section>

        {part.projects?.length > 0 && (
          <section className="card">
            <h3>Used In Projects</h3>
            {part.projects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`} className="file-row" onClick={onClose}>
                <strong>{project.name}</strong>
                <span>{project.status}</span>
              </Link>
            ))}
          </section>
        )}
        {expandedDoc && (
          <ModalOverlay className="pdf-expanded-overlay" onClose={() => setExpandedDoc(null)}>
            <div className="pdf-expanded-modal">
              <div className="viewer-toolbar">
                <strong>{expandedDoc.original_filename}</strong>
                {expandedDoc.file_path && <a className="btn btn-secondary btn-sm" href={docUrl(expandedDoc.file_path)} target="_blank" rel="noreferrer">Open</a>}
                <button className="btn btn-secondary btn-sm" onClick={() => setExpandedDoc(null)}>Close</button>
              </div>
              <PartDocumentPreview doc={expandedDoc} />
            </div>
          </ModalOverlay>
        )}
        {expandedImage && part.image_path && (
          <ModalOverlay className="image-expanded-overlay" onClose={() => setExpandedImage(false)}>
            <div className="image-expanded-modal">
              <div className="viewer-toolbar">
                <strong>{part.name}</strong>
                <button className="btn btn-secondary btn-sm" onClick={() => setExpandedImage(false)}>Close</button>
              </div>
              <img src={imageUrl(part.image_path)} alt={part.name} />
            </div>
          </ModalOverlay>
        )}
      </div>
    </ModalOverlay>
  );
}

function PartDocumentPreview({ doc, compact = false }) {
  if (!doc) return null;
  const ext = fileExtension(doc.original_filename);
  const url = doc.file_path ? docUrl(doc.file_path) : '';
  if (doc.file_type === 'pdf' || ext === '.pdf') {
    return <iframe className="file-preview-frame" title={doc.original_filename} src={url} />;
  }
  if (doc.file_type === 'image' || IMAGE_PREVIEW_EXTS.includes(ext)) {
    return <img className="file-preview-image" src={url} alt={doc.original_filename} />;
  }
  if (SPREADSHEET_PREVIEW_EXTS.includes(ext)) {
    return <PartSpreadsheetPreview url={url} filename={doc.original_filename} ext={ext} />;
  }
  if (doc.text_content && !doc.file_path) {
    return <pre className="file-preview-text">{doc.text_content}</pre>;
  }
  if (TEXT_PREVIEW_EXTS.includes(ext)) {
    return <PartTextPreview url={url} filename={doc.original_filename} />;
  }
  return (
    <div className="file-preview-empty">
      <strong>{doc.original_filename}</strong>
      <p className="muted">No built-in preview for this file type yet. It can still be opened from here.</p>
      {url && <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">Open File</a>}
    </div>
  );
}

function PartTextPreview({ url, filename }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load file');
        return response.text();
      })
      .then((value) => alive && setText(value.slice(0, 120000)))
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [url]);

  if (err) return <div className="file-preview-empty"><strong>{filename}</strong><p className="muted">{err}</p></div>;
  return <pre className="file-preview-text">{text || 'Loading...'}</pre>;
}

function PartSpreadsheetPreview({ url, filename, ext }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  const loadSheet = useCallback((sheetName = '') => {
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load spreadsheet');
        return ext === '.csv' || ext === '.tsv' ? response.text() : response.arrayBuffer();
      })
      .then((data) => {
        const workbook = ext === '.csv' || ext === '.tsv'
          ? XLSX.read(data, { type: 'string', raw: false, FS: ext === '.tsv' ? '\t' : ',' })
          : XLSX.read(data, { type: 'array' });
        const names = workbook.SheetNames || [];
        const nextSheet = sheetName || names[0] || '';
        setSheets(names);
        setActiveSheet(nextSheet);
        setRows(nextSheet ? XLSX.utils.sheet_to_json(workbook.Sheets[nextSheet], { header: 1, defval: '' }).slice(0, 250) : []);
      })
      .catch((e) => setErr(e.message));
  }, [url, ext]);

  useEffect(() => { loadSheet(); }, [loadSheet]);

  if (err) return <div className="file-preview-empty"><strong>{filename}</strong><p className="muted">{err}</p></div>;
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  return (
    <div className="spreadsheet-preview">
      <div className="viewer-toolbar">
        <strong>{filename}</strong>
        {sheets.length > 1 && (
          <select value={activeSheet} onChange={(e) => loadSheet(e.target.value)}>
            {sheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
          </select>
        )}
        <span>{rows.length ? `${rows.length} rows shown` : 'Loading...'}</span>
      </div>
      <div className="spreadsheet-table-wrap">
        <table className="spreadsheet-table">
          <tbody>
            {rows.length === 0 ? (
              <tr><td>Loading...</td></tr>
            ) : rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columnCount }).map((_, colIndex) => {
                  const Tag = rowIndex === 0 ? 'th' : 'td';
                  return <Tag key={colIndex}>{String(row[colIndex] ?? '')}</Tag>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
