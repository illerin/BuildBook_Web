import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import PartDetailModal from '../components/PartDetailModal';

function qtyClass(n) { return n < 0 ? 'qty-neg' : n <= 5 ? 'qty-low' : 'qty-ok'; }
function thumb(path, size = 36) {
 if (!path) return (
 <div style={{width:size,height:size,background:'#21262d',borderRadius:4,border:'1px solid #30363d',
 display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.45,flexShrink:0}}></div>
 );
 return <img src={`/files/images/${path}`} alt="" style={{width:size,height:size,objectFit:'cover',borderRadius:4,border:'1px solid #30363d',flexShrink:0}} />;
}

export default function Inventory() {
 const [allCats, setAllCats] = useState([]); // flat list of all part_group rows
 const [allVariants, setAllVariants] = useState([]); // shown when searching
 const [search, setSearch] = useState('');
 const [loading, setLoading] = useState(true);
 const [showModal, setShowModal] = useState(false); // 'category' | 'part' | false
 const [modalParent, setModalParent] = useState(null);

 const load = useCallback(async () => {
 setLoading(true);
 const cats = await api.getCategories();
 setAllCats(cats);
 setLoading(false);
 }, []);

 useEffect(() => { load(); }, [load]);

 // Debounced search
 useEffect(() => {
 if (!search.trim()) { setAllVariants([]); return; }
 const t = setTimeout(async () => {
 const v = await api.getVariants({ search });
 setAllVariants(v);
 }, 250);
 return () => clearTimeout(t);
 }, [search]);

 // Build tree
 const topLevel = allCats.filter(c => !c.parent_id);
 const childrenOf = (id) => allCats.filter(c => c.parent_id === id);

 return (
 <div>
 <div className="page-header">
 <h1>Inventory</h1>
 <div style={{display:'flex', gap:8}}>
 <button className="btn btn-secondary" onClick={() => { setModalParent(null); setShowModal('category'); }}>+ New Category</button>
 <button className="btn btn-primary" onClick={() => { setModalParent(null); setShowModal('part'); }}>+ New Part</button>
 </div>
 </div>

 <div className="filters" style={{marginBottom:20}}>
 <input placeholder="Search all parts..." value={search} onChange={e => setSearch(e.target.value)} style={{flex:1, maxWidth:400}} />
 {search && <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear</button>}
 </div>

 {search.trim() ? (
 // ── Flat search results ──
 <SearchResults variants={allVariants} />
 ) : loading ? <div className="loading">Loading...</div> : topLevel.length === 0 ? (
 <div className="empty">No categories yet. Create one to get started.</div>
 ) : (
 // ── Tree view ──
 topLevel.map(cat => (
 <TopCategory key={cat.id} cat={cat} children={childrenOf(cat.id)}
 allCats={allCats} onRefresh={load}
 onAddCategory={(parent) => { setModalParent(parent); setShowModal('category'); }}
 onAddPart={(parent) => { setModalParent(parent); setShowModal('part'); }}
 />
 ))
 )}

 {showModal === 'category' && (
 <CategoryModal
 parent={modalParent}
 allCats={allCats}
 onClose={() => setShowModal(false)}
 onSave={() => { setShowModal(false); load(); }}
 />
 )}
 {showModal === 'part' && (
 <AddPartModal
 parent={modalParent}
 allCats={allCats}
 onClose={() => setShowModal(false)}
 onSave={() => { setShowModal(false); load(); }}
 />
 )}
 </div>
 );
}

// ── Top-level category card with expandable subcategories ──
function TopCategory({ cat, children, allCats, onRefresh, onAddCategory, onAddPart }) {
 const [open, setOpen] = useState(false);
 const [variants, setVariants] = useState(null); // direct variants if leaf
 const [loadingV, setLoadingV] = useState(false);
 const isLeaf = children.length === 0;

 const loadVariants = useCallback(async () => {
 if (!isLeaf) return;
 setLoadingV(true);
 const v = await api.getGroupVariants(cat.id);
 setVariants(v);
 setLoadingV(false);
 }, [cat.id, isLeaf]);

 useEffect(() => { if (open && isLeaf) loadVariants(); }, [open, isLeaf, loadVariants]);

 return (
 <div style={{marginBottom:16}}>
 <div style={{display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
 background:'#161b22', border:'1px solid #30363d', borderRadius: open ? '8px 8px 0 0' : 8,
 cursor:'pointer'}} onClick={() => setOpen(o => !o)}>
 <span style={{color:'#8b949e', fontSize:12, width:14}}>{open ? '▾' : '▸'}</span>
 {thumb(cat.image_path, 32)}
 <strong style={{fontSize:15, flex:1}}>{cat.name}</strong>
 <span style={{color:'#8b949e', fontSize:12}}>{cat.variant_count} parts</span>
 <div style={{display:'flex', gap:6}} onClick={e => e.stopPropagation()}>
 <button className="btn btn-secondary btn-sm" onClick={() => onAddCategory(cat)}>+ Subcategory</button>
 {isLeaf && <button className="btn btn-primary btn-sm" onClick={() => onAddPart(cat)}>+ Part</button>}
 <Link to={`/inventory/group/${cat.id}`} className="btn btn-secondary btn-sm">Open</Link>
 </div>
 </div>

 {open && (
 <div style={{border:'1px solid #30363d', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'hidden'}}>
 {isLeaf ? (
 loadingV ? <div style={{padding:16, color:'#8b949e', fontSize:13}}>Loading...</div> :
 !variants || variants.length === 0 ? (
 <div style={{padding:'12px 16px', color:'#8b949e', fontSize:13}}>No parts yet.
 <button className="btn btn-primary btn-sm" style={{marginLeft:10}} onClick={() => onAddPart(cat)}>+ Add Part</button>
 </div>
 ) : (
 <VariantsTable variants={variants} groupId={cat.id} onRefresh={() => { loadVariants(); }} />
 )
 ) : (
 children.map(sub => (
 <SubCategory key={sub.id} cat={sub} allCats={allCats} onRefresh={onRefresh}
 onAddCategory={onAddCategory} onAddPart={onAddPart} />
 ))
 )}
 </div>
 )}
 </div>
 );
}

// ── Subcategory row ──
function SubCategory({ cat, allCats, onRefresh, onAddCategory, onAddPart }) {
 const [open, setOpen] = useState(false);
 const [variants, setVariants] = useState(null);
 const [loadingV, setLoadingV] = useState(false);
 const children = allCats.filter(c => c.parent_id === cat.id);
 const isLeaf = children.length === 0;

 const loadVariants = useCallback(async () => {
 setLoadingV(true);
 const v = await api.getGroupVariants(cat.id);
 setVariants(v);
 setLoadingV(false);
 }, [cat.id]);

 useEffect(() => { if (open && isLeaf) loadVariants(); }, [open, isLeaf, loadVariants]);

 return (
 <div>
 <div style={{display:'flex', alignItems:'center', gap:10, padding:'8px 16px',
 background: open ? '#1c2128' : 'transparent', borderBottom:'1px solid #21262d',
 cursor:'pointer'}} onClick={() => setOpen(o => !o)}>
 <span style={{color:'#8b949e', fontSize:11, width:14}}>{open ? '▾' : '▸'}</span>
 {thumb(cat.image_path, 26)}
 <span style={{flex:1, fontSize:14}}>{cat.name}</span>
 <span style={{color:'#8b949e', fontSize:12}}>{cat.variant_count} parts</span>
 <div style={{display:'flex', gap:6}} onClick={e => e.stopPropagation()}>
 <button className="btn btn-secondary btn-sm" onClick={() => onAddCategory(cat)}>+ Sub</button>
 {isLeaf && <button className="btn btn-primary btn-sm" onClick={() => onAddPart(cat)}>+ Part</button>}
 <Link to={`/inventory/group/${cat.id}`} className="btn btn-secondary btn-sm">Open</Link>
 </div>
 </div>

 {open && (
 <div style={{background:'#0d1117', borderBottom:'1px solid #21262d'}}>
 {isLeaf ? (
 loadingV ? <div style={{padding:12, color:'#8b949e', fontSize:13, paddingLeft:32}}>Loading...</div> :
 !variants || variants.length === 0 ? (
 <div style={{padding:'10px 32px', color:'#8b949e', fontSize:13}}>No parts yet.
 <button className="btn btn-primary btn-sm" style={{marginLeft:10}} onClick={() => onAddPart(cat)}>+ Add</button>
 </div>
 ) : (
 <VariantsTable variants={variants} groupId={cat.id} indent onRefresh={loadVariants} />
 )
 ) : (
 children.map(sub2 => (
 <SubCategory key={sub2.id} cat={sub2} allCats={allCats} onRefresh={onRefresh}
 onAddCategory={onAddCategory} onAddPart={onAddPart} />
 ))
 )}
 </div>
 )}
 </div>
 );
}

// ── Variants table shown inside an expanded category ──
function VariantsTable({ variants, groupId, indent = false, onRefresh }) {
 const [editV, setEditV] = useState(null);
 const [detailV, setDetailV] = useState(null);
 const pl = indent ? 48 : 16;

 return (
 <>
 <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
 <thead>
 <tr>
 <th style={{paddingLeft:pl, width:44, paddingTop:6, paddingBottom:6, color:'#8b949e', fontSize:11, textTransform:'uppercase'}}></th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', paddingTop:6, paddingBottom:6}}>Part</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase'}}>Location</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase'}}>Avail</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase'}}>Res</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase'}}>On Order</th>
 <th></th>
 </tr>
 </thead>
 <tbody>
 {variants.map(v => (
 <VariantRow key={v.id} v={v} pl={pl}
 onOpen={() => setDetailV(v.id)}
 onEdit={() => setEditV(v)}
 onRefresh={onRefresh} />
 ))}
 </tbody>
 </table>
 {detailV && (
 <PartDetailModal
 variantId={detailV}
 onClose={() => setDetailV(null)}
 onEdit={(p) => { setDetailV(null); setEditV(p); }}
 />
 )}
 {editV && (
 <VariantEditModal variant={editV} groupId={groupId}
 onClose={() => setEditV(null)} onSave={() => { setEditV(null); onRefresh(); }} />
 )}
 </>
 );
}

function VariantRow({ v, pl, onOpen, onEdit, onRefresh }) {
 const imgPath = v.image_path || v.variant_image_path;

 const deletePart = async () => {
 if (!window.confirm(`Delete "${v.label}"? This cannot be undone.`)) return;
 try {
 await api.deleteVariant(v.id);
 onRefresh();
 } catch (e) { alert(e.message); }
 };

 return (
 <tr
 style={{borderTop:'1px solid #21262d'}}
 onMouseEnter={e=>e.currentTarget.style.background='#1c2128'}
 onMouseLeave={e=>e.currentTarget.style.background='transparent'}
 >
 <td style={{paddingLeft:pl, paddingTop:6, paddingBottom:6, cursor:'pointer'}} onClick={onOpen}>{thumb(imgPath, 30)}</td>
 <td style={{paddingTop:6, paddingBottom:6, cursor:'pointer'}} onClick={onOpen}>
 <span style={{fontWeight:500, color:'#58a6ff'}}>{v.label}</span>
 {v.notes && <span style={{color:'#8b949e', fontSize:11, marginLeft:8}}>{v.notes}</span>}
 </td>
 <td style={{color:'#8b949e', fontSize:12}}>{v.storage_location || '—'}</td>
 <td className={qtyClass(v.quantity_available)}><strong>{v.quantity_available}</strong></td>
 <td style={{color:'#8b949e'}}>{v.quantity_reserved}</td>
 <td style={{color: v.quantity_on_order > 0 ? '#d29922' : '#8b949e'}}>{v.quantity_on_order}</td>
 <td style={{display:'flex', gap:6}}>
 <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
 <button className="btn btn-danger btn-sm" onClick={deletePart}>Delete</button>
 </td>
 </tr>
 );
}

// ── Flat search results ──
function SearchResults({ variants }) {
 if (variants.length === 0) return <div className="empty">No parts match your search.</div>;
 return (
 <div className="card" style={{padding:0, overflow:'hidden'}}>
 <table>
 <thead>
 <tr>
 <th style={{width:44}}></th>
 <th>Category Path</th>
 <th>Part</th>
 <th>Location</th>
 <th>Avail</th>
 <th>Res</th>
 <th>On Order</th>
 </tr>
 </thead>
 <tbody>
 {variants.map(v => {
 const imgPath = v.variant_image_path || v.group_image_path || v.parent_image_path;
 const catPath = v.parent_name ? `${v.parent_name} › ${v.group_name}` : v.group_name;
 return (
 <tr key={v.id}>
 <td>{thumb(imgPath, 30)}</td>
 <td>
 <Link to={`/inventory/group/${v.part_group_id}`} style={{color:'#58a6ff', textDecoration:'none', fontSize:13}}>
 {catPath}
 </Link>
 </td>
 <td style={{fontWeight:500}}>{v.label}</td>
 <td style={{color:'#8b949e', fontSize:12}}>{v.storage_location || '—'}</td>
 <td className={qtyClass(v.quantity_available)}><strong>{v.quantity_available}</strong></td>
 <td style={{color:'#8b949e'}}>{v.quantity_reserved}</td>
 <td style={{color: v.quantity_on_order > 0 ? '#d29922' : '#8b949e'}}>{v.quantity_on_order}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 );
}

// ── Modals ────────────────────────────────────────────────────────────────────

function CategoryModal({ parent, allCats, onClose, onSave }) {
 const [form, setForm] = useState({ name: '', description: '', parent_id: parent?.id || '' });
 const [err, setErr] = useState('');
 const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

 const submit = async () => {
 if (!form.name.trim()) return setErr('Name required');
 try {
 await api.createCategory({ name: form.name, description: form.description || null, parent_id: form.parent_id || null, category: form.name });
 onSave();
 } catch (e) { setErr(e.message); }
 };

 return (
 <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
 <div className="modal">
 <h2>New Category</h2>
 {err && <div className="alert alert-error">{err}</div>}
 <div className="form-group"><label>Name *</label>
 <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Resistors, 10k Resistors..." />
 </div>
 <div className="form-group"><label>Parent Category (leave blank for top-level)</label>
 <select value={form.parent_id} onChange={e => f('parent_id', e.target.value)}>
 <option value="">— Top level —</option>
 {allCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
 </select>
 </div>
 <div className="form-group"><label>Description</label>
 <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={2} />
 </div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn btn-primary" onClick={submit}>Create</button>
 </div>
 </div>
 </div>
 );
}

function AddPartModal({ parent, allCats, onClose, onSave }) {
 const [form, setForm] = useState({
 label: '', quantity_available: 0, storage_location: '', notes: '', product_url: '',
 group_id: parent?.id || ''
 });
 const [err, setErr] = useState('');
 const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

 // Only show leaf categories (no children) for placing parts
 const leafCats = allCats.filter(c => !allCats.some(x => x.parent_id === c.id));

 const submit = async () => {
 if (!form.label.trim()) return setErr('Label required');
 if (!form.group_id) return setErr('Select a category');
 try {
 await api.createVariant(form.group_id, {
 label: form.label,
 quantity_available: parseInt(form.quantity_available) || 0,
 storage_location: form.storage_location || null,
 notes: form.notes || null,
 product_url: form.product_url || null,
 });
 onSave();
 } catch (e) { setErr(e.message); }
 };

 return (
 <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
 <div className="modal">
 <h2>New Part</h2>
 {err && <div className="alert alert-error">{err}</div>}
 <div className="form-group"><label>Category *</label>
 <select value={form.group_id} onChange={e => f('group_id', e.target.value)}>
 <option value="">Select category...</option>
 {leafCats.map(c => {
 const par = allCats.find(x => x.id === c.parent_id);
 return <option key={c.id} value={c.id}>{par ? `${par.name} › ${c.name}` : c.name}</option>;
 })}
 </select>
 </div>
 <div className="form-group"><label>Label *</label>
 <input value={form.label} onChange={e => f('label', e.target.value)} placeholder="e.g. 10k 0805 1% 0.1W" />
 </div>
 <div className="form-row">
 <div className="form-group"><label>Qty Available</label>
 <input type="number" value={form.quantity_available} onChange={e => f('quantity_available', e.target.value)} style={{width:'100%'}} />
 </div>
 <div className="form-group"><label>Storage Location</label>
 <input value={form.storage_location} onChange={e => f('storage_location', e.target.value)} placeholder="e.g. Bin A3" />
 </div>
 </div>
 <div className="form-group"><label>Notes</label>
 <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} />
 </div>
 <div className="form-group"><label>Product URL</label>
 <div style={{display:'flex', gap:6, alignItems:'center'}}>
 <input value={form.product_url} onChange={e => f('product_url', e.target.value)} placeholder="https://..." style={{flex:1}} />
 {form.product_url && <a href={form.product_url} target="_blank" rel="noreferrer" style={{color:'#58a6ff', fontSize:12, whiteSpace:'nowrap'}}>Open</a>}
 </div>
 </div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn btn-primary" onClick={submit}>Add Part</button>
 </div>
 </div>
 </div>
 );
}

function VariantEditModal({ variant, groupId, onClose, onSave }) {
 const [form, setForm] = useState({
 label: variant.label, quantity_available: variant.quantity_available,
 storage_location: variant.storage_location || '', notes: variant.notes || '',
 product_url: variant.product_url || '', note: ''
 });
 const [imgPath, setImgPath] = useState(variant.image_path || null);
 const [err, setErr] = useState('');
 const fileRef = useRef(null);
 const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

 const uploadImg = async (e) => {
 const file = e.target.files[0]; if (!file) return;
 const fd = new FormData(); fd.append('image', file);
 const updated = await api.uploadVariantImage(variant.id, fd);
 setImgPath(updated.image_path);
 };

 const removeImg = async () => {
 await api.deleteVariantImage(variant.id);
 setImgPath(null);
 };

 const submit = async () => {
 if (!form.label) return setErr('Label required');
 try {
 await api.updateVariant(variant.id, { ...form, quantity_available: parseInt(form.quantity_available) });
 onSave();
 } catch (e) { setErr(e.message); }
 };

 return (
 <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
 <div className="modal">
 <h2>Edit Part</h2>
 {err && <div className="alert alert-error">{err}</div>}

 {/* Image */}
 <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
 {imgPath
 ? <img src={`/files/images/${imgPath}`} alt="" style={{width:60, height:60, objectFit:'cover', borderRadius:6, border:'1px solid #30363d'}} />
 : <div style={{width:60, height:60, background:'#21262d', borderRadius:6, border:'1px dashed #30363d', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24}}></div>
 }
 <div style={{display:'flex', flexDirection:'column', gap:4}}>
 <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>
 {imgPath ? 'Replace Image' : 'Add Image'}
 </button>
 {imgPath && <button className="btn btn-secondary btn-sm" style={{color:'#f85149'}} onClick={removeImg}>Remove</button>}
 <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={uploadImg} />
 </div>
 </div>

 <div className="form-group"><label>Label *</label>
 <input value={form.label} onChange={e => f('label', e.target.value)} />
 </div>
 <div className="form-row">
 <div className="form-group"><label>Qty Available</label>
 <input type="number" value={form.quantity_available} onChange={e => f('quantity_available', e.target.value)} style={{width:'100%'}} />
 </div>
 <div className="form-group"><label>Storage Location</label>
 <input value={form.storage_location} onChange={e => f('storage_location', e.target.value)} />
 </div>
 </div>
 <div className="form-group"><label>Notes</label>
 <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} />
 </div>
 <div className="form-group"><label>Product URL</label>
 <div style={{display:'flex', gap:6, alignItems:'center'}}>
 <input value={form.product_url} onChange={e => f('product_url', e.target.value)} placeholder="https://..." style={{flex:1}} />
 {form.product_url && <a href={form.product_url} target="_blank" rel="noreferrer" style={{color:'#58a6ff', fontSize:12, whiteSpace:'nowrap'}}>Open</a>}
 </div>
 </div>
 <div className="form-group"><label>Edit Note (for log)</label>
 <input value={form.note} onChange={e => f('note', e.target.value)} placeholder="Reason for qty change..." />
 </div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn btn-primary" onClick={submit}>Save</button>
 </div>
 </div>
 </div>
 );
}
