import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import ModalOverlay from '../components/ModalOverlay';

const DEFAULT_THEME = {
  accent: '#2f6feb',
  accent_soft: '#dbeafe',
  surface: '#161b22',
  surface_alt: '#21262d',
  text: '#e1e4e8',
  text_muted: '#8b949e',
  bg: '#0f1117',
  field: '#0d1117',
  border: '#30363d',
};

const THEME_CORE_FIELDS = [
  'accent',
  'accent_soft',
  'surface',
  'surface_alt',
  'text',
  'text_muted',
  'bg',
  'field',
  'border',
];

function normalizeTheme(theme = {}) {
  const source = theme && typeof theme === 'object' ? theme : {};
  const normalized = {
    ...DEFAULT_THEME,
    ...source,
    accent_soft: source.accent_soft || source.accentSoft || DEFAULT_THEME.accent_soft,
    surface_alt: source.surface_alt || source.surfaceAlt || DEFAULT_THEME.surface_alt,
    text_muted: source.text_muted || source.textMuted || DEFAULT_THEME.text_muted,
    bg: source.bg || DEFAULT_THEME.bg,
    field: source.field || DEFAULT_THEME.field,
    border: source.border || DEFAULT_THEME.border,
  };
  delete normalized.accentSoft;
  delete normalized.surfaceAlt;
  delete normalized.textMuted;
  return normalized;
}

function themeFieldList(theme = {}) {
  const keys = new Set([...THEME_CORE_FIELDS, ...Object.keys(theme || {})]);
  const extras = [...keys].filter((key) => !THEME_CORE_FIELDS.includes(key)).sort();
  return [...THEME_CORE_FIELDS, ...extras];
}

function Section({ title, description, children }) {
  return (
    <section className="card settings-section">
      <h2>{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
    </section>
  );
}

function useOp() {
  const [state, setState] = useState({ loading: false, msg: '', err: '' });
  const start = () => setState({ loading: true, msg: '', err: '' });
  const done = (msg) => {
    setState({ loading: false, msg, err: '' });
    setTimeout(() => setState((s) => ({ ...s, msg: '' })), 5000);
  };
  const fail = (err) => {
    setState({ loading: false, msg: '', err });
    setTimeout(() => setState((s) => ({ ...s, err: '' })), 5000);
  };
  return { ...state, start, done, fail };
}

async function triggerDownload(fetchPromise, fallbackName) {
  const response = await fetchPromise;
  if (!response.ok) throw new Error(await response.text());
  const blob = await response.blob();
  const header = response.headers.get('Content-Disposition') || '';
  const match = header.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Settings() {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Defaults and portable app settings for documenting electronics builds.</p>
        </div>
      </div>
      <div className="settings-grid">
        <Section
          title="Project Template"
          description="Set default project step tags, starter checklist items, and tracked file types with colors and ordering."
        >
          <button className="btn btn-primary" onClick={() => setTemplateOpen(true)}>Project Template</button>
        </Section>
      </div>
      <BackupSection />
      <ResetDefaultsSection onOpen={() => setResetOpen(true)} />
      <StorageCleanupSection />
      <ReadmeSection />
      {templateOpen && <ProjectTemplateModal onClose={() => setTemplateOpen(false)} />}
      {resetOpen && <ResetDefaultsModal onClose={() => setResetOpen(false)} />}
    </div>
  );
}

function ProjectTemplateModal({ onClose }) {
  const [template, setTemplate] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProjectTemplate().then(setTemplate).catch((e) => setErr(e.message));
  }, []);

  const updateStep = (index, value) => {
    setTemplate((t) => ({
      ...t,
      steps: t.steps.map((step, i) => (i === index ? { ...step, name: value } : step)),
    }));
  };

  const moveStep = (index, direction) => {
    setTemplate((t) => {
      const steps = [...t.steps];
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= steps.length) return t;
      [steps[index], steps[swap]] = [steps[swap], steps[index]];
      return { ...t, steps: steps.map((step, i) => ({ ...step, order_index: i })) };
    });
  };

  const updateChecklist = (index, value) => {
    setTemplate((t) => ({
      ...t,
      default_checklist: t.default_checklist.map((item, i) => (i === index ? value : item)),
    }));
  };

  const moveTracker = (index, direction) => {
    setTemplate((t) => {
      const trackers = [...t.file_trackers];
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= trackers.length) return t;
      [trackers[index], trackers[swap]] = [trackers[swap], trackers[index]];
      return { ...t, file_trackers: trackers.map((tracker, i) => ({ ...tracker, order_index: i })) };
    });
  };

  const updateTracker = (index, key, value) => {
    setTemplate((t) => ({
      ...t,
      file_trackers: t.file_trackers.map((tracker, i) => (i === index ? { ...tracker, [key]: value } : tracker)),
    }));
  };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const saved = await api.updateProjectTemplate({
        steps: template.steps,
        default_checklist: template.default_checklist,
        file_trackers: template.file_trackers,
      });
      setTemplate(saved);
      setMsg('Project template saved.');
      setTimeout(() => setMsg(''), 3500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal template-modal">
        <div className="card-header">
          <h2>Project Template</h2>
          <button className="btn-icon" onClick={onClose}>x</button>
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}
        {!template ? <div className="loading">Loading...</div> : (
          <div className="template-grid">
            <section className="template-preview">
              <h3>Mock Project</h3>
              <div className="mock-project-title">New Electronics Project</div>
              <div className="step-button-grid">
                {template.steps.filter((step) => step.name.trim()).map((step, index) => (
                  <button key={`${step.id || 'new'}-${index}`} className={`step-button ${index < 3 ? 'active' : ''}`}>
                    {step.name}
                  </button>
                ))}
              </div>
              <div className="mock-checklist">
                {template.default_checklist.filter(Boolean).slice(0, 5).map((item, index) => (
                  <label key={index} className="checklist-item">
                    <input type="checkbox" readOnly checked={index === 0} />
                    <span className={`item-text ${index === 0 ? 'done' : ''}`}>{item}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="template-editor">
              <h3>Project Steps</h3>
              {template.steps.map((step, index) => (
                <div className="template-sort-row" key={`${step.id || 'step'}-${index}`}>
                  <div className="template-row">
                    <input value={step.name} onChange={(e) => updateStep(index, e.target.value)} />
                    <button className="btn-icon" onClick={() => setTemplate((t) => ({ ...t, steps: t.steps.filter((_, i) => i !== index) }))}>x</button>
                  </div>
                  <div className="sort-buttons">
                    <button className="btn btn-secondary btn-sm" disabled={index === 0} onClick={() => moveStep(index, 'up')}>Up</button>
                    <button className="btn btn-secondary btn-sm" disabled={index === template.steps.length - 1} onClick={() => moveStep(index, 'down')}>Down</button>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={() => setTemplate((t) => ({ ...t, steps: [...t.steps, { name: '', order_index: t.steps.length }] }))}>Add Step</button>

              <h3>Default Checklist</h3>
              {template.default_checklist.map((item, index) => (
                <div className="template-row" key={`check-${index}`}>
                  <input value={item} onChange={(e) => updateChecklist(index, e.target.value)} placeholder="Checklist item" />
                  <button className="btn-icon" onClick={() => setTemplate((t) => ({ ...t, default_checklist: t.default_checklist.filter((_, i) => i !== index) }))}>x</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={() => setTemplate((t) => ({ ...t, default_checklist: [...t.default_checklist, ''] }))}>Add Checklist Item</button>

              <h3>Tracked File Types</h3>
              {template.file_trackers.map((tracker, index) => (
                <div className="tracker-edit-card" key={`${tracker.key || 'tracker'}-${index}`}>
                  <div className="tracker-row tracker-row-wide">
                    <input value={tracker.label} onChange={(e) => updateTracker(index, 'label', e.target.value)} placeholder="Drawings" />
                    <input value={tracker.extensions} onChange={(e) => updateTracker(index, 'extensions', e.target.value)} placeholder=".dwg,.dxf" />
                    <input type="color" value={tracker.color || '#58a6ff'} onChange={(e) => updateTracker(index, 'color', e.target.value)} aria-label={`${tracker.label || 'Tracker'} color`} />
                    <button className="btn-icon" onClick={() => setTemplate((t) => ({ ...t, file_trackers: t.file_trackers.filter((_, i) => i !== index) }))}>x</button>
                  </div>
                  <div className="sort-buttons">
                    <button className="btn btn-secondary btn-sm" disabled={index === 0} onClick={() => moveTracker(index, 'up')}>Up</button>
                    <button className="btn btn-secondary btn-sm" disabled={index === template.file_trackers.length - 1} onClick={() => moveTracker(index, 'down')}>Down</button>
                  </div>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={() => setTemplate((t) => ({ ...t, file_trackers: [...t.file_trackers, { key: '', label: '', extensions: '', color: '#58a6ff' }] }))}>Add File Type</button>
            </section>
          </div>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={!template || saving} onClick={save}>{saving ? 'Saving...' : 'Save Template'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ThemeModal({ onClose }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const importRef = useRef(null);
  const fields = themeFieldList(theme);

  useEffect(() => {
    api.getTheme().then((value) => setTheme(normalizeTheme(value))).catch((e) => setErr(e.message));
  }, []);

  const update = (key, value) => setTheme((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const saved = normalizeTheme(await api.updateTheme(normalizeTheme(theme)));
      setTheme(saved);
      setMsg('Theme saved.');
      setTimeout(() => setMsg(''), 3500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setTheme(DEFAULT_THEME);
  };
  const exportTheme = () => downloadJson('buildbook-web-theme.json', theme);

  const importTheme = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setTheme(normalizeTheme(parsed));
      setMsg('Theme loaded into draft. Save to store it.');
      setTimeout(() => setMsg(''), 3500);
      setErr('');
    } catch {
      setErr('Theme file is not valid JSON.');
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal template-modal">
        <div className="card-header">
          <h2>Color Theme</h2>
          <button className="btn-icon" onClick={onClose}>x</button>
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}
        <div className="theme-grid">
          <section className="template-preview">
            <h3>Preview</h3>
            <div className="theme-preview-card" style={{ background: theme.surface, color: theme.text, borderColor: theme.border || theme.accent_soft }}>
              <div className="theme-preview-header" style={{ background: theme.sidebar || theme.surface_alt, borderColor: theme.borderSoft || theme.border || theme.accent_soft }}>
                <strong>BuildBook_Web</strong>
                <span style={{ color: theme.text_muted || theme.textMuted }}>bench workflow</span>
              </div>
              <div className="theme-preview-body">
                <span className="theme-preview-pill" style={{ background: theme.accent, color: '#fff' }}>Active</span>
                <span className="theme-preview-pill soft" style={{ background: theme.projectTagBg || theme.accent_soft, color: theme.projectTagText || theme.text }}>Documentation</span>
                <div className="theme-preview-status-row">
                  <span className="theme-preview-pill" style={{ background: theme.statusActiveBg || '#1f6231', color: theme.statusActiveText || '#7ee787' }}>Active</span>
                  <span className="theme-preview-pill" style={{ background: theme.statusPausedBg || '#2d333b', color: theme.statusPausedText || '#adbac7' }}>Paused</span>
                  <span className="theme-preview-pill" style={{ background: theme.statusWaitingBg || '#5a3e1b', color: theme.statusWaitingText || '#d29922' }}>Waiting</span>
                </div>
                <div className="theme-preview-panel" style={{ background: theme.surfaceRaised || theme.surface_alt, borderColor: theme.borderSoft || theme.border }}>
                  <strong style={{ color: theme.text }}>Project card</strong>
                  <p style={{ color: theme.text_muted || theme.textMuted }}>Preview uses imported app-specific keys when available.</p>
                </div>
              </div>
            </div>
          </section>
          <section className="template-editor">
            <h3>Theme Colors</h3>
            {fields.map((key) => (
              <div key={key} className="theme-row">
                <label>{key.replace(/_/g, ' ')}</label>
                <input type="color" value={theme[key]} onChange={(e) => update(key, e.target.value)} />
                <input value={theme[key]} onChange={(e) => update(key, e.target.value)} />
              </div>
            ))}
            <div className="button-row">
              <button className="btn btn-secondary btn-sm" onClick={reset}>Reset Defaults</button>
              <button className="btn btn-secondary btn-sm" onClick={exportTheme}>Export Theme</button>
              <label className="btn btn-secondary btn-sm">
                Import Theme
                <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={importTheme} />
              </label>
            </div>
          </section>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save Theme'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function BackupSection() {
  const backup = useOp();
  const restore = useOp();
  const restoreRef = useRef(null);

  const doBackup = async () => {
    backup.start();
    try {
      await triggerDownload(api.downloadBackup(), 'buildbook-web-backup.zip');
      backup.done('Backup downloaded.');
    } catch (e) {
      backup.fail(e.message);
    }
  };

  const doRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm('Restore will wipe all current database records and uploaded files, then replace them with this backup. Continue?')) {
      e.target.value = '';
      return;
    }
    restore.start();
    try {
      const form = new FormData();
      form.append('file', file);
      await api.restoreBackup(form);
      restore.done('Restore complete. Reload the app to see restored data.');
    } catch (err) {
      restore.fail(err.message);
    }
    e.target.value = '';
  };

  return (
    <Section
      title="Backup and Restore"
      description="Backup downloads a portable zip containing database records and uploaded files. Restore can rebuild the app on a fresh Docker install or another computer from that one file."
    >
      {backup.msg && <div className="alert alert-success">{backup.msg}</div>}
      {backup.err && <div className="alert alert-error">{backup.err}</div>}
      {restore.msg && <div className="alert alert-success">{restore.msg}</div>}
      {restore.err && <div className="alert alert-error">{restore.err}</div>}
      <div className="button-row">
        <button className="btn btn-secondary" onClick={doBackup} disabled={backup.loading}>
          {backup.loading ? 'Preparing...' : 'Download Backup'}
        </button>
        <label className="btn btn-danger">
          {restore.loading ? 'Restoring...' : 'Restore Backup'}
          <input ref={restoreRef} type="file" accept=".zip,.json" hidden onChange={doRestore} />
        </label>
      </div>
    </Section>
  );
}

function ResetDefaultsSection({ onOpen }) {
  return (
    <Section
      title="Reset to Default"
      description="Wipe all current projects, parts, imports, uploaded files, and settings, then return the app to its default first-load state."
    >
      <div className="button-row">
        <button className="btn btn-danger" onClick={onOpen}>Reset to Default</button>
      </div>
    </Section>
  );
}

function ResetDefaultsModal({ onClose }) {
  const op = useOp();
  const [value, setValue] = useState('');
  const confirmText = 'delete all';

  const reset = async () => {
    if (value.trim().toLowerCase() !== confirmText) return;
    op.start();
    try {
      await api.resetDefaults();
      onClose();
    } catch (e) {
      op.fail(e.message);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal">
        <h2>Reset to Default</h2>
        <p className="muted">This deletes all projects, parts, imports, uploaded files, and saved settings.</p>
        <p className="muted">Type <strong>delete all</strong> to confirm.</p>
        {op.msg && <div className="alert alert-success">{op.msg}</div>}
        {op.err && <div className="alert alert-error">{op.err}</div>}
        <div className="form-group">
          <label>Confirmation</label>
          <input value={value} autoFocus onChange={(e) => setValue(e.target.value)} placeholder="delete all" />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={op.loading || value.trim().toLowerCase() !== confirmText} onClick={reset}>
            {op.loading ? 'Resetting...' : 'Confirm Reset'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function StorageCleanupSection() {
  const scanOp = useOp();
  const deleteOp = useOp();
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const runScan = async () => {
    scanOp.start();
    try {
      const result = await api.scanStorageCleanup();
      setScan(result);
      setSelected(new Set((result.orphans || []).map((item) => `${item.root}:${item.path}`)));
      scanOp.done(`Found ${result.orphan_count} orphaned file${result.orphan_count === 1 ? '' : 's'}.`);
    } catch (e) {
      scanOp.fail(e.message);
    }
  };

  const toggle = (item) => {
    const key = `${item.root}:${item.path}`;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const removeSelected = async () => {
    if (!scan?.orphans?.length) return;
    const files = scan.orphans.filter((item) => selected.has(`${item.root}:${item.path}`));
    if (!files.length) return;
    if (!window.confirm(`Delete ${files.length} selected orphaned file${files.length === 1 ? '' : 's'} from web storage?`)) return;
    deleteOp.start();
    try {
      const result = await api.deleteStorageCleanup({ files });
      deleteOp.done(`Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'}.`);
      await runScan();
    } catch (e) {
      deleteOp.fail(e.message);
    }
  };

  return (
    <Section
      title="Storage Cleanup"
      description="Scan uploaded web storage for unreferenced files and delete selected orphans."
    >
      {scanOp.msg && <div className="alert alert-success">{scanOp.msg}</div>}
      {scanOp.err && <div className="alert alert-error">{scanOp.err}</div>}
      {deleteOp.msg && <div className="alert alert-success">{deleteOp.msg}</div>}
      {deleteOp.err && <div className="alert alert-error">{deleteOp.err}</div>}
      <div className="button-row">
        <button className="btn btn-secondary" onClick={runScan} disabled={scanOp.loading}>
          {scanOp.loading ? 'Scanning...' : 'Scan Storage'}
        </button>
        <button className="btn btn-danger" onClick={removeSelected} disabled={deleteOp.loading || !selected.size}>
          {deleteOp.loading ? 'Deleting...' : 'Delete Selected'}
        </button>
      </div>
      {scan && (
        <div className="storage-cleanup-grid">
          <div className="stats-row">
            <div className="stat-card"><div className="label">Images</div><div className="value">{scan.actual_counts?.images ?? 0}</div></div>
            <div className="stat-card"><div className="label">Project Files</div><div className="value">{scan.actual_counts?.projects ?? 0}</div></div>
            <div className="stat-card"><div className="label">Documents</div><div className="value">{scan.actual_counts?.documents ?? 0}</div></div>
            <div className="stat-card"><div className="label">Orphans</div><div className="value">{scan.orphan_count ?? 0}</div></div>
          </div>
          {!scan.orphans?.length ? <p className="muted">No orphaned files found.</p> : (
            <div className="cleanup-list">
              {scan.orphans.map((item) => {
                const key = `${item.root}:${item.path}`;
                return (
                  <label key={key} className="cleanup-row">
                    <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(item)} />
                    <span>{item.full_path}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function ReadmeSection() {
  return (
    <Section
      title="Quick Notes"
      description="BuildBook_Web is for electronics project documentation. Projects are the workspace; parts are reusable reference records for datasheets, product info, storage location, and related documents."
    >
      <div className="settings-list">
        <span>Use Project Template to tune workflow tags, checklist starters, tracked file colors, and ordering.</span>
        <span>Use Color Theme to preserve portable theme data used by desktop-compatible backups.</span>
        <span>Use project exports when sharing a build package with notes, files, parts, instructions, and project photos.</span>
        <span>Use Backup before restore testing, migration checks, or major cleanup.</span>
      </div>
    </Section>
  );
}
