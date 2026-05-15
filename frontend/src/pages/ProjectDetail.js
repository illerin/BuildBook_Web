import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE, api } from '../api/client';
import RichEditor from '../components/RichEditor';
import ModalOverlay from '../components/ModalOverlay';

const STATUS_LABEL = {
  active: 'Active',
  paused: 'Paused',
  waiting: 'Waiting',
  completed: 'Completed',
  archived: 'Archived',
};
const STATUS_BADGE = {
  active: 'badge-green',
  paused: 'badge-gray',
  waiting: 'badge-yellow',
  completed: 'badge-blue',
  archived: 'badge-purple',
};

function imageUrl(path) {
  return path ? `${API_BASE}/files/images/${path}` : '';
}

function projectFileUrl(path) {
  return `${API_BASE}/files/projects/${path}`;
}

function projectFileDownloadUrl(id) {
  return api.downloadProjectFileUrl(id);
}

function documentUrl(path) {
  return `${API_BASE}/files/documents/${path}`;
}

function fileExtension(name) {
  const match = String(name || '').toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : '';
}

function normalizeExtensions(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

function trackerLabel(tracker) {
  const extensions = normalizeExtensions(tracker?.extensions).join('');
  return extensions ? `${tracker.label}-${extensions}` : tracker?.label;
}

function latestFileTypeLabel(value) {
  return String(value || 'Files').replace(/-\.[A-Za-z0-9_.,-]+$/, '');
}

const IMAGE_PREVIEW_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SPREADSHEET_PREVIEW_EXTS = ['.xlsx', '.xls', '.csv', '.tsv'];
const TEXT_PREVIEW_EXTS = [
  '.txt', '.md', '.json', '.xml', '.html', '.css', '.js', '.ts', '.jsx', '.tsx',
  '.ino', '.c', '.cpp', '.h', '.hpp', '.py', '.yaml', '.yml', '.gcode', '.nc',
  '.kicad_pcb', '.kicad_sch', '.sch', '.brd',
];
const MODEL_PREVIEW_EXTS = ['.stl', '.obj'];
const CAD_PREVIEW_EXTS = ['.dxf'];
const CAD_FALLBACK_EXTS = ['.dwg', '.step', '.stp', '.3mf', '.iges', '.igs', '.f3d', '.sldprt', '.sldasm'];

function isViewableFile(file) {
  return !!file;
}

function categoryPath(part) {
  if (!part.category_name) return 'Uncategorized';
  return part.parent_category_name ? `${part.parent_category_name} / ${part.category_name}` : part.category_name;
}

function categoryOptionLabel(category, categories) {
  const byId = new Map(categories.map((cat) => [String(cat.id), cat]));
  const names = [];
  let current = category;
  const seen = new Set();
  while (current && !seen.has(String(current.id))) {
    seen.add(String(current.id));
    names.unshift(current.name || 'Untitled');
    current = current.parent_id ? byId.get(String(current.parent_id)) : null;
  }
  return names.join(' / ');
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState('overview');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [editMeta, setEditMeta] = useState(false);
  const [addPart, setAddPart] = useState(false);
  const imageRef = useRef(null);

  const load = useCallback(async () => setProject(await api.getProject(id)), [id]);
  useEffect(() => { load(); }, [load]);

  const flash = (text, isErr = false) => {
    if (isErr) setErr(text); else setMsg(text);
    setTimeout(() => { setErr(''); setMsg(''); }, 3500);
  };

  const updateStatus = async (status) => {
    const updated = await api.updateProject(id, { ...project, status });
    setProject((p) => ({ ...p, ...updated }));
  };

  const uploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    const updated = await api.uploadProjectImage(id, form);
    setProject((p) => ({ ...p, image_path: updated.image_path }));
  };

  const deleteProject = async () => {
    if (!window.confirm('Delete this project?')) return;
    await api.deleteProject(id);
    navigate('/projects');
  };

  const exportProject = async () => {
    const response = await api.downloadProjectExport(id);
    if (!response.ok) return flash(await response.text(), true);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9._-]+/gi, '_')}-export.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!project) return <div className="loading">Loading...</div>;

  return (
    <div>
      <Link to="/projects" className="back-link">Back to projects</Link>
      {msg && <div className="alert alert-success">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <div className="project-hero">
        <div className="project-image">
          {project.image_path ? <img src={imageUrl(project.image_path)} alt="" /> : <div>Project</div>}
          <button className="btn btn-secondary btn-sm" onClick={() => imageRef.current.click()}>
            {project.image_path ? 'Change Image' : 'Add Image'}
          </button>
          <input ref={imageRef} type="file" accept="image/*" hidden onChange={uploadImage} />
        </div>
        <div className="project-title">
          <h1>{project.name}</h1>
          <div className="status-line">
            <span className={`badge ${STATUS_BADGE[project.status]}`}>{STATUS_LABEL[project.status]}</span>
            <select value={project.status} onChange={(e) => updateStatus(e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="mini-meta">
            <span>{project.parts.length} linked parts</span>
            <span>{project.files.length} files</span>
            <span>{project.steps?.length || 0} step tags</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={exportProject}>Export</button>
          <button className="btn btn-secondary" onClick={() => setEditMeta(true)}>Edit</button>
          <button className="btn btn-danger" onClick={deleteProject}>Delete</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'parts' ? 'active' : ''}`} onClick={() => setTab('parts')}>Parts ({project.parts.length})</button>
        <button className={`tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>Files ({project.files.length})</button>
      </div>

      {tab === 'overview' && <OverviewTab project={project} setProject={setProject} reload={load} flash={flash} />}
      {tab === 'parts' && <PartsTab project={project} onAdd={() => setAddPart(true)} reload={load} />}
      {tab === 'files' && <FilesTab project={project} reload={load} flash={flash} />}

      {editMeta && <ProjectMetaModal project={project} onClose={() => setEditMeta(false)} onSave={() => { setEditMeta(false); load(); }} />}
      {addPart && <AddPartModal project={project} onClose={() => setAddPart(false)} onSave={() => { setAddPart(false); load(); }} />}
    </div>
  );
}

function OverviewTab({ project, setProject, reload, flash }) {
  const [notes, setNotes] = useState(project.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesStatus, setNotesStatus] = useState('Saved');

  useEffect(() => setNotes(project.notes || ''), [project.id, project.notes]);

  const saveNotes = useCallback(async (quiet = false) => {
    setSavingNotes(true);
    try {
      const updated = await api.updateProject(project.id, {
        name: project.name,
        status: project.status,
        notes,
      });
      setProject((p) => ({ ...p, ...updated, notes }));
      setNotesStatus('Saved');
      if (!quiet) flash('Notes saved');
    } catch (e) {
      setNotesStatus('Could not save');
      flash(e.message, true);
    } finally {
      setSavingNotes(false);
    }
  }, [flash, notes, project.id, project.name, project.status, setProject]);

  useEffect(() => {
    if (notes === (project.notes || '')) {
      setNotesStatus('Saved');
      return undefined;
    }
    setNotesStatus('Saving...');
    const timer = setTimeout(() => saveNotes(true), 900);
    return () => clearTimeout(timer);
  }, [notes, project.notes, saveNotes]);

  const uploadNoteImage = async (file) => {
    const form = new FormData();
    form.append('image', file);
    const result = await api.uploadProjectNoteImage(project.id, form);
    return result.url;
  };

  return (
    <div className="dashboard-grid">
      <section className="card notes-card">
        <h3>Project Notes</h3>
        <RichEditor
          value={notes}
          onChange={setNotes}
          saving={savingNotes}
          onUploadImage={uploadNoteImage}
          placeholder="Document wiring, pin choices, firmware notes, problems, and decisions..."
        />
        <div className="autosave-status">{savingNotes ? 'Saving...' : notesStatus}</div>
      </section>
      <div>
        <StepTagsCard project={project} setProject={setProject} />
        <ChecklistCard project={project} setProject={setProject} />
        <LatestFiles files={project.files} />
      </div>
    </div>
  );
}

function StepTagsCard({ project, setProject }) {
  const [definitions, setDefinitions] = useState([]);
  const selected = new Set((project.steps || []).map((step) => step.id));

  useEffect(() => { api.getStepDefinitions().then(setDefinitions); }, []);

  const toggle = async (definition) => {
    if (selected.has(definition.id)) {
      await api.removeProjectStep(project.id, definition.id);
      setProject((p) => ({ ...p, steps: p.steps.filter((step) => step.id !== definition.id) }));
    } else {
      await api.addProjectStep(project.id, { step_definition_id: definition.id });
      setProject((p) => ({ ...p, steps: [...(p.steps || []), definition].sort((a, b) => a.order_index - b.order_index) }));
    }
  };

  return (
    <section className="card">
      <h3>Project Steps</h3>
      <div className="step-button-grid">
        {definitions.map((definition) => (
          <button
            key={definition.id}
            className={`step-button ${selected.has(definition.id) ? 'active' : ''}`}
            onClick={() => toggle(definition)}
          >
            {definition.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function ChecklistCard({ project, setProject }) {
  const [text, setText] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState(new Set());
  const items = project.checklist || [];
  const done = items.filter((item) => item.is_completed).length;
  const openItems = items.filter((item) => !item.is_completed);
  const completedItems = items
    .filter((item) => item.is_completed)
    .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
  const visibleItems = [
    ...openItems,
    ...completedItems.filter((item) => showCompleted || recentlyCompleted.has(item.id)),
  ];

  const add = async () => {
    if (!text.trim()) return;
    const item = await api.addChecklist(project.id, { text, order_index: items.length });
    setProject((p) => ({ ...p, checklist: [...p.checklist, item] }));
    setText('');
  };

  const toggle = async (item) => {
    const nextCompleted = !item.is_completed;
    const updated = await api.updateChecklist(item.id, { is_completed: nextCompleted });
    setProject((p) => ({ ...p, checklist: p.checklist.map((row) => row.id === item.id ? updated : row) }));
    if (nextCompleted) {
      setRecentlyCompleted((prev) => new Set(prev).add(item.id));
      setTimeout(() => {
        setRecentlyCompleted((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 3000);
    } else {
      setRecentlyCompleted((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const remove = async (item) => {
    await api.deleteChecklist(item.id);
    setProject((p) => ({ ...p, checklist: p.checklist.filter((row) => row.id !== item.id) }));
  };

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>Checklist</h3>
        <div className="checklist-actions">
          {items.length > 0 && <span>{done}/{items.length}</span>}
          {completedItems.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCompleted((v) => !v)}>
              {showCompleted ? 'Hide Completed' : `Show Completed (${completedItems.length})`}
            </button>
          )}
        </div>
      </div>
      {items.length > 0 && <div className="progress-bar"><div style={{ width: `${(done / items.length) * 100}%` }} /></div>}
      {items.length === 0 ? <p className="muted">No checklist items.</p> : visibleItems.map((item) => (
        <label key={item.id} className="checklist-item">
          <input type="checkbox" checked={item.is_completed} onChange={() => toggle(item)} />
          <span className={`item-text ${item.is_completed ? 'done' : ''}`}>
            {item.text}
            {item.is_completed && item.completed_at && (
              <small>Completed {new Date(item.completed_at).toLocaleDateString()}</small>
            )}
          </span>
          <button className="btn-icon" onClick={(e) => { e.preventDefault(); remove(item); }}>x</button>
        </label>
      ))}
      {items.length > 0 && visibleItems.length === 0 && (
        <p className="muted">All checklist items are completed.</p>
      )}
      <div className="add-line">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Checklist item..." />
        <button className="btn btn-primary btn-sm" onClick={add}>Add</button>
      </div>
    </section>
  );
}

function LatestFiles({ files }) {
  const latest = files.filter((file) => file.is_latest);
  const groups = latest.reduce((acc, file) => {
    const key = file.file_category || 'Latest';
    acc[key] = [...(acc[key] || []), file];
    return acc;
  }, {});
  return (
    <section className="card">
      <h3>Latest Files</h3>
      {latest.length === 0 ? <p className="muted">Upload files from the Files tab to set the latest version for each type.</p> : Object.entries(groups).map(([category, rows], index) => (
        <div key={category} className={`latest-group latest-color-${index % 6}`}>
          <h4>{latestFileTypeLabel(category)}</h4>
          {rows.map((file) => (
            <a key={file.id} className="latest-file-row" href={projectFileDownloadUrl(file.id)}>
              <strong>{file.original_filename}</strong>
              {file.version_note && <em className="file-note">{file.version_note}</em>}
              <span>{new Date(file.uploaded_at).toLocaleDateString()}</span>
            </a>
          ))}
        </div>
      ))}
    </section>
  );
}

function PartsTab({ project, onAdd, reload }) {
  const [selectedPart, setSelectedPart] = useState(null);

  const remove = async (projectPartId) => {
    await api.removeProjectPart(projectPartId);
    reload();
  };

  const updateQuantity = async (projectPartId, quantity) => {
    await api.updateProjectPart(projectPartId, { quantity });
    reload();
  };

  return (
    <div className="parts-workspace">
      <div>
        <div className="section-toolbar">
          <button className="btn btn-primary" onClick={onAdd}>Link Part</button>
        </div>
        {project.parts.length === 0 ? <div className="empty">No parts linked yet.</div> : (
          <div className="linked-part-grid">
            {project.parts.map((part) => (
              <div
                key={part.project_part_id}
                className="linked-part-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPart(part)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedPart(part)}
              >
                {part.image_path ? <img src={imageUrl(part.image_path)} alt="" /> : <div className="linked-part-placeholder">Part</div>}
                <div>
                  <strong>{part.name}</strong>
                  <span>{categoryPath(part)}</span>
                  <small>Qty {part.quantity || 1}</small>
                  {part.storage_location && <small>{part.storage_location}</small>}
                </div>
                <button className="btn-icon linked-remove" onClick={(e) => { e.stopPropagation(); remove(part.project_part_id); }}>x</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <section className="card build-parts-card">
        <h3>Build Parts</h3>
        {project.parts.length > 0 ? (
          <div className="project-part-qty-list">
            {project.parts.map((part) => (
              <div key={part.project_part_id} className="project-part-qty-row">
                <span>{part.name}</span>
                <div className="qty-stepper">
                  <input
                    type="number"
                    min="1"
                    defaultValue={part.quantity || 1}
                    onBlur={(e) => updateQuantity(part.project_part_id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted">Link parts to build a project-specific quantity list.</p>}
      </section>
      {selectedPart && <PartInfoModal partId={selectedPart.id} projectPartId={selectedPart.project_part_id} onClose={() => setSelectedPart(null)} onRemove={async () => { await remove(selectedPart.project_part_id); setSelectedPart(null); }} />}
    </div>
  );
}

function FilePreview({ file }) {
  if (!file) return null;
  const url = projectFileUrl(file.file_path);
  const ext = fileExtension(file.original_filename);
  if (file.file_type === 'pdf' || ext === '.pdf') {
    return <iframe className="file-preview-frame" title={file.original_filename} src={url} />;
  }
  if (file.file_type === 'image' || IMAGE_PREVIEW_EXTS.includes(ext)) {
    return <img className="file-preview-image" src={url} alt={file.original_filename} />;
  }
  if (MODEL_PREVIEW_EXTS.includes(ext)) {
    return <MeshPreview url={url} filename={file.original_filename} ext={ext} />;
  }
  if (CAD_PREVIEW_EXTS.includes(ext)) {
    return <DxfPreview url={url} filename={file.original_filename} />;
  }
  if (SPREADSHEET_PREVIEW_EXTS.includes(ext)) {
    return <SpreadsheetPreview url={url} filename={file.original_filename} ext={ext} />;
  }
  if (TEXT_PREVIEW_EXTS.includes(ext)) {
    return <TextFilePreview url={url} filename={file.original_filename} />;
  }
  if (CAD_FALLBACK_EXTS.includes(ext)) {
    return (
      <div className="file-preview-empty">
        <strong>{file.original_filename}</strong>
        <p className="muted">This CAD format needs a desktop app or conversion service for a real preview. Use Open to launch or download it.</p>
        <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">Open File</a>
      </div>
    );
  }
  return (
    <div className="file-preview-empty">
      <strong>{file.original_filename}</strong>
      <p className="muted">No built-in preview for this file type yet. It can still be opened from here.</p>
      <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer">Open File</a>
    </div>
  );
}

function SpreadsheetPreview({ url, filename, ext }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load spreadsheet');
        return ext === '.csv' || ext === '.tsv' ? response.text() : response.arrayBuffer();
      })
      .then((data) => {
        if (!alive) return;
        const workbook = ext === '.csv' || ext === '.tsv'
          ? XLSX.read(data, { type: 'string', raw: false, FS: ext === '.tsv' ? '\t' : ',' })
          : XLSX.read(data, { type: 'array' });
        const names = workbook.SheetNames || [];
        const first = names[0] || '';
        const sheetRows = first ? XLSX.utils.sheet_to_json(workbook.Sheets[first], { header: 1, defval: '' }) : [];
        setSheets(names);
        setActiveSheet(first);
        setRows(sheetRows.slice(0, 250));
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [url, ext]);

  const switchSheet = (sheetName) => {
    setActiveSheet(sheetName);
    fetch(url)
      .then((response) => (ext === '.csv' || ext === '.tsv' ? response.text() : response.arrayBuffer()))
      .then((data) => {
        const workbook = ext === '.csv' || ext === '.tsv'
          ? XLSX.read(data, { type: 'string', raw: false, FS: ext === '.tsv' ? '\t' : ',' })
          : XLSX.read(data, { type: 'array' });
        setRows(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }).slice(0, 250));
      })
      .catch((e) => setErr(e.message));
  };

  if (err) return <div className="file-preview-empty"><strong>{filename}</strong><p className="muted">{err}</p></div>;
  const columnCount = Math.max(...rows.map((row) => row.length), 0);
  return (
    <div className="spreadsheet-preview">
      <div className="viewer-toolbar">
        <strong>{filename}</strong>
        {sheets.length > 1 && (
          <select value={activeSheet} onChange={(e) => switchSheet(e.target.value)}>
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

function TextFilePreview({ url, filename }) {
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

function MeshPreview({ url, filename, ext }) {
  const canvasRef = useRef(null);
  const [mesh, setMesh] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState({ rx: -0.55, ry: 0.7, zoom: 1 });
  const dragRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load model');
        return ext === '.obj' ? response.text() : response.arrayBuffer();
      })
      .then((data) => {
        if (!alive) return;
        const parsed = ext === '.obj' ? parseObj(data) : parseStl(data);
        setMesh(parsed);
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [url, ext]);

  useEffect(() => {
    if (!mesh || !canvasRef.current) return;
    drawMesh(canvasRef.current, mesh, view);
  }, [mesh, view]);

  const startDrag = (e) => {
    e.preventDefault();
    dragRef.current = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry };
  };
  const moveDrag = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    e.preventDefault();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const nextRx = drag.rx + dy * 0.01;
    const nextRy = drag.ry + dx * 0.01;
    if (!Number.isFinite(nextRx) || !Number.isFinite(nextRy)) return;
    setView((current) => ({
      ...current,
      ry: nextRy,
      rx: nextRx,
    }));
  };

  if (err) return <div className="file-preview-empty"><strong>{filename}</strong><p className="muted">{err}</p></div>;
  return (
    <div className="file-preview-canvas-wrap">
      <div className="viewer-toolbar">
        <strong>{filename}</strong>
        <button className="btn btn-secondary btn-sm" onClick={() => setView({ rx: -0.55, ry: 0.7, zoom: 1 })}>Reset</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setView((v) => ({ ...v, zoom: Math.min((v.zoom || 1) * 1.2, 8) }))}>Zoom In</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setView((v) => ({ ...v, zoom: Math.max((v.zoom || 1) / 1.2, 0.18) }))}>Zoom Out</button>
      </div>
      <canvas
        ref={canvasRef}
        width="760"
        height="560"
        className="file-preview-canvas"
        onMouseDown={startDrag}
        onMouseMove={moveDrag}
        onMouseUp={() => { dragRef.current = null; }}
        onMouseLeave={() => { dragRef.current = null; }}
      />
    </div>
  );
}

function DxfPreview({ url, filename }) {
  const canvasRef = useRef(null);
  const [entities, setEntities] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load drawing');
        return response.text();
      })
      .then((text) => alive && setEntities(parseDxf(text)))
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [url]);

  useEffect(() => {
    if (entities && canvasRef.current) drawDxf(canvasRef.current, entities);
  }, [entities]);

  if (err) return <div className="file-preview-empty"><strong>{filename}</strong><p className="muted">{err}</p></div>;
  return (
    <div className="file-preview-canvas-wrap">
      <div className="viewer-toolbar">
        <strong>{filename}</strong>
        <span>{entities ? `${entities.length} preview entities` : 'Loading...'}</span>
      </div>
      <canvas ref={canvasRef} width="760" height="560" className="file-preview-canvas" />
    </div>
  );
}

function parseObj(text) {
  const vertices = [];
  const faces = [];
  text.split(/\r?\n/).forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      vertices.push(parts.slice(1, 4).map(Number));
    }
    if (parts[0] === 'f' && parts.length >= 4) {
      const face = parts.slice(1).map((part) => Number(part.split('/')[0]) - 1).filter((n) => Number.isFinite(n));
      for (let i = 1; i < face.length - 1; i += 1) faces.push([face[0], face[i], face[i + 1]]);
    }
  });
  return { vertices, faces };
}

function parseStl(buffer) {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 512)));
  if (/solid[\s\S]*facet\s+normal/i.test(head)) return parseAsciiStl(new TextDecoder().decode(bytes));
  return parseBinaryStl(buffer);
}

function parseAsciiStl(text) {
  const vertices = [];
  const faces = [];
  let face = [];
  const vertexRe = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  let match;
  while ((match = vertexRe.exec(text))) {
    vertices.push([Number(match[1]), Number(match[2]), Number(match[3])]);
    face.push(vertices.length - 1);
    if (face.length === 3) {
      faces.push(face);
      face = [];
    }
  }
  return { vertices, faces };
}

function parseBinaryStl(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const vertices = [];
  const faces = [];
  let offset = 84;
  for (let i = 0; i < count && offset + 50 <= buffer.byteLength; i += 1) {
    offset += 12;
    const face = [];
    for (let v = 0; v < 3; v += 1) {
      vertices.push([
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true),
      ]);
      face.push(vertices.length - 1);
      offset += 12;
    }
    faces.push(face);
    offset += 2;
  }
  return { vertices, faces };
}

function drawMesh(canvas, mesh, view) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  try {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    if (!mesh.vertices.length || !mesh.faces.length) return;

    const bounds = mesh.vertices.reduce((acc, point) => ({
      min: acc.min.map((v, i) => Math.min(v, point[i])),
      max: acc.max.map((v, i) => Math.max(v, point[i])),
    }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2);
    const size = Math.max(...bounds.max.map((v, i) => Math.abs(v - bounds.min[i]))) || 1;
    const safeRx = Number.isFinite(view.rx) ? view.rx : -0.55;
    const safeRy = Number.isFinite(view.ry) ? view.ry : 0.7;
    const safeZoom = Math.min(Math.max(Number.isFinite(view.zoom) ? view.zoom : 1, 0.18), 8);
    const sinX = Math.sin(safeRx);
    const cosX = Math.cos(safeRx);
    const sinY = Math.sin(safeRy);
    const cosY = Math.cos(safeRy);
    const screenScale = Math.min(width, height) * 0.72 * safeZoom;
    const transformed = mesh.vertices.map((point) => {
      const x = (point[0] - center[0]) / size;
      const y = (point[1] - center[1]) / size;
      const z = (point[2] - center[2]) / size;
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      const y1 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;
      return {
        x: x1,
        y: y1,
        z: z2,
        sx: width / 2 + x1 * screenScale,
        sy: height / 2 - y1 * screenScale,
      };
    });

    const light = normalizeVector([-0.35, -0.45, 0.82]);
    const faces = mesh.faces
      .map((face) => {
        const points = face.map((i) => transformed[i]).filter(Boolean);
        if (points.length < 3) return null;
        const normal = faceNormal(points[0], points[1], points[2]);
        const lightValue = Math.max(0.18, Math.abs(dotProduct(normal, light)));
        return {
          face,
          depth: points.reduce((sum, point) => sum + point.z, 0) / points.length,
          lightValue,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.depth - b.depth)
      .slice(-18000);

    faces.forEach(({ face, lightValue }) => {
      const points = face.map((i) => transformed[i]);
      if (points.some((point) => !Number.isFinite(point.sx) || !Number.isFinite(point.sy))) return;
      const base = 72 + Math.round(lightValue * 128);
      ctx.beginPath();
      ctx.moveTo(points[0].sx, points[0].sy);
      ctx.lineTo(points[1].sx, points[1].sy);
      ctx.lineTo(points[2].sx, points[2].sy);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(base * 0.62)}, ${Math.round(base * 0.82)}, ${Math.min(255, base + 36)})`;
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  } catch (e) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#8b949e';
    ctx.fillText('Preview could not render this view. Use Reset to recenter the model.', 20, 32);
  }
}

function normalizeVector(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function faceNormal(a, b, c) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  return normalizeVector([
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  ]);
}

function parseDxf(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) pairs.push([lines[i], lines[i + 1]]);
  const entities = [];
  let current = null;
  pairs.forEach(([code, value]) => {
    if (code === '0') {
      if (current) entities.push(current);
      current = ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'VERTEX'].includes(value) ? { type: value, points: [] } : null;
      return;
    }
    if (!current) return;
    if (code === '10') current.x1 = Number(value);
    if (code === '20') current.y1 = Number(value);
    if (code === '11') current.x2 = Number(value);
    if (code === '21') current.y2 = Number(value);
    if (code === '40') current.r = Number(value);
    if (code === '50') current.start = Number(value);
    if (code === '51') current.end = Number(value);
    if (current.type === 'LWPOLYLINE' && code === '10') current.points.push([Number(value), null]);
    if (current.type === 'LWPOLYLINE' && code === '20' && current.points.length) current.points[current.points.length - 1][1] = Number(value);
  });
  if (current) entities.push(current);
  return entities.filter((entity) => Number.isFinite(entity.x1) || entity.points?.length);
}

function drawDxf(canvas, entities) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);
  const points = [];
  entities.forEach((entity) => {
    if (Number.isFinite(entity.x1)) points.push([entity.x1, entity.y1]);
    if (Number.isFinite(entity.x2)) points.push([entity.x2, entity.y2]);
    (entity.points || []).forEach((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]) && points.push(point));
  });
  if (!points.length) return;
  const minX = Math.min(...points.map((p) => p[0]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  const maxY = Math.max(...points.map((p) => p[1]));
  const scale = Math.min((width - 40) / (maxX - minX || 1), (height - 40) / (maxY - minY || 1));
  const tx = (x) => 20 + (x - minX) * scale;
  const ty = (y) => height - 20 - (y - minY) * scale;
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 1.4;
  entities.forEach((entity) => {
    ctx.beginPath();
    if (entity.type === 'LINE') {
      ctx.moveTo(tx(entity.x1), ty(entity.y1));
      ctx.lineTo(tx(entity.x2), ty(entity.y2));
    } else if (entity.type === 'CIRCLE') {
      ctx.arc(tx(entity.x1), ty(entity.y1), Math.abs(entity.r || 0) * scale, 0, Math.PI * 2);
    } else if (entity.type === 'ARC') {
      ctx.arc(tx(entity.x1), ty(entity.y1), Math.abs(entity.r || 0) * scale, (entity.start || 0) * Math.PI / 180, (entity.end || 0) * Math.PI / 180);
    } else if (entity.type === 'LWPOLYLINE' && entity.points.length) {
      ctx.moveTo(tx(entity.points[0][0]), ty(entity.points[0][1]));
      entity.points.slice(1).forEach((point) => ctx.lineTo(tx(point[0]), ty(point[1])));
    }
    ctx.stroke();
  });
}

function PartInfoModal({ partId, onClose, onRemove }) {
  const [part, setPart] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [selectedPdfId, setSelectedPdfId] = useState('');
  const [expandedPdf, setExpandedPdf] = useState(null);
  const [expandedImage, setExpandedImage] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => setPart(await api.getPart(partId)), [partId]);
  useEffect(() => { load(); }, [load]);

  const pdfDocs = useMemo(() => (part?.documents || []).filter((doc) => (
    doc.file_type === 'pdf' || fileExtension(doc.original_filename) === '.pdf'
  )), [part]);
  const selectedPdf = pdfDocs.find((doc) => String(doc.id) === String(selectedPdfId))
    || pdfDocs.find((doc) => doc.is_primary)
    || pdfDocs[0];

  useEffect(() => {
    if (selectedPdf && !selectedPdfId) setSelectedPdfId(selectedPdf.id);
    if (!selectedPdf && selectedPdfId) setSelectedPdfId('');
  }, [selectedPdf, selectedPdfId]);

  const uploadPdf = async () => {
    if (!pdf) return;
    const form = new FormData();
    form.append('file', pdf);
    await api.uploadPartDocument(partId, form);
    setPdf(null);
    load();
  };

  const deleteDoc = async (doc) => {
    await api.deletePartDocument(doc.id);
    load();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal detail-modal">
        {!part ? <div className="loading">Loading...</div> : (
          <>
            <div className="detail-header">
              <div className="detail-image-slot">
                {part.image_path ? (
                  <button className="detail-image-button" onClick={() => setExpandedImage(true)} aria-label={`Expand image for ${part.name}`}>
                    <img src={imageUrl(part.image_path)} alt="" />
                  </button>
                ) : <div className="detail-placeholder">Part</div>}
              </div>
              <div>
                <span>{categoryPath(part)}</span>
                <h2>{part.name}</h2>
                <p className="muted">{part.storage_location || 'No storage location'}</p>
                {part.product_url && <a className="sub-link" href={part.product_url} target="_blank" rel="noreferrer">Product page</a>}
              </div>
              <div className="detail-actions">
                <button className="btn btn-danger btn-sm" onClick={onRemove}>Unlink</button>
                <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
              </div>
            </div>
            {err && <div className="alert alert-error">{err}</div>}
            <div className="part-detail-layout">
              <div>
                <div className="detail-grid">
                  <section className="card">
                    <h3>Spec Summary</h3>
                    {part.spec_summary ? <pre className="spec-box">{part.spec_summary}</pre> : <p className="muted">No spec summary yet.</p>}
                  </section>
                  <section className="card">
                    <h3>Part Documents</h3>
                {(part.documents || []).length === 0 ? <p className="muted">No documents attached.</p> : part.documents.map((doc) => (
                  <div className={`file-row ${selectedPdf?.id === doc.id ? 'selected-file-row' : ''}`} key={doc.id}>
                    <a href={documentUrl(doc.file_path)} target="_blank" rel="noreferrer">{doc.original_filename}</a>
                    <span>{doc.is_primary ? 'Primary' : doc.file_type}</span>
                    {(doc.file_type === 'pdf' || fileExtension(doc.original_filename) === '.pdf') && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPdfId(doc.id)}>Preview</button>
                        {!doc.is_primary && <button className="btn btn-secondary btn-sm" onClick={async () => { await api.setPrimaryPartDocument(doc.id); load(); }}>Make Primary</button>}
                      </>
                    )}
                    <button className="btn-icon" onClick={() => deleteDoc(doc)}>x</button>
                  </div>
                    ))}
                    <div className="upload-line">
                      <input type="file" accept=".pdf,application/pdf" onChange={(e) => setPdf(e.target.files[0])} />
                      <button className="btn btn-primary btn-sm" disabled={!pdf} onClick={() => uploadPdf().catch((e) => setErr(e.message))}>Attach PDF</button>
                    </div>
                  </section>
                </div>
                <section className="card">
                  <h3>Notes</h3>
                  {part.notes ? <p className="notes-text">{part.notes}</p> : <p className="muted">No notes.</p>}
                </section>
              </div>
              <section className="card part-pdf-card">
                <div className="card-title-row">
                  <h3>PDF Preview</h3>
                  {selectedPdf && <a className="sub-link" href={documentUrl(selectedPdf.file_path)} target="_blank" rel="noreferrer">Open</a>}
                </div>
                {selectedPdf ? (
                  <>
                    {pdfDocs.length > 1 && (
                      <select value={selectedPdf.id} onChange={(e) => setSelectedPdfId(e.target.value)}>
                        {pdfDocs.map((doc) => <option key={doc.id} value={doc.id}>{doc.original_filename}</option>)}
                      </select>
                    )}
                    <button className="pdf-preview-button" onClick={() => setExpandedPdf(selectedPdf)}>
                      <iframe title={selectedPdf.original_filename} src={documentUrl(selectedPdf.file_path)} />
                      <span>Click to expand</span>
                    </button>
                  </>
                ) : (
                  <p className="muted">Attach a PDF datasheet or document to preview it here.</p>
                )}
              </section>
            </div>
            {expandedPdf && (
              <ModalOverlay className="pdf-expanded-overlay" onClose={() => setExpandedPdf(null)}>
                <div className="pdf-expanded-modal">
                  <div className="viewer-toolbar">
                    <strong>{expandedPdf.original_filename}</strong>
                    <a className="btn btn-secondary btn-sm" href={documentUrl(expandedPdf.file_path)} target="_blank" rel="noreferrer">Open</a>
                    <button className="btn btn-secondary btn-sm" onClick={() => setExpandedPdf(null)}>Close</button>
                  </div>
                  <iframe title={expandedPdf.original_filename} src={documentUrl(expandedPdf.file_path)} />
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
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function FilesTab({ project, reload, flash }) {
  const [template, setTemplate] = useState(null);
  const [trackerKey, setTrackerKey] = useState('');
  const [editingTrackers, setEditingTrackers] = useState(false);
  const [files, setFiles] = useState([]);
  const [versionNote, setVersionNote] = useState('');
  const viewableFiles = project.files.filter((file) => file.is_latest && isViewableFile(file));
  const [selectedFileId, setSelectedFileId] = useState(viewableFiles[0]?.id || '');
  const selectedFile = viewableFiles.find((file) => String(file.id) === String(selectedFileId)) || viewableFiles[0];

  useEffect(() => {
    api.getProjectTemplate().then((data) => {
      setTemplate(data);
      setTrackerKey((current) => current || data.file_trackers[0]?.key || '');
    }).catch((e) => flash(e.message, true));
  }, []);

  useEffect(() => {
    if (!selectedFileId && viewableFiles[0]) setSelectedFileId(viewableFiles[0].id);
    if (selectedFileId && !viewableFiles.some((file) => String(file.id) === String(selectedFileId))) {
      setSelectedFileId(viewableFiles[0]?.id || '');
    }
  }, [selectedFileId, viewableFiles]);

  const trackers = template?.file_trackers || [];
  const selectedTracker = trackers.find((tracker) => tracker.key === trackerKey) || trackers[0];
  const accept = selectedTracker ? normalizeExtensions(selectedTracker.extensions).join(',') : '';
  const categories = useMemo(() => {
    return [...new Set(project.files.map((f) => f.file_category || 'Other'))];
  }, [project.files]);

  const upload = async () => {
    if (!files.length) return;
    const form = new FormData();
    files.forEach((item) => form.append('files', item));
    form.append('relative_paths', JSON.stringify(files.map((item) => item.webkitRelativePath || item.name)));
    form.append('version_note', versionNote);
    if (selectedTracker?.key) form.append('tracker_key', selectedTracker.key);
    try {
      await api.uploadProjectFile(project.id, form);
      setFiles([]);
      setVersionNote('');
      reload();
      flash(`${files.length} file${files.length === 1 ? '' : 's'} uploaded and marked latest.`);
    } catch (e) {
      flash(e.message, true);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.original_filename}"?`)) return;
    await api.deleteProjectFile(item.id);
    reload();
  };

  const toggleLatest = async (item) => {
    await api.toggleFileLatest(item.id, !item.is_latest);
    reload();
  };

  return (
    <div className="files-workspace">
      <div>
        <section className="card upload-card">
          <select value={selectedTracker?.key || ''} onChange={(e) => setTrackerKey(e.target.value)}>
            {trackers.map((tracker) => <option key={tracker.key} value={tracker.key}>{trackerLabel(tracker)}</option>)}
          </select>
          <input type="file" accept={accept} multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <label className="btn btn-secondary">
            Folder
            <input
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              hidden
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          <input value={versionNote} onChange={(e) => setVersionNote(e.target.value)} placeholder="Version note, e.g. fixed pinout" />
          <button className="btn btn-primary" disabled={!files.length} onClick={upload}>Upload{files.length > 1 ? ` ${files.length}` : ''}</button>
          <button className="btn btn-secondary" onClick={() => setEditingTrackers(true)}>Edit File Types</button>
        </section>
        {categories.map((cat) => {
          const files = project.files.filter((item) => item.file_category === cat);
          if (files.length === 0) return null;
          return (
            <section key={cat} className="card">
              <h3>{cat}</h3>
              {files.map((item) => (
                <div key={item.id} className="file-row">
                  <a href={projectFileUrl(item.file_path)} target="_blank" rel="noreferrer">{item.original_filename}</a>
                  <a className="btn btn-secondary btn-sm" href={projectFileDownloadUrl(item.id)}>Download</a>
                  <span>{new Date(item.uploaded_at).toLocaleDateString()}</span>
                  {item.version_note && <em className="file-note">{item.version_note}</em>}
                  <button className={`btn btn-sm ${item.is_latest ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleLatest(item)}>
                    {item.is_latest ? 'Latest' : 'Mark Latest'}
                  </button>
                  <button className="btn-icon" onClick={() => remove(item)}>x</button>
                </div>
              ))}
            </section>
          );
        })}
        {project.files.length === 0 && <div className="empty">No files uploaded.</div>}
      </div>
      <section className="card file-viewer-card">
        <div className="card-title-row">
          <h3>File Viewer</h3>
          {selectedFile && <a className="btn btn-primary btn-sm viewer-open-btn" href={projectFileUrl(selectedFile.file_path)} target="_blank" rel="noreferrer">Open File</a>}
        </div>
        {viewableFiles.length > 0 ? (
          <>
            <select value={selectedFile?.id || ''} onChange={(e) => setSelectedFileId(e.target.value)}>
              {viewableFiles.map((file) => (
                <option key={file.id} value={file.id}>{file.file_category}: {file.original_filename}</option>
              ))}
            </select>
            <FilePreview file={selectedFile} />
          </>
        ) : (
          <p className="muted">Mark a project file as latest to preview it here.</p>
        )}
      </section>
      {editingTrackers && (
        <TrackerEditorModal
          template={template}
          onClose={() => setEditingTrackers(false)}
          onSave={(saved) => {
            setTemplate(saved);
            setTrackerKey(saved.file_trackers[0]?.key || '');
            setEditingTrackers(false);
            flash('File types saved.');
          }}
        />
      )}
    </div>
  );
}

function TrackerEditorModal({ template, onClose, onSave }) {
  const [draft, setDraft] = useState(template || { steps: [], default_checklist: [], file_trackers: [] });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (template) setDraft(template);
  }, [template]);

  const updateTracker = (index, key, value) => {
    setDraft((t) => ({
      ...t,
      file_trackers: t.file_trackers.map((tracker, i) => (i === index ? { ...tracker, [key]: value } : tracker)),
    }));
  };

  const save = async () => {
    try {
      const saved = await api.updateProjectTemplate(draft);
      onSave(saved);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal large-modal">
        <h2>Edit Tracked File Types</h2>
        {err && <div className="alert alert-error">{err}</div>}
        {draft.file_trackers.map((tracker, index) => (
          <div className="tracker-row" key={`${tracker.key || 'tracker'}-${index}`}>
            <input value={tracker.label} onChange={(e) => updateTracker(index, 'label', e.target.value)} placeholder="Drawings" />
            <input value={tracker.extensions} onChange={(e) => updateTracker(index, 'extensions', e.target.value)} placeholder=".dwg,.dxf" />
            <button className="btn-icon" onClick={() => setDraft((t) => ({ ...t, file_trackers: t.file_trackers.filter((_, i) => i !== index) }))}>x</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setDraft((t) => ({ ...t, file_trackers: [...t.file_trackers, { label: '', extensions: '' }] }))}>Add File Type</button>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save File Types</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ProjectMetaModal({ project, onClose, onSave }) {
  const [form, setForm] = useState({ name: project.name, status: project.status });
  const [err, setErr] = useState('');

  const save = async () => {
    if (!form.name.trim()) return setErr('Name is required');
    await api.updateProject(project.id, { ...project, ...form });
    onSave();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal">
        <h2>Edit Project</h2>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="form-group">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} autoFocus />
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function AddPartModal({ project, onClose, onSave }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCategories()
      .then(setCategories)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        setParts(await api.getParts({ search, category }));
      } catch (e) {
        setError(e.message);
        setParts([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, category]);

  const linkPart = async (part) => {
    await api.addProjectPart(project.id, { part_id: part.id });
    onSave();
  };

  const already = new Set(project.parts.map((part) => part.id));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal large-modal">
        <h2>Link Part</h2>
        <div className="form-group">
          <label>Search parts</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus placeholder="Board, MCU, regulator..." />
        </div>
        <div className="form-group">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{categoryOptionLabel(cat, categories)}</option>)}
          </select>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="loading">Loading...</div> : (
          <div className="pick-list">
            {parts.map((part) => (
              <button key={part.id} disabled={already.has(part.id)} onClick={() => linkPart(part)}>
                {part.image_path ? <img src={imageUrl(part.image_path)} alt="" /> : <span />}
                <div>
                  <strong>{part.name}</strong>
                  <small>{categoryPath(part)} - {part.storage_location || 'No location'}</small>
                </div>
                <em>{already.has(part.id) ? 'Linked' : 'Link'}</em>
              </button>
            ))}
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
