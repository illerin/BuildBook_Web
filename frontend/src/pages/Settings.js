import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import ModalOverlay from '../components/ModalOverlay';

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

export default function Settings() {
  const [templateOpen, setTemplateOpen] = useState(false);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Project defaults, file tracking rules, backup, and restore.</p>
        </div>
      </div>
      <Section
        title="Project Template"
        description="Control the default project step buttons, starter checklist items, and tracked file types used on project pages."
      >
        <button className="btn btn-primary" onClick={() => setTemplateOpen(true)}>Project Template</button>
      </Section>
      <BackupSection />
      <ReadmeSection />
      {templateOpen && <ProjectTemplateModal onClose={() => setTemplateOpen(false)} />}
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

  const updateChecklist = (index, value) => {
    setTemplate((t) => ({
      ...t,
      default_checklist: t.default_checklist.map((item, i) => (i === index ? value : item)),
    }));
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
                <div className="template-row" key={`${step.id || 'step'}-${index}`}>
                  <input value={step.name} onChange={(e) => updateStep(index, e.target.value)} />
                  <button className="btn-icon" onClick={() => setTemplate((t) => ({ ...t, steps: t.steps.filter((_, i) => i !== index) }))}>x</button>
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
                <div className="tracker-row" key={`${tracker.key}-${index}`}>
                  <input value={tracker.label} onChange={(e) => updateTracker(index, 'label', e.target.value)} placeholder="Drawings" />
                  <input value={tracker.extensions} onChange={(e) => updateTracker(index, 'extensions', e.target.value)} placeholder=".dwg,.dxf" />
                  <button className="btn-icon" onClick={() => setTemplate((t) => ({ ...t, file_trackers: t.file_trackers.filter((_, i) => i !== index) }))}>x</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={() => setTemplate((t) => ({ ...t, file_trackers: [...t.file_trackers, { label: '', extensions: '' }] }))}>Add File Type</button>
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

function BackupSection() {
  const backup = useOp();
  const restore = useOp();
  const restoreRef = useRef(null);

  const doBackup = async () => {
    backup.start();
    try {
      await triggerDownload(api.downloadBackup(), 'electronics-tracker-backup.json');
      backup.done('Backup downloaded.');
    } catch (e) {
      backup.fail(e.message);
    }
  };

  const doRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.confirm('Restore will wipe all current database records and replace them with this backup. Continue?')) {
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
      description="Backup includes projects, parts, import batches, links, notes, and file metadata. Uploaded files themselves stay on disk and should be preserved with the Docker volume."
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
          <input ref={restoreRef} type="file" accept=".json" hidden onChange={doRestore} />
        </label>
      </div>
    </Section>
  );
}

function ReadmeSection() {
  return (
    <Section
      title="Quick Notes"
      description="BuildBook_Web is for documenting electronics builds: projects hold notes, latest files, linked parts, datasheets, and checklist progress."
    >
      <div className="settings-list">
        <span>Use Project Template to tune default steps, checklist items, and tracked file types.</span>
        <span>Use Backup before major cleanup or category/template changes.</span>
      </div>
    </Section>
  );
}
