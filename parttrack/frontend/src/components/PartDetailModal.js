import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

const API_BASE = process.env.REACT_APP_API_URL?.replace('/api','') || '';

function qtyClass(n) { return n < 0 ? 'qty-neg' : n <= 5 ? 'qty-low' : 'qty-ok'; }

export default function PartDetailModal({ variantId, onClose, onEdit }) {
 const [part, setPart] = useState(null);
 const [adjustments, setAdjustments] = useState([]);
 const [tab, setTab] = useState('info');

 useEffect(() => {
 Promise.all([
 api.getVariant(variantId),
 api.getAdjustments(variantId),
 ]).then(([p, a]) => { setPart(p); setAdjustments(a); });
 }, [variantId]);

 if (!part) return (
 <div className="modal-overlay">
 <div className="modal"><div className="loading">Loading...</div></div>
 </div>
 );

 const catPath = part.parent_name ? `${part.parent_name} › ${part.group_name}` : part.group_name;

 return (
 <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
 <div className="modal" style={{maxWidth:680, width:'95%'}}>

 {/* Header */}
 <div style={{display:'flex', gap:16, marginBottom:20, alignItems:'flex-start'}}>
 <div style={{flexShrink:0}}>
 {part.image_path
 ? <img src={`/files/images/${part.image_path}`} alt=""
 style={{width:90, height:90, objectFit:'cover', borderRadius:8, border:'1px solid #30363d'}} />
 : <div style={{width:90, height:90, background:'#21262d', borderRadius:8, border:'1px dashed #30363d',
 display:'flex', alignItems:'center', justifyContent:'center', fontSize:32}}></div>
 }
 </div>
 <div style={{flex:1, minWidth:0}}>
 <div style={{fontSize:11, color:'#8b949e', marginBottom:4}}>{catPath}</div>
 <h2 style={{fontSize:18, fontWeight:700, marginBottom:8, lineHeight:1.3}}>{part.label}</h2>
 <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:8}}>
 <QtyPill label="Available" value={part.quantity_available} />
 <QtyPill label="Reserved" value={part.quantity_reserved} color="#d29922" />
 <QtyPill label="On Order" value={part.quantity_on_order} color="#58a6ff" />
 </div>
 <div style={{display:'flex', gap:12, flexWrap:'wrap', fontSize:12, color:'#8b949e'}}>
 {part.storage_location && <span>{part.storage_location}</span>}
 {part.product_url && (
 <a href={part.product_url} target="_blank" rel="noreferrer"
 style={{color:'#58a6ff', textDecoration:'none'}}>Product page</a>
 )}
 </div>
 </div>
 <div style={{display:'flex', flexDirection:'column', gap:6, flexShrink:0}}>
 {onEdit && <button className="btn btn-secondary btn-sm" onClick={() => { onClose(); onEdit(part); }}>Edit</button>}
 <button className="btn-icon" onClick={onClose} style={{fontSize:18, color:'#8b949e', padding:'2px 6px'}}>×</button>
 </div>
 </div>

 {/* Tabs */}
 <div className="tabs">
 <button className={`tab ${tab==='info'?'active':''}`} onClick={() => setTab('info')}>Info</button>
 <button className={`tab ${tab==='spec'?'active':''}`} onClick={() => setTab('spec')}>
 Spec Sheet{part.spec_sheet ? '' : ''}
 </button>
 <button className={`tab ${tab==='docs'?'active':''}`} onClick={() => setTab('docs')}>Documents</button>
 <button className={`tab ${tab==='log'?'active':''}`} onClick={() => setTab('log')}>Log</button>
 </div>

 {/* Info tab */}
 {tab === 'info' && (
 <div>
 {part.notes && (
 <div style={{background:'#21262d', borderRadius:6, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#c9d1d9', lineHeight:1.5}}>
 {part.notes}
 </div>
 )}
 <table style={{width:'100%', fontSize:13}}>
 <tbody>
 <InfoRow label="Category" value={catPath} />
 <InfoRow label="Label" value={part.label} />
 <InfoRow label="Location" value={part.storage_location || '—'} />
 <InfoRow label="Available" value={<span className={qtyClass(part.quantity_available)}><strong>{part.quantity_available}</strong></span>} />
 <InfoRow label="Reserved" value={part.quantity_reserved} />
 <InfoRow label="On Order" value={part.quantity_on_order} />
 {part.product_url && (
 <InfoRow label="Product URL" value={
 <a href={part.product_url} target="_blank" rel="noreferrer"
 style={{color:'#58a6ff', textDecoration:'none', wordBreak:'break-all', fontSize:12}}>
 {part.product_url}
 </a>
 } />
 )}
 </tbody>
 </table>
 </div>
 )}

 {/* Spec sheet tab */}
 {tab === 'spec' && (
 <SpecTab part={part} onUpdate={updated => setPart(p => ({ ...p, ...updated }))} />
 )}

 {/* Documents tab */}
 {tab === 'docs' && <DocsTab part={part} />}

 {/* Log tab */}
 {tab === 'log' && (
 adjustments.length === 0
 ? <div className="empty">No adjustments logged.</div>
 : <table>
 <thead><tr><th>When</th><th>Change</th><th>Note</th></tr></thead>
 <tbody>
 {adjustments.map(l => (
 <tr key={l.id}>
 <td style={{color:'#8b949e', fontSize:12}}>{new Date(l.timestamp).toLocaleString()}</td>
 <td style={{color: l.change_amount>0?'#56d364':'#f85149', fontWeight:700}}>
 {l.change_amount > 0 ? '+' : ''}{l.change_amount}
 </td>
 <td style={{color:'#8b949e'}}>{l.note || '—'}</td>
 </tr>
 ))}
 </tbody>
 </table>
 )}
 </div>
 </div>
 );
}

function QtyPill({ label, value, color }) {
 const auto = value < 0 ? '#f85149' : value === 0 ? '#8b949e' : value <= 5 ? '#d29922' : '#56d364';
 return (
 <div style={{background:'#21262d', borderRadius:6, padding:'4px 12px', textAlign:'center', minWidth:70}}>
 <div style={{fontSize:10, color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2}}>{label}</div>
 <div style={{fontWeight:700, fontSize:18, color: color || auto}}>{value}</div>
 </div>
 );
}

function InfoRow({ label, value }) {
 return (
 <tr>
 <td style={{color:'#8b949e', padding:'7px 16px 7px 0', whiteSpace:'nowrap', verticalAlign:'top', borderBottom:'1px solid #21262d', width:120}}>{label}</td>
 <td style={{padding:'7px 0', color:'#e1e4e8', borderBottom:'1px solid #21262d'}}>{value}</td>
 </tr>
 );
}

function DocsTab({ part }) {
 const [docs, setDocs] = useState(part.documents || []);
 const [file, setFile] = useState(null);
 const [uploading, setUploading] = useState(false);

 const upload = async () => {
 if (!file) return;
 setUploading(true);
 try {
 const form = new FormData(); form.append('file', file);
 const d = await api.uploadDocument(part.id, form);
 setDocs(p => [...p, d]); setFile(null);
 } catch(e) { alert(e.message); }
 finally { setUploading(false); }
 };

 const del = async (id) => {
 await api.deleteDocument(id);
 setDocs(p => p.filter(d => d.id !== id));
 };

 return (
 <div>
 {docs.length === 0
 ? <div className="empty" style={{marginBottom:12}}>No documents attached.</div>
 : docs.map(d => (
 <div key={d.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between',
 padding:'8px 0', borderBottom:'1px solid #21262d'}}>
 <span style={{fontSize:13}}>
 {d.file_type==='pdf'?'PDF':d.file_type==='image'?'Image':'Text'}
 {d.file_path
 ? <a href={`${API_BASE}/files/documents/${d.file_path}`} target="_blank" rel="noreferrer"
 style={{color:'#58a6ff', textDecoration:'none'}}>{d.original_filename}</a>
 : d.original_filename}
 </span>
 <button className="btn-icon" onClick={() => del(d.id)}>×</button>
 </div>
 ))
 }
 <div style={{display:'flex', gap:8, marginTop:12, alignItems:'center'}}>
 <input type="file" onChange={e => setFile(e.target.files[0])}
 style={{background:'none', border:'none', padding:0, fontSize:12, flex:1}} />
 <button className="btn btn-primary btn-sm" onClick={upload} disabled={!file || uploading}>
 {uploading ? 'Uploading…' : 'Upload'}
 </button>
 </div>
 </div>
 );
}

// ── Spec Sheet tab — scrape + manual paste ────────────────────────────────────
function SpecTab({ part, onUpdate }) {
 const [scraping, setScraping] = useState(false);
 const [msg, setMsg] = useState('');
 const [msgType, setMsgType] = useState(''); // 'ok' | 'warn' | 'err'
 const [manualMode, setManualMode] = useState(false);
 const [draft, setDraft] = useState('');

 const flash = (text, type) => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 6000); };

 const scrape = async () => {
 setScraping(true); setMsg('');
 try {
 const res = await api.scrapeSpec(part.id, part.product_url);
 if (res.ok && res.spec) {
 onUpdate({ spec_sheet: res.spec });
 flash('Specifications imported successfully.', 'ok');
 } else {
 flash(res.message || 'Could not extract specs automatically.', 'warn');
 setManualMode(true);
 }
 } catch (e) { flash('Error: ' + e.message, 'err'); }
 finally { setScraping(false); }
 };

 const saveManual = async () => {
 if (!draft.trim()) return;
 try {
 await api.updateVariant(part.id, { ...part, spec_sheet: draft.trim() });
 onUpdate({ spec_sheet: draft.trim() });
 setManualMode(false);
 setDraft('');
 flash('Specifications saved.', 'ok');
 } catch (e) { flash('Error: ' + e.message, 'err'); }
 };

 const clear = async () => {
 if (!window.confirm('Clear the spec sheet?')) return;
 await api.updateVariant(part.id, { ...part, spec_sheet: '' });
 onUpdate({ spec_sheet: null });
 };

 const msgColor = { ok: '#56d364', warn: '#d29922', err: '#f85149' }[msgType] || '#8b949e';

 return (
 <div>
 {/* Action bar */}
 <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap'}}>
 {part.product_url ? (
 <button className="btn btn-secondary btn-sm" onClick={scrape} disabled={scraping}>
 {scraping ? 'Scraping...' : 'Auto-Import from Product Page'}
 </button>
 ) : (
 <span style={{color:'#8b949e', fontSize:12}}>Add a Product URL on the Info tab to enable auto-import.</span>
 )}
 <button
 className="btn btn-secondary btn-sm"
 onClick={() => { setManualMode(m => !m); setDraft(part.spec_sheet || ''); }}
 >
 {manualMode ? 'Cancel' : (part.spec_sheet ? 'Edit' : 'Paste Manually')}
 </button>
 {msg && <span style={{fontSize:12, color: msgColor}}>{msg}</span>}
 </div>

 {/* How it works note */}
 {!part.spec_sheet && !manualMode && (
 <div style={{
 background:'#161b22', border:'1px solid #30363d', borderRadius:6,
 padding:'10px 14px', marginBottom:12, fontSize:12, color:'#8b949e', lineHeight:1.6
 }}>
 <strong style={{color:'#c9d1d9'}}>Auto-Import</strong> fetches the product page and extracts the Specifications section.
 Works best with AliExpress — it reads the embedded product JSON directly.<br />
 If auto-import doesn't work (some sites require a browser to load), use <strong style={{color:'#c9d1d9'}}>Paste Manually</strong>:
 copy the spec text from the product page and paste it here.
 </div>
 )}

 {/* Manual paste editor */}
 {manualMode && (
 <div style={{marginBottom:12}}>
 <textarea
 value={draft}
 onChange={e => setDraft(e.target.value)}
 placeholder={'Paste specifications here, e.g.:\nMaterial: Optical Glass\nDimension: 90 x 45 x 10 mm\nSurface Quality: 40/20'}
 style={{
 width:'100%', minHeight:180, fontSize:12, lineHeight:1.6,
 background:'#0d1117', color:'#c9d1d9', border:'1px solid #58a6ff',
 borderRadius:6, padding:12, resize:'vertical', fontFamily:'monospace'
 }}
 autoFocus
 />
 <div style={{display:'flex', gap:8, marginTop:6}}>
 <button className="btn btn-primary btn-sm" onClick={saveManual} disabled={!draft.trim()}>Save</button>
 <button className="btn btn-secondary btn-sm" onClick={() => { setManualMode(false); setDraft(''); }}>Cancel</button>
 </div>
 </div>
 )}

 {/* Saved spec display */}
 {part.spec_sheet && !manualMode && (
 <>
 <pre style={{
 background:'#0d1117', border:'1px solid #30363d', borderRadius:6,
 padding:14, fontSize:12, color:'#c9d1d9', whiteSpace:'pre-wrap',
 wordBreak:'break-word', maxHeight:380, overflowY:'auto',
 lineHeight:1.7, margin:0, fontFamily:'monospace'
 }}>{part.spec_sheet}</pre>
 <div style={{display:'flex', gap:8, marginTop:8}}>
 <button className="btn btn-secondary btn-sm"
 onClick={() => navigator.clipboard.writeText(part.spec_sheet)}>
 Copy
 </button>
 <button className="btn btn-danger btn-sm" onClick={clear}>Clear</button>
 </div>
 </>
 )}

 {!part.spec_sheet && !manualMode && (
 <div className="empty">No specifications yet.</div>
 )}
 </div>
 );
}
