import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE, api } from '../api/client';

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

function categoryDepth(label) {
  return String(label || '').split('/').filter(Boolean).length - 1;
}

function sortedCategoryOptions(categories = []) {
  return [...categories].sort((a, b) => a.label.localeCompare(b.label));
}

function categoryOptionText(category) {
  const depth = categoryDepth(category.label);
  return `${'  '.repeat(depth)}${depth > 0 ? '- ' : ''}${category.name}`;
}

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    setLoading(true);
    setProjects(await api.getProjects());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = projects.filter((project) => {
    if (filter === 'all') return true;
    if (filter === 'open') return project.status !== 'archived';
    return project.status === filter;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="page-subtitle">Your build notebook: notes, parts, files, checklist, and the next thing to do.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>Import Project</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>New Project</button>
        </div>
      </div>

      <div className="filters">
        {['open', 'all', 'active', 'waiting', 'paused', 'completed', 'archived'].map((key) => (
          <button
            key={key}
            className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(key)}
          >
            {key === 'open' ? 'Open' : key === 'all' ? 'All' : STATUS_LABEL[key]}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">Loading...</div> :
        visible.length === 0 ? <div className="empty">No projects yet.</div> : (
          <div className="item-grid">
            {visible.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
        )
      }

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
      {showImport && <ImportProjectModal onClose={() => setShowImport(false)} onImported={load} />}
    </div>
  );
}

function ProjectCard({ project }) {
  const progress = project.checklist_total > 0
    ? Math.round((project.checklist_done / project.checklist_total) * 100)
    : null;
  const steps = project.steps || [];

  return (
    <Link to={`/projects/${project.id}`} className="project-card">
      <div className="project-card-image">
        {project.image_path ? <img src={`${API_BASE}/files/images/${project.image_path}`} alt="" /> : <div>Project</div>}
        <span className={`badge ${STATUS_BADGE[project.status]}`}>{STATUS_LABEL[project.status]}</span>
      </div>
      <div className="project-card-body">
        <strong>{project.name}</strong>
        {steps.length > 0 && (
          <div className="project-step-tags">
            {steps.slice(0, 4).map((step) => <span key={step.id}>{step.name}</span>)}
            {steps.length > 4 && <span>+{steps.length - 4}</span>}
          </div>
        )}
        <div className="mini-meta">
          <span>{project.part_count} parts</span>
          <span>{project.checklist_done}/{project.checklist_total} tasks</span>
        </div>
        {progress !== null && (
          <div className="progress-bar">
            <div style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

function NewProjectModal({ onClose }) {
  const [form, setForm] = useState({ name: '', status: 'active', notes: '' });
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const create = async () => {
    if (!form.name.trim()) return setErr('Name is required');
    const project = await api.createProject(form);
    navigate(`/projects/${project.id}`);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>New Project</h2>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="form-group">
          <label>Name</label>
          <input value={form.name} autoFocus onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && create()} />
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="waiting">Waiting</option>
            <option value="paused">Paused</option>
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={create}>Create</button>
        </div>
      </div>
    </div>
  );
}

function ImportProjectModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [categoryMap, setCategoryMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const previewImport = async () => {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await api.previewProjectImport(form);
      const defaults = {};
      data.category_matches.forEach((match) => {
        defaults[match.exported_category] = String(match.exact_category_id || match.suggested_category_id || '__create__');
      });
      setPreview(data);
      setCategoryMap(defaults);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!preview) return;
    setBusy(true);
    setErr('');
    try {
      const result = await api.commitProjectImport({
        token: preview.token,
        category_map: categoryMap,
      });
      await onImported();
      navigate(`/projects/${result.project.id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const selectLabel = (match) => {
    const suggested = preview.categories.find((cat) => String(cat.id) === String(match.suggested_category_id));
    if (match.exact_category_id) return 'Exact match found';
    return suggested ? `Suggested: ${suggested.label}` : 'No local suggestion';
  };
  const categoryMatchesByLabel = new Map((preview?.category_matches || []).map((match) => [match.exported_category, match]));
  const categoryOptions = sortedCategoryOptions(preview?.categories || []);
  const categoryRank = (part) => {
    if (!part.category_label || part.category_label === 'Uncategorized') return 1;
    const match = categoryMatchesByLabel.get(part.category_label);
    if (!match || (!match.exact_category_id && !match.suggested_category_id)) return 0;
    if (!match.exact_category_id && match.suggested_category_id) return 2;
    return 3;
  };
  const sortedParts = [...(preview?.parts || [])].sort((a, b) => (
    categoryRank(a) - categoryRank(b)
    || String(a.category_label || '').localeCompare(String(b.category_label || ''))
    || a.name.localeCompare(b.name)
  ));
  const categoryStatus = (part) => {
    const match = categoryMatchesByLabel.get(part.category_label);
    if (!part.category_label || part.category_label === 'Uncategorized') return { label: 'Unassigned', badge: 'badge-gray', detail: 'No exported category. Choose a category if you want to file it now.' };
    if (!match || (!match.exact_category_id && !match.suggested_category_id)) return { label: 'No suggestion', badge: 'badge-yellow', detail: 'Choose where this part belongs' };
    if (!match.exact_category_id && match.suggested_category_id) return { label: 'Suggested', badge: 'badge-blue', detail: selectLabel(match) };
    return { label: 'Exact match', badge: 'badge-green', detail: selectLabel(match) };
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal large-modal">
        <div className="card-header">
          <h2>Import Project</h2>
          <button className="btn-icon" onClick={onClose}>x</button>
        </div>
        {err && <div className="alert alert-error">{err}</div>}

        {!preview ? (
          <>
            <p className="muted">
              Import a ProjectTrack export zip to recreate the project notes, latest files, checklist, step tags, linked parts, datasheets, and part details.
            </p>
            <div className="upload-line">
              <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files[0])} />
              <button className="btn btn-primary" disabled={!file || busy} onClick={previewImport}>
                {busy ? 'Reading...' : 'Review Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <section className="import-project-summary">
              <div>
                <span className="muted">Project</span>
                <strong>{preview.project.name}</strong>
              </div>
              <div>
                <span className="muted">Parts</span>
                <strong>{preview.parts.length}</strong>
              </div>
              <div>
                <span className="muted">Latest Files</span>
                <strong>{preview.files.length}</strong>
              </div>
              <div>
                <span className="muted">Export Version</span>
                <strong>{preview.version || 'Unknown'}</strong>
              </div>
            </section>

            <section className="card">
              <h3>Parts And Categories</h3>
              <div className="project-import-part-list">
                {sortedParts.map((part) => {
                  const status = categoryStatus(part);
                  const categoryKey = part.category_label || 'Uncategorized';
                  const hasExportedCategoryPath = categoryKey !== 'Uncategorized';
                  return (
                  <div key={`${part.name}-${part.product_url || ''}`} className="project-import-part-card">
                    <div className={`part-category-control ${categoryRank(part) === 0 ? 'needs-review' : ''}`}>
                      <div>
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                        <strong>Exported category: {part.category_label || 'Uncategorized'}</strong>
                        <small>{status.detail}</small>
                      </div>
                      <select
                        value={categoryMap[categoryKey] || '__none__'}
                        onChange={(e) => setCategoryMap((current) => ({ ...current, [categoryKey]: e.target.value }))}
                      >
                        <option value="__none__">Import as unassigned</option>
                        {hasExportedCategoryPath && <option value="__create__">Create exported category path</option>}
                        {categoryOptions.map((cat) => <option key={cat.id} value={cat.id}>{categoryOptionText(cat)}</option>)}
                      </select>
                    </div>
                    <div className="project-import-part-detail">
                      <strong>{part.name}</strong>
                      <span>{part.document_count} document(s)</span>
                      <em>{part.existing_match ? `Will reuse: ${part.existing_match.name}` : 'Will create new part'}</em>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setPreview(null); setFile(null); }}>Choose Different Zip</button>
              <button className="btn btn-primary" disabled={busy} onClick={commitImport}>
                {busy ? 'Importing...' : 'Import Project'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
