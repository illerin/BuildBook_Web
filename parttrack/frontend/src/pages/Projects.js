import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const STATUS_BADGE = {
 active: 'badge-green', waiting_on_part: 'badge-yellow', paused: 'badge-gray',
 completed: 'badge-blue', cancelled: 'badge-red'
};
const STATUS_LABEL = {
 active: 'Active', waiting_on_part: 'Waiting on Part', paused: 'Paused',
 completed: 'Completed', cancelled: 'Cancelled'
};

export default function Projects() {
 const [projects, setProjects] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showModal, setShowModal] = useState(false);

 const load = async () => {
 setLoading(true);
 const p = await api.getProjects();
 setProjects(p); setLoading(false);
 };
 useEffect(() => { load(); }, []);

 const byStatus = (status) => projects.filter(p => p.status === status);

 return (
 <div>
 <div className="page-header">
 <h1>Projects</h1>
 <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Project</button>
 </div>

 {loading ? <div className="loading">Loading...</div> : (
 projects.length === 0 ? <div className="empty">No projects yet.</div> : (
 <>
 {['active','waiting_on_part','paused','completed','cancelled'].map(status => {
 const group = byStatus(status);
 if (group.length === 0) return null;
 return (
 <div key={status} style={{marginBottom:24}}>
 <h3 style={{color:'#8b949e', fontSize:11, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10}}>
 {STATUS_LABEL[status]} ({group.length})
 </h3>
 {group.map(p => (
 <div key={p.id} className="card" style={{cursor:'default'}}>
 <div className="card-header" style={{marginBottom:6}}>
 <div style={{display:'flex', alignItems:'center', gap:10}}>
 <Link to={`/projects/${p.id}`} style={{color:'#e1e4e8', textDecoration:'none', fontWeight:600, fontSize:15}}>
 {p.name}
 </Link>
 <span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
 </div>
 <Link to={`/projects/${p.id}`} className="btn btn-secondary btn-sm">Open →</Link>
 </div>
 {p.description && <p style={{color:'#8b949e', fontSize:13, marginBottom:6}}>{p.description}</p>}
 <div style={{display:'flex', gap:20, fontSize:12, color:'#8b949e'}}>
 <span> {p.part_count} parts</span>
 <span> {p.checklist_done}/{p.checklist_total} checklist</span>
 </div>
 </div>
 ))}
 </div>
 );
 })}
 </>
 )
 )}

 {showModal && (
 <NewProjectModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />
 )}
 </div>
 );
}

function NewProjectModal({ onClose, onSave }) {
 const [form, setForm] = useState({ name: '', description: '', status: 'active' });
 const [err, setErr] = useState('');
 const submit = async () => {
 if (!form.name) return setErr('Name required');
 try { await api.createProject(form); onSave(); }
 catch (e) { setErr(e.message); }
 };
 return (
 <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
 <div className="modal">
 <h2>New Project</h2>
 {err && <div className="alert alert-error">{err}</div>}
 <div className="form-group"><label>Name *</label><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Project name" /></div>
 <div className="form-group"><label>Description</label><textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></div>
 <div className="form-group"><label>Status</label>
 <select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
 <option value="active">Active</option>
 <option value="paused">Paused</option>
 </select>
 </div>
 <div className="modal-footer">
 <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
 <button className="btn btn-primary" onClick={submit}>Create</button>
 </div>
 </div>
 </div>
 );
}
