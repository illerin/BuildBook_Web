import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import PartDetailModal from '../components/PartDetailModal';

const API_BASE = process.env.REACT_APP_API_URL?.replace('/api','') || '';

function thumb(path, size = 48) {
 if (!path) return (
 <div style={{width:size,height:size,background:'#21262d',borderRadius:6,border:'1px dashed #30363d',
 display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.4,flexShrink:0}}></div>
 );
 return <img src={`/files/images/${path}`} alt="" style={{width:size,height:size,objectFit:'cover',borderRadius:6,border:'1px solid #30363d',flexShrink:0}} />;
}

export default function GroupDetail() {
 const { id } = useParams();
 const [group, setGroup] = useState(null);
 const [allCats, setAllCats] = useState([]);
 const [variants, setVariants] = useState([]); // direct variants of this category
 const [subCats, setSubCats] = useState([]); // immediate children
 const [subVariants, setSubVariants] = useState({}); // { [subCatId]: [variants] }
 const [loading, setLoading] = useState(true);
 const [editGroup, setEditGroup] = useState(false);
 const [showVariantModal, setShowVariantModal] = useState(false);
 const [editVariant, setEditVariant] = useState(null);
 const [detailVariant, setDetailVariant] = useState(null);
 const [docVariant, setDocVariant] = useState(null);
 const [adjustVariant, setAdjustVariant] = useState(null);
 const [openSubs, setOpenSubs] = useState({}); // { [subCatId]: bool }
 const fileInputRef = useRef(null);

 const load = useCallback(async () => {
 setLoading(true);
 const [g, v, cats] = await Promise.all([
 api.getGroup(id),
 api.getGroupVariants(id),
 api.getCategoriesFlat()
 ]);
 setGroup(g);
 setVariants(v);
 setAllCats(cats);

 // Find immediate children of this category
 const children = cats.filter(c => c.parent_id === parseInt(id));
 setSubCats(children);

 // Load variants for each subcategory
 if (children.length > 0) {
 const results = await Promise.all(children.map(c => api.getGroupVariants(c.id)));
 const map = {};
 children.forEach((c, i) => { map[c.id] = results[i]; });
 setSubVariants(map);
 }

 setLoading(false);
 }, [id]);

 useEffect(() => { load(); }, [load]);

 const uploadImage = async (e) => {
 const file = e.target.files[0]; if (!file) return;
 const form = new FormData(); form.append('image', file);
 const updated = await api.uploadCategoryImage(id, form);
 setGroup(g => ({ ...g, image_path: updated.image_path }));
 };

 const deleteImage = async () => {
 await api.deleteCategoryImage(id);
 setGroup(g => ({ ...g, image_path: null }));
 };

 const toggleSub = (subId) => setOpenSubs(p => ({ ...p, [subId]: !p[subId] }));

 const reloadSub = async (subId) => {
 const v = await api.getGroupVariants(subId);
 setSubVariants(p => ({ ...p, [subId]: v }));
 };

 if (loading) return <div className="loading">Loading...</div>;
 if (!group) return <div className="empty">Not found</div>;

 // Build breadcrumb
 const crumbs = [];
 let cur = group;
 while (cur) {
 crumbs.unshift(cur);
 cur = allCats.find(c => c.id === cur.parent_id) || null;
 }

 const hasContent = variants.length > 0 || subCats.length > 0;

 return (
 <div>
 <Link to="/inventory" className="back-link">← Inventory</Link>

 {/* Breadcrumb */}
 {crumbs.length > 1 && (
 <div style={{display:'flex', gap:6, alignItems:'center', marginBottom:12, fontSize:13, color:'#8b949e'}}>
 {crumbs.map((c, i) => (
 <React.Fragment key={c.id}>
 {i > 0 && <span>›</span>}
 {i < crumbs.length - 1
 ? <Link to={`/inventory/group/${c.id}`} style={{color:'#58a6ff', textDecoration:'none'}}>{c.name}</Link>
 : <span style={{color:'#e1e4e8'}}>{c.name}</span>}
 </React.Fragment>
 ))}
 </div>
 )}

 {/* Header */}
 <div className="page-header">
 <div style={{display:'flex', alignItems:'center', gap:16}}>
 <div style={{position:'relative', flexShrink:0}}>
 {group.image_path
 ? <img src={`/files/images/${group.image_path}`} alt={group.name}
 style={{width:72, height:72, objectFit:'cover', borderRadius:8, border:'1px solid #30363d', display:'block'}} />
 : <div style={{width:72, height:72, background:'#21262d', borderRadius:8, border:'1px dashed #30363d',
 display:'flex', alignItems:'center', justifyContent:'center', fontSize:28}}></div>
 }
 <div style={{display:'flex', gap:4, marginTop:4, justifyContent:'center'}}>
 <button className="btn btn-secondary btn-sm" style={{padding:'2px 6px', fontSize:11}}
 onClick={() => fileInputRef.current.click()}></button>
 {group.image_path &&
 <button className="btn-icon btn-sm" style={{fontSize:11}} onClick={deleteImage}>×</button>}
 </div>
 <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={uploadImage} />
 </div>
 <div>
 <h1>{group.name}</h1>
 {group.description && <p style={{color:'#8b949e', marginTop:6, fontSize:13}}>{group.description}</p>}
 </div>
 </div>
 <div style={{display:'flex', gap:8}}>
 <button className="btn btn-secondary" onClick={() => setEditGroup(true)}>Edit</button>
 <button className="btn btn-primary" onClick={() => setShowVariantModal(true)}>+ Add Part</button>
 </div>
 </div>

 {!hasContent && <div className="empty">No parts or subcategories yet.</div>}

 {/* Subcategories */}
 {subCats.map(sub => {
 const isOpen = !!openSubs[sub.id];
 const subVars = subVariants[sub.id] || [];
 // Find sub-subcategories
 const subChildren = allCats.filter(c => c.parent_id === sub.id);
 return (
 <div key={sub.id} style={{marginBottom:12}}>
 {/* Subcategory header */}
 <div
 onClick={() => toggleSub(sub.id)}
 style={{
 display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
 background:'#161b22', border:'1px solid #30363d',
 borderRadius: isOpen ? '8px 8px 0 0' : 8,
 cursor:'pointer', userSelect:'none'
 }}
 >
 <span style={{color:'#8b949e', fontSize:12, width:14}}>{isOpen ? '▾' : '▸'}</span>
 {sub.image_path
 ? <img src={`/files/images/${sub.image_path}`} alt="" style={{width:30, height:30, objectFit:'cover', borderRadius:4, border:'1px solid #30363d', flexShrink:0}} />
 : <div style={{width:30, height:30, background:'#21262d', borderRadius:4, border:'1px solid #30363d', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0}}></div>
 }
 <span style={{fontWeight:600, fontSize:14, flex:1}}>{sub.name}</span>
 <span style={{color:'#8b949e', fontSize:12}}>
 {subVars.length} part{subVars.length !== 1 ? 's' : ''}
 {subChildren.length > 0 && ` · ${subChildren.length} subcategory`}
 </span>
 <div style={{display:'flex', gap:6}} onClick={e => e.stopPropagation()}>
 <Link to={`/inventory/group/${sub.id}`} className="btn btn-secondary btn-sm">Open →</Link>
 </div>
 </div>

 {/* Subcategory contents */}
 {isOpen && (
 <div style={{border:'1px solid #30363d', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'hidden'}}>
 {/* Sub-subcategories as simple links */}
 {subChildren.map(sub2 => (
 <div key={sub2.id} style={{
 display:'flex', alignItems:'center', gap:10, padding:'8px 16px',
 borderBottom:'1px solid #21262d', background:'#0d1117'
 }}>
 <span style={{color:'#8b949e', fontSize:12}}></span>
 <Link to={`/inventory/group/${sub2.id}`} style={{color:'#58a6ff', textDecoration:'none', fontSize:13, flex:1}}>
 {sub2.name}
 </Link>
 </div>
 ))}

 {/* Parts in this subcategory */}
 {subVars.length === 0 && subChildren.length === 0 ? (
 <div style={{padding:'12px 16px', color:'#8b949e', fontSize:13}}>
 No parts yet.
 <Link to={`/inventory/group/${sub.id}`} style={{color:'#58a6ff', marginLeft:8, fontSize:13}}>Open to add →</Link>
 </div>
 ) : subVars.length > 0 && (
 <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
 <thead>
 <tr>
 <th style={{width:44, padding:'6px 16px', color:'#8b949e', fontSize:11, textTransform:'uppercase', textAlign:'left'}}></th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', textAlign:'left', padding:'6px 0'}}>Part</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', textAlign:'left'}}>Location</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', textAlign:'left'}}>Avail</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', textAlign:'left'}}>Res</th>
 <th style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', textAlign:'left'}}>On Order</th>
 <th></th>
 </tr>
 </thead>
 <tbody>
 {subVars.map(v => (
 <InlineVariantRow
 key={v.id} v={v}
 onRefresh={() => reloadSub(sub.id)}
 onOpen={() => setDetailVariant(v.id)}
 onEdit={() => { setEditVariant({ ...v, _groupId: sub.id }); }}
 onDocs={() => setDocVariant(v)}
 onAdjust={() => setAdjustVariant(v)}
 />
 ))}
 </tbody>
 </table>
 )}
 </div>
 )}
 </div>
 );
 })}

 {/* Direct variants of this category */}
 {variants.length > 0 && (
 <div>
 {subCats.length > 0 && (
 <div style={{fontSize:11, color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8, marginTop:4}}>
 Parts in this category
 </div>
 )}
 {variants.map(v => (
 <VariantCard key={v.id} variant={v}
 onOpen={() => setDetailVariant(v.id)}
 onEdit={() => setEditVariant(v)}
 onDocs={() => setDocVariant(v)}
 onAdjust={() => setAdjustVariant(v)}
 onRefresh={load}
 />
 ))}
 </div>
 )}

 {/* Modals */}
 {detailVariant && (
 <PartDetailModal
 variantId={detailVariant}
 onClose={() => setDetailVariant(null)}
 onEdit={(p) => { setDetailVariant(null); setEditVariant(p); }}
 />
 )}
 {editGroup && (
 <GroupEditModal group={group} onClose={() => setEditGroup(false)} onSave={() => { setEditGroup(false); load(); }} />
 )}
 {(showVariantModal || editVariant) && (
 <VariantModal
 groupId={editVariant?._groupId || id}
 variant={editVariant}
 onClose={() => { setShowVariantModal(false); setEditVariant(null); }}
 onSave={() => { setShowVariantModal(false); setEditVariant(null); load(); }}
 />
 )}
 {docVariant && <DocModal variant={docVariant} onClose={() => { setDocVariant(null); load(); }} />}
 {adjustVariant && <AdjustModal variant={adjustVariant} onClose={() => setAdjustVariant(null)} />}
 </div>
 );
}

// ── Inline row used in subcategory table ─────────────────────────────────────
function InlineVariantRow({ v, onRefresh, onOpen, onEdit, onDocs, onAdjust }) {
 const qtyClass = n => n < 0 ? 'qty-neg' : n <= 5 ? 'qty-low' : 'qty-ok';

 const deletePart = async () => {
 if (!window.confirm(`Delete "${v.label}"? This cannot be undone.`)) return;
 try { await api.deleteVariant(v.id); onRefresh(); }
 catch (e) { alert(e.message); }
 };

 return (
 <tr style={{borderTop:'1px solid #21262d'}}
 onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
 onMouseLeave={e => e.currentTarget.style.background='transparent'}>
 <td style={{padding:'6px 16px', cursor:'pointer'}} onClick={onOpen}>
 {v.image_path
 ? <img src={`/files/images/${v.image_path}`} alt="" style={{width:30, height:30, objectFit:'cover', borderRadius:4, border:'1px solid #30363d'}} />
 : <div style={{width:30, height:30, background:'#21262d', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14}}></div>
 }
 </td>
 <td style={{padding:'6px 0', cursor:'pointer'}} onClick={onOpen}>
 <span style={{fontWeight:500, color:'#58a6ff'}}>{v.label}</span>
 {v.notes && <span style={{color:'#8b949e', fontSize:11, marginLeft:8}}>{v.notes}</span>}
 {v.product_url && <a href={v.product_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{marginLeft:8, color:'#58a6ff', fontSize:11}}>Link</a>}
 </td>
 <td style={{color:'#8b949e', fontSize:12}}>{v.storage_location || '—'}</td>
 <td className={qtyClass(v.quantity_available)}><strong>{v.quantity_available}</strong></td>
 <td style={{color:'#8b949e'}}>{v.quantity_reserved}</td>
 <td style={{color: v.quantity_on_order > 0 ? '#d29922' : '#8b949e'}}>{v.quantity_on_order}</td>
 <td style={{padding:'6px 12px'}}>
 <div style={{display:'flex', gap:4}}>
 <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
 <button className="btn btn-secondary btn-sm" onClick={onDocs}>Docs</button>
 <button className="btn btn-danger btn-sm" onClick={deletePart}>Delete</button>
 </div>
 </td>
 </tr>
 );
}

// ── Full variant card (for direct children of this category) ─────────────────
function VariantCard({ variant: v, onOpen, onEdit, onDocs, onAdjust, onRefresh }) {
 const qtyClass = n => n < 0 ? 'qty-neg' : n <= 5 ? 'qty-low' : 'qty-ok';

 const deletePart = async () => {
 if (!window.confirm(`Delete "${v.label}"? This cannot be undone.`)) return;
 try { await api.deleteVariant(v.id); onRefresh(); }
 catch (e) { alert(e.message); }
 };

 return (
 <div className="card" style={{cursor:'pointer'}} onClick={onOpen}
 onMouseEnter={e => e.currentTarget.style.borderColor='#58a6ff'}
 onMouseLeave={e => e.currentTarget.style.borderColor='#30363d'}>
 <div className="card-header" onClick={e => e.stopPropagation()}>
 <div style={{display:'flex', alignItems:'center', gap:12}}>
 {thumb(v.image_path)}
 <div>
 <strong style={{fontSize:15}}>{v.label}</strong>
 {v.storage_location && <span style={{color:'#8b949e', marginLeft:10, fontSize:12}}>{v.storage_location}</span>}
 {v.product_url && <a href={v.product_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{marginLeft:10, color:'#58a6ff', fontSize:12}}>Product page</a>}
 </div>
 </div>
 <div style={{display:'flex', gap:6}}>
 <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onDocs(); }}>Docs ({(v.documents||[]).length})</button>
 <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onAdjust(); }}>Log</button>
 <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
 <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); deletePart(); }}>Delete</button>
 </div>
 </div>
 <div style={{display:'flex', gap:24, fontSize:13}}>
 <div><span style={{color:'#8b949e'}}>Available: </span><span className={qtyClass(v.quantity_available)}>{v.quantity_available}</span></div>
 <div><span style={{color:'#8b949e'}}>Reserved: </span>{v.quantity_reserved}</div>
 <div><span style={{color:'#8b949e'}}>On Order: </span><span style={{color: v.quantity_on_order>0?'#d29922':'inherit'}}>{v.quantity_on_order}</span></div>
 </div>
 {v.notes && <p style={{color:'#8b949e', marginTop:8, fontSize:12}}>{v.notes}</p>}
 {(v.documents||[]).length > 0 && (
 <div style={{marginTop:10}}>
 <div className="tags">
 {v.documents.map(d => (
 <span key={d.id} className="tag">
 {d.file_type==='pdf'?'PDF':d.file_type==='image'?'Image':'Text'}
 {d.file_path
 ? <a href={`${API_BASE}/files/documents/${d.file_path}`} target="_blank" rel="noreferrer" style={{color:'#58a6ff', textDecoration:'none'}}>{d.original_filename}</a>
 : d.original_filename}
 </span>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}

// ── Group edit modal ──────────────────────────────────────────────────────────
function GroupEditModal({ group, onClose, onSave }) {
 const [form, setForm] = useState({ name: group.name, description: group.description || '' });
 const [err, setErr] = useState('');
 const submit = async () => {
 try { await api.updateGroup(group.id, form); onSave(); }
 catch (e) { setErr(e.message); }
 };
 return (
 <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
 <div className="modal">
 <h2>Edit Category</h2>
 {err && <div className="alert alert-error">{err}</div>}
 <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} /></div>
 <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} /></div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn btn-primary" onClick={submit}>Save</button>
 </div>
 </div>
 </div>
 );
}

// ── Part add/edit modal ───────────────────────────────────────────────────────
function VariantModal({ groupId, variant, onClose, onSave }) {
 const [form, setForm] = useState(variant
 ? { label: variant.label, quantity_available: variant.quantity_available,
 storage_location: variant.storage_location||'', notes: variant.notes||'',
 product_url: variant.product_url||'', note:'' }
 : { label:'', quantity_available:0, storage_location:'', notes:'', product_url:'', note:'' }
 );
 const [imgPath, setImgPath] = useState(variant?.image_path || null);
 const [err, setErr] = useState('');
 const fileRef = useRef(null);
 const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

 const uploadImg = async (e) => {
 const file = e.target.files[0]; if (!file) return;
 const fd = new FormData(); fd.append('image', file);
 const updated = await api.uploadVariantImage(variant.id, fd);
 setImgPath(updated.image_path);
 };
 const removeImg = async () => { await api.deleteVariantImage(variant.id); setImgPath(null); };

 const submit = async () => {
 if (!form.label) return setErr('Label required');
 try {
 if (variant) await api.updateVariant(variant.id, { ...form, quantity_available: parseInt(form.quantity_available) });
 else await api.createVariant(groupId, { ...form, quantity_available: parseInt(form.quantity_available) });
 onSave();
 } catch (e) { setErr(e.message); }
 };

 return (
 <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
 <div className="modal">
 <h2>{variant ? 'Edit Part' : 'New Part'}</h2>
 {err && <div className="alert alert-error">{err}</div>}

 {variant && (
 <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
 {imgPath
 ? <img src={`/files/images/${imgPath}`} alt="" style={{width:60, height:60, objectFit:'cover', borderRadius:6, border:'1px solid #30363d'}} />
 : <div style={{width:60, height:60, background:'#21262d', borderRadius:6, border:'1px dashed #30363d', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24}}></div>
 }
 <div style={{display:'flex', flexDirection:'column', gap:4}}>
 <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}>{imgPath?'Replace Image':'Add Image'}</button>
 {imgPath && <button className="btn btn-secondary btn-sm" style={{color:'#f85149'}} onClick={removeImg}>Remove</button>}
 <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={uploadImg} />
 </div>
 </div>
 )}

 <div className="form-group"><label>Label *</label><input value={form.label} onChange={e=>f('label',e.target.value)} placeholder="e.g. 10k 0805 1% 0.1W" /></div>
 <div className="form-row">
 <div className="form-group"><label>Qty Available</label><input type="number" value={form.quantity_available} onChange={e=>f('quantity_available',e.target.value)} style={{width:'100%'}} /></div>
 <div className="form-group"><label>Storage Location</label><input value={form.storage_location} onChange={e=>f('storage_location',e.target.value)} /></div>
 </div>
 <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e=>f('notes',e.target.value)} rows={2} /></div>
 <div className="form-group"><label>Product URL</label>
 <div style={{display:'flex', gap:6, alignItems:'center'}}>
 <input value={form.product_url} onChange={e=>f('product_url',e.target.value)} placeholder="https://..." style={{flex:1}} />
 {form.product_url && <a href={form.product_url} target="_blank" rel="noreferrer" style={{color:'#58a6ff', fontSize:12, whiteSpace:'nowrap'}}>Open</a>}
 </div>
 </div>
 {variant && <div className="form-group"><label>Edit Note</label><input value={form.note} onChange={e=>f('note',e.target.value)} placeholder="Reason for qty change..." /></div>}
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn btn-primary" onClick={submit}>Save</button>
 </div>
 </div>
 </div>
 );
}

// ── Docs modal ────────────────────────────────────────────────────────────────
function DocModal({ variant, onClose }) {
 const [docs, setDocs] = useState(variant.documents || []);
 const [tab, setTab] = useState('upload');
 const [file, setFile] = useState(null);
 const [text, setText] = useState('');
 const [textName, setTextName] = useState('');
 const [err, setErr] = useState('');

 const uploadFile = async () => {
 if (!file) return;
 const form = new FormData(); form.append('file', file);
 try { const d = await api.uploadDocument(variant.id, form); setDocs(p=>[...p,d]); setFile(null); }
 catch (e) { setErr(e.message); }
 };
 const addText = async () => {
 if (!text || !textName) return setErr('Name and content required');
 const form = new FormData();
 form.append('file_type','text'); form.append('text_content',text); form.append('original_filename',textName);
 try { const d = await api.uploadDocument(variant.id, form); setDocs(p=>[...p,d]); setText(''); setTextName(''); }
 catch (e) { setErr(e.message); }
 };
 const deleteDoc = async (did) => { await api.deleteDocument(did); setDocs(p=>p.filter(d=>d.id!==did)); };

 return (
 <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
 <div className="modal">
 <h2>Documents — {variant.label}</h2>
 {err && <div className="alert alert-error">{err}</div>}
 <div className="tabs">
 <button className={`tab ${tab==='upload'?'active':''}`} onClick={()=>setTab('upload')}>Upload File</button>
 <button className={`tab ${tab==='text'?'active':''}`} onClick={()=>setTab('text')}>Add Text</button>
 <button className={`tab ${tab==='list'?'active':''}`} onClick={()=>setTab('list')}>Files ({docs.length})</button>
 </div>
 {tab==='upload' && (
 <div>
 <div className="form-group"><label>File</label><input type="file" onChange={e=>setFile(e.target.files[0])} style={{background:'none',border:'none',padding:0}} /></div>
 <button className="btn btn-primary" onClick={uploadFile} disabled={!file}>Upload</button>
 </div>
 )}
 {tab==='text' && (
 <div>
 <div className="form-group"><label>Name</label><input value={textName} onChange={e=>setTextName(e.target.value)} /></div>
 <div className="form-group"><label>Content</label><textarea value={text} onChange={e=>setText(e.target.value)} rows={6} /></div>
 <button className="btn btn-primary" onClick={addText}>Save</button>
 </div>
 )}
 {tab==='list' && (
 docs.length===0 ? <div className="empty">No documents.</div> :
 docs.map(d => (
 <div key={d.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #21262d'}}>
 <span>{d.file_type==='pdf'?'PDF':d.file_type==='image'?'Image':'Text'}
 {d.file_path
 ? <a href={`${API_BASE}/files/documents/${d.file_path}`} target="_blank" rel="noreferrer" style={{color:'#58a6ff'}}>{d.original_filename}</a>
 : d.original_filename}
 </span>
 <button className="btn-icon" onClick={()=>deleteDoc(d.id)}>×</button>
 </div>
 ))
 )}
 <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
 </div>
 </div>
 );
}

// ── Adjustment log modal ──────────────────────────────────────────────────────
function AdjustModal({ variant, onClose }) {
 const [log, setLog] = useState([]);
 useEffect(() => { api.getAdjustments(variant.id).then(setLog); }, [variant.id]);
 return (
 <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
 <div className="modal">
 <h2>Adjustment Log — {variant.label}</h2>
 {log.length===0 ? <div className="empty">No adjustments.</div> :
 <table><thead><tr><th>When</th><th>Change</th><th>Note</th></tr></thead>
 <tbody>{log.map(l=>(
 <tr key={l.id}>
 <td style={{color:'#8b949e',fontSize:12}}>{new Date(l.timestamp).toLocaleString()}</td>
 <td style={{color:l.change_amount>0?'#56d364':'#f85149',fontWeight:700}}>{l.change_amount>0?'+':''}{l.change_amount}</td>
 <td style={{color:'#8b949e'}}>{l.note||'—'}</td>
 </tr>
 ))}</tbody>
 </table>
 }
 <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
 </div>
 </div>
 );
}
