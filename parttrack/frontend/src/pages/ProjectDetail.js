import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const STATUS_OPTIONS = ['active','waiting_on_part','paused','completed','cancelled'];
const STATUS_LABEL = { active:'Active', waiting_on_part:'Waiting on Part', paused:'Paused', completed:'Completed', cancelled:'Cancelled' };
const STATUS_BADGE = { active:'badge-green', waiting_on_part:'badge-yellow', paused:'badge-gray', completed:'badge-blue', cancelled:'badge-red' };
const FILE_CATEGORIES = [
  { key: 'drawing', label: 'Drawing Files' },
  { key: 'program', label: 'Program Files' },
  { key: 'pcb',     label: 'PCB Files' },
  { key: 'other',   label: 'Other Files' },
];
const API_BASE = process.env.REACT_APP_API_URL?.replace('/api','') || '';

function fileUrl(f) { return `${API_BASE}/files/projects/${f.file_path}`; }

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [stepDefs, setStepDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [editMeta, setEditMeta] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [addPartModal, setAddPartModal] = useState(false);
  const imgRef = useRef(null);

  const load = useCallback(async () => {
    const [p, sd] = await Promise.all([api.getProject(id), api.getStepDefs()]);
    setProject(p); setStepDefs(sd); setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const flash = (m, isErr) => {
    if (isErr) setErr(m); else setMsg(m);
    setTimeout(() => { setErr(''); setMsg(''); }, 3000);
  };

  const updateStatus = async (status) => {
    try {
      await api.updateProject(id, { ...project, status });
      setProject(p => ({ ...p, status }));
      flash(`Status updated to ${STATUS_LABEL[status]}`);
      if (status === 'completed' || status === 'cancelled') load();
    } catch(e) { flash(e.message, true); }
  };

  const uploadImage = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const form = new FormData(); form.append('image', file);
    try {
      const updated = await api.uploadProjectImage(id, form);
      setProject(p => ({ ...p, image_path: updated.image_path }));
    } catch(e) { flash(e.message, true); }
    e.target.value = '';
  };

  const removeImage = async () => {
    await api.deleteProjectImage(id);
    setProject(p => ({ ...p, image_path: null }));
  };

  const deleteProject = async () => {
    if (!window.confirm('Delete this project?')) return;
    await api.deleteProject(id);
    navigate('/projects');
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!project) return <div className="empty">Not found</div>;

  const files = project.files || [];

  return (
    <div>
      <Link to="/projects" className="back-link">← Projects</Link>
      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      {/* Header */}
      <div className="page-header">
        <div style={{display:'flex', alignItems:'center', gap:16}}>
          {/* Project image */}
          <div style={{flexShrink:0, position:'relative'}}>
            {project.image_path
              ? <img src={`/files/images/${project.image_path}`} alt=""
                  style={{width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #30363d', display:'block'}} />
              : <div style={{width:80, height:80, background:'#21262d', borderRadius:8, border:'1px dashed #30363d',
                  display:'flex', alignItems:'center', justifyContent:'center', color:'#8b949e', fontSize:11, textAlign:'center', padding:8}}>
                  No image
                </div>
            }
            <div style={{display:'flex', gap:4, marginTop:4, justifyContent:'center'}}>
              <button className="btn btn-secondary btn-sm" style={{padding:'2px 8px', fontSize:11}}
                onClick={() => imgRef.current.click()}>
                {project.image_path ? 'Change' : 'Add Image'}
              </button>
              {project.image_path && (
                <button className="btn btn-secondary btn-sm" style={{padding:'2px 6px', fontSize:11, color:'#f85149'}}
                  onClick={removeImage}>×</button>
              )}
            </div>
            <input ref={imgRef} type="file" accept="image/*" style={{display:'none'}} onChange={uploadImage} />
          </div>

          {/* Title + status */}
          <div>
            <h1 style={{marginBottom:6}}>{project.name}</h1>
            <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <span className={`badge ${STATUS_BADGE[project.status]}`}>{STATUS_LABEL[project.status]}</span>
              <select value={project.status} onChange={e => updateStatus(e.target.value)}
                style={{background:'#21262d', color:'#e1e4e8', border:'1px solid #30363d', borderRadius:6,
                  padding:'4px 8px', fontSize:12, cursor:'pointer'}}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-secondary" onClick={() => setEditMeta(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={deleteProject}>Delete</button>
        </div>
      </div>

      {/* Step tags */}
      {project.steps?.length > 0 && (
        <div style={{marginBottom:16}}>
          <div className="tags">
            {project.steps.map(s => (
              <span key={s.step_definition_id} className={`tag ${s.is_primary ? 'tag-primary' : ''}`}>
                {s.name}{s.is_primary ? ' ★' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab==='overview'?'active':''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab==='parts'?'active':''}`} onClick={() => setTab('parts')}>
          Parts ({(project.parts||[]).length})
        </button>
        <button className={`tab ${tab==='files'?'active':''}`} onClick={() => setTab('files')}>
          Files ({files.length})
        </button>
        <button className={`tab ${tab==='steps'?'active':''}`} onClick={() => setTab('steps')}>Steps</button>
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <OverviewTab project={project} files={files} onUpdate={setProject} onRefresh={load} flash={flash} />
      )}

      {/* Parts tab */}
      {tab === 'parts' && (
        <PartsTab project={project} onAdd={() => setAddPartModal(true)} onRemove={async (ppId) => {
          try { await api.removeProjectPart(ppId); flash('Part removed'); load(); }
          catch(e) { flash(e.message, true); }
        }} />
      )}

      {/* Files tab */}
      {tab === 'files' && (
        <FilesTab projectId={id} files={files} onRefresh={load} flash={flash} />
      )}

      {/* Steps tab */}
      {tab === 'steps' && (
        <StepsTab project={project} stepDefs={stepDefs} onUpdate={setProject} />
      )}

      {editMeta && (
        <EditMetaModal project={project} onClose={() => setEditMeta(false)} onSave={() => { setEditMeta(false); load(); }} />
      )}
      {addPartModal && (
        <AddPartModal projectId={id} onClose={() => setAddPartModal(false)} onSave={() => { setAddPartModal(false); load(); }} />
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ project, files, onUpdate, onRefresh, flash }) {
  const [newItem, setNewItem] = useState('');

  const addCheck = async () => {
    if (!newItem.trim()) return;
    const item = await api.addChecklist(project.id, { text: newItem, order_index: (project.checklist||[]).length });
    onUpdate(p => ({ ...p, checklist: [...(p.checklist||[]), item] }));
    setNewItem('');
  };

  const toggleCheck = async (item) => {
    const updated = await api.updateChecklist(item.id, { is_completed: !item.is_completed });
    onUpdate(p => ({ ...p, checklist: p.checklist.map(c => c.id===item.id ? updated : c) }));
  };

  const deleteCheck = async (cid) => {
    await api.deleteChecklist(cid);
    onUpdate(p => ({ ...p, checklist: p.checklist.filter(c => c.id!==cid) }));
  };

  const checklist = project.checklist || [];
  const done = checklist.filter(c => c.is_completed).length;

  // Latest files grouped by category
  const latestByCategory = {};
  FILE_CATEGORIES.forEach(cat => {
    const latest = files.filter(f => f.file_category === cat.key && f.is_latest);
    if (latest.length > 0) latestByCategory[cat.key] = latest;
  });
  const hasLatest = Object.keys(latestByCategory).length > 0;

  return (
    <div className="grid-2" style={{gap:16, alignItems:'start'}}>
      {/* Left column */}
      <div>
        {/* Description */}
        <div className="card">
          <h3 style={{marginBottom:8}}>Description</h3>
          {project.description
            ? <p style={{color:'#c9d1d9', fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap'}}>{project.description}</p>
            : <p style={{color:'#8b949e', fontSize:13}}>No description.</p>
          }
        </div>

        {/* Latest files */}
        <div className="card">
          <h3 style={{marginBottom:12}}>Latest Files</h3>
          {!hasLatest ? (
            <p style={{color:'#8b949e', fontSize:13}}>
              No files tagged as latest yet. Upload files in the Files tab and mark them as latest.
            </p>
          ) : (
            FILE_CATEGORIES.filter(cat => latestByCategory[cat.key]).map(cat => (
              <div key={cat.key} style={{marginBottom:12}}>
                <div style={{fontSize:11, color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:6}}>
                  {cat.label}
                </div>
                {latestByCategory[cat.key].map(f => (
                  <FileRow key={f.id} file={f} showLatestBadge={false} />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right column — Checklist */}
      <div className="card">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
          <h3>Checklist</h3>
          {checklist.length > 0 && (
            <span style={{fontSize:12, color:'#8b949e'}}>{done}/{checklist.length} done</span>
          )}
        </div>

        {checklist.length === 0
          ? <p style={{color:'#8b949e', fontSize:13, marginBottom:12}}>No checklist items yet.</p>
          : (
            <div style={{marginBottom:12}}>
              {/* Progress bar */}
              {checklist.length > 0 && (
                <div style={{height:4, background:'#21262d', borderRadius:2, marginBottom:12, overflow:'hidden'}}>
                  <div style={{
                    height:'100%', borderRadius:2,
                    background: done === checklist.length ? '#238636' : '#58a6ff',
                    width: `${(done/checklist.length)*100}%`,
                    transition:'width 0.3s ease'
                  }} />
                </div>
              )}
              {checklist.map(item => (
                <div key={item.id} className="checklist-item">
                  <input type="checkbox" checked={item.is_completed} onChange={() => toggleCheck(item)} />
                  <span className={`item-text ${item.is_completed ? 'done' : ''}`}>{item.text}</span>
                  <button className="btn-icon" onClick={() => deleteCheck(item.id)}>×</button>
                </div>
              ))}
            </div>
          )
        }

        {/* Add item */}
        <div style={{display:'flex', gap:8}}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key==='Enter' && addCheck()}
            placeholder="Add item..." style={{flex:1, fontSize:13}} />
          <button className="btn btn-primary btn-sm" onClick={addCheck}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Parts Tab ─────────────────────────────────────────────────────────────────
function PartsTab({ project, onAdd, onRemove }) {
  const parts = project.parts || [];
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="btn btn-primary btn-sm" onClick={onAdd}>+ Reserve Part</button>
      </div>
      {parts.length === 0
        ? <div className="empty">No parts reserved.</div>
        : (
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <table>
              <thead>
                <tr>
                  <th style={{width:44}}></th>
                  <th>Category</th>
                  <th>Part</th>
                  <th>Location</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => {
                  const imgPath = p.variant_image_path || p.group_image_path;
                  const catPath = p.parent_name ? `${p.parent_name} › ${p.group_name}` : p.group_name;
                  return (
                    <tr key={p.id}>
                      <td>
                        {imgPath
                          ? <img src={`/files/images/${imgPath}`} alt="" style={{width:32, height:32, objectFit:'cover', borderRadius:4, border:'1px solid #30363d'}} />
                          : <div style={{width:32, height:32, background:'#21262d', borderRadius:4}} />
                        }
                      </td>
                      <td style={{fontSize:13}}>
                        <Link to={`/inventory/group/${p.part_group_id}`} style={{color:'#58a6ff', textDecoration:'none'}}>{catPath}</Link>
                      </td>
                      <td style={{fontWeight:500}}>{p.label}</td>
                      <td style={{color:'#8b949e', fontSize:12}}>{p.storage_location || '—'}</td>
                      <td style={{color:'#d29922'}}>{p.quantity}</td>
                      <td style={{color: p.quantity_available<0?'#f85149':p.quantity_available<=5?'#d29922':'#56d364'}}>
                        {p.quantity_available}
                      </td>
                      <td>
                        <button className="btn-icon" onClick={() => onRemove(p.id)} title="Remove reservation">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

// ── Files Tab ─────────────────────────────────────────────────────────────────
function FilesTab({ projectId, files, onRefresh, flash }) {
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState('drawing');

  const upload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('file_category', uploadCat);
      await api.uploadProjectFile(projectId, form);
      onRefresh();
    } catch(err) { flash(err.message, true); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const toggleLatest = async (f) => {
    try {
      await api.toggleFileLatest(f.id, !f.is_latest);
      onRefresh();
    } catch(err) { flash(err.message, true); }
  };

  const deleteFile = async (f) => {
    if (!window.confirm(`Delete "${f.original_filename}"?`)) return;
    try { await api.deleteProjectFile(f.id); onRefresh(); }
    catch(err) { flash(err.message, true); }
  };

  return (
    <div>
      {/* Upload bar */}
      <div className="card" style={{padding:'12px 16px'}}>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <select value={uploadCat} onChange={e => setUploadCat(e.target.value)}
            style={{background:'#21262d', color:'#e1e4e8', border:'1px solid #30363d', borderRadius:6, padding:'6px 10px', fontSize:13}}>
            {FILE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <label className="btn btn-primary btn-sm" style={{cursor:'pointer'}}>
            {uploading ? 'Uploading...' : '+ Upload File'}
            <input type="file" style={{display:'none'}} onChange={upload} disabled={uploading} />
          </label>
          <span style={{color:'#8b949e', fontSize:12}}>Tag files as "Latest" to show them on the Overview tab.</span>
        </div>
      </div>

      {/* Files by category */}
      {FILE_CATEGORIES.map(cat => {
        const catFiles = files.filter(f => f.file_category === cat.key);
        if (catFiles.length === 0) return null;
        return (
          <div key={cat.key} className="card">
            <h3 style={{marginBottom:12}}>{cat.label}</h3>
            {catFiles.map(f => (
              <div key={f.id} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 0',
                borderBottom:'1px solid #21262d'
              }}>
                <div style={{flex:1, minWidth:0}}>
                  <a href={fileUrl(f)} target="_blank" rel="noreferrer"
                    style={{color:'#58a6ff', textDecoration:'none', fontSize:13}}>
                    {f.original_filename}
                  </a>
                  <span style={{color:'#8b949e', fontSize:11, marginLeft:8}}>
                    {new Date(f.uploaded_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={() => toggleLatest(f)}
                  style={{
                    background: f.is_latest ? '#1f3a5a' : '#21262d',
                    color: f.is_latest ? '#58a6ff' : '#8b949e',
                    border: `1px solid ${f.is_latest ? '#58a6ff' : '#30363d'}`,
                    borderRadius:4, padding:'3px 10px', fontSize:11, cursor:'pointer',
                    fontWeight: f.is_latest ? 600 : 400, whiteSpace:'nowrap'
                  }}
                >
                  {f.is_latest ? 'Latest' : 'Mark Latest'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteFile(f)}>Delete</button>
              </div>
            ))}
          </div>
        );
      })}

      {files.length === 0 && <div className="empty">No files uploaded yet.</div>}
    </div>
  );
}

// ── Steps Tab ─────────────────────────────────────────────────────────────────
function StepsTab({ project, stepDefs, onUpdate }) {
  const toggleStep = async (sd) => {
    const existing = project.steps.find(s => s.step_definition_id === sd.id);
    if (existing) {
      await api.removeProjectStep(project.id, sd.id);
      onUpdate(p => ({ ...p, steps: p.steps.filter(s => s.step_definition_id !== sd.id) }));
    } else {
      const ns = await api.addProjectStep(project.id, { step_definition_id: sd.id, is_primary: false });
      onUpdate(p => ({ ...p, steps: [...p.steps, { ...ns, name: sd.name }] }));
    }
  };

  const togglePrimary = async (step) => {
    await api.addProjectStep(project.id, { step_definition_id: step.step_definition_id, is_primary: !step.is_primary });
    onUpdate(p => ({ ...p, steps: p.steps.map(s =>
      s.step_definition_id === step.step_definition_id ? { ...s, is_primary: !s.is_primary } : s
    )}));
  };

  return (
    <div className="card">
      <p style={{color:'#8b949e', fontSize:13, marginBottom:14}}>
        Click a step to toggle it. Click ★ to mark as primary step.
      </p>
      <div className="tags" style={{gap:8}}>
        {stepDefs.map(sd => {
          const active = project.steps.find(s => s.step_definition_id === sd.id);
          return (
            <span key={sd.id}
              className={`tag ${active?.is_primary ? 'tag-primary' : ''}`}
              style={{cursor:'pointer', userSelect:'none', opacity: active ? 1 : 0.4, fontSize:13, padding:'5px 12px'}}
              onClick={() => toggleStep(sd)}>
              {sd.name}
              {active && (
                <button style={{marginLeft:6, cursor:'pointer', background:'none', border:'none', padding:0,
                  color: active.is_primary ? '#58a6ff' : '#8b949e', fontSize:13}}
                  onClick={e => { e.stopPropagation(); togglePrimary(active); }}>
                  {active.is_primary ? '★' : '☆'}
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── File row component (used in overview) ─────────────────────────────────────
function FileRow({ file: f }) {
  return (
    <div style={{display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid #21262d'}}>
      <a href={fileUrl(f)} target="_blank" rel="noreferrer"
        style={{color:'#58a6ff', textDecoration:'none', fontSize:13, flex:1, minWidth:0,
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
        {f.original_filename}
      </a>
      <span style={{color:'#8b949e', fontSize:11, whiteSpace:'nowrap'}}>
        {new Date(f.uploaded_at).toLocaleDateString()}
      </span>
    </div>
  );
}

// ── Edit project meta modal ───────────────────────────────────────────────────
function EditMetaModal({ project, onClose, onSave }) {
  const [form, setForm] = useState({ name: project.name, description: project.description || '' });
  const [err, setErr] = useState('');
  const submit = async () => {
    try { await api.updateProject(project.id, { ...project, ...form }); onSave(); }
    catch(e) { setErr(e.message); }
  };
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Edit Project</h2>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="form-group"><label>Name</label>
          <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} />
        </div>
        <div className="form-group"><label>Description</label>
          <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))}
            rows={5} placeholder="Project description, goals, notes..." />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Add part modal ────────────────────────────────────────────────────────────
function AddPartModal({ projectId, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState('');
  const debounceRef = useRef(null);

  const handleSearch = (q) => {
    setSearch(q); setSelected(null);
    clearTimeout(debounceRef.current);
    if (q.length < 1) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const vs = await api.getVariants({ search: q });
      setResults(vs);
    }, 250);
  };

  const pick = (v) => {
    setSelected(v);
    const catPath = v.parent_name ? `${v.parent_name} › ${v.group_name}` : v.group_name;
    setSearch(`${catPath} — ${v.label}`);
    setResults([]);
  };

  const submit = async () => {
    if (!selected) return setErr('Select a part');
    try { await api.addProjectPart(projectId, { part_variant_id: selected.id, quantity: qty }); onSave(); }
    catch(e) { setErr(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Reserve Part</h2>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="form-group">
          <label>Search Part</label>
          <div style={{position:'relative'}}>
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Type to search..." style={{width:'100%'}} />
            {results.length > 0 && !selected && (
              <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#0d1117',
                border:'1px solid #30363d', borderRadius:6, zIndex:20, maxHeight:240, overflowY:'auto', marginTop:2}}>
                {results.map(v => {
                  const imgPath = v.variant_image_path || v.group_image_path || v.parent_image_path;
                  const catPath = v.parent_name ? `${v.parent_name} › ${v.group_name}` : v.group_name;
                  return (
                    <div key={v.id} onClick={() => pick(v)}
                      style={{padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #21262d',
                        display:'flex', alignItems:'center', gap:10}}
                      onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      {imgPath
                        ? <img src={`/files/images/${imgPath}`} alt="" style={{width:28, height:28, objectFit:'cover', borderRadius:4, flexShrink:0}} />
                        : <div style={{width:28, height:28, background:'#21262d', borderRadius:4, flexShrink:0}} />
                      }
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:11, color:'#8b949e'}}>{catPath}</div>
                        <div style={{fontWeight:500, fontSize:13}}>{v.label}</div>
                      </div>
                      <span style={{color: v.quantity_available<0?'#f85149':v.quantity_available<=5?'#d29922':'#56d364', fontSize:12, flexShrink:0}}>
                        {v.quantity_available} avail
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {selected && (
          <div style={{display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
            background:'#1c2128', borderRadius:6, marginBottom:12, border:'1px solid #30363d'}}>
            {(() => {
              const img = selected.variant_image_path || selected.group_image_path || selected.parent_image_path;
              return img ? <img src={`/files/images/${img}`} alt="" style={{width:40, height:40, objectFit:'cover', borderRadius:4}} /> : null;
            })()}
            <div style={{flex:1}}>
              <div style={{fontSize:11, color:'#8b949e'}}>
                {selected.parent_name ? `${selected.parent_name} › ${selected.group_name}` : selected.group_name}
              </div>
              <div style={{fontWeight:600}}>{selected.label}</div>
              {selected.storage_location && <div style={{fontSize:11, color:'#8b949e'}}>{selected.storage_location}</div>}
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:11, color:'#8b949e'}}>Available</div>
              <div style={{color: selected.quantity_available<0?'#f85149':selected.quantity_available<=5?'#d29922':'#56d364', fontWeight:700}}>
                {selected.quantity_available}
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Quantity</label>
          <input type="number" min={1} value={qty} onChange={e => setQty(parseInt(e.target.value)||1)} style={{width:100}} />
        </div>

        {selected && qty > selected.quantity_available && (
          <div className="alert alert-error" style={{marginBottom:12}}>
            Warning: Reserving {qty} but only {selected.quantity_available} available — inventory will go negative.
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!selected}>Reserve</button>
        </div>
      </div>
    </div>
  );
}
