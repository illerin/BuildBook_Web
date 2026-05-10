import React, { useState, useRef } from 'react';
import { api } from '../api/client';

const EXAMPLE_TEMPLATE = {
 categories: [
 {
 name: "Resistors",
 children: [
 { name: "Through-Hole Resistors" },
 { name: "SMD Resistors", children: [
 { name: "0402" },
 { name: "0603" },
 { name: "0805" }
 ]}
 ]
 },
 {
 name: "Capacitors",
 children: [
 { name: "Ceramic Capacitors" },
 { name: "Electrolytic Capacitors" },
 { name: "Tantalum Capacitors" }
 ]
 },
 {
 name: "Semiconductors",
 children: [
 { name: "MOSFETs" },
 { name: "BJTs" },
 { name: "Diodes" },
 { name: "Voltage Regulators" }
 ]
 },
 {
 name: "ICs",
 children: [
 { name: "Microcontrollers" },
 { name: "Op-Amps" },
 { name: "Logic Gates" },
 { name: "Motor Drivers" },
 { name: "Power Management" }
 ]
 },
 {
 name: "Connectors",
 children: [
 { name: "Pin Headers" },
 { name: "JST Connectors" },
 { name: "USB Connectors" },
 { name: "Barrel Jacks" }
 ]
 },
 {
 name: "Passive Components",
 children: [
 { name: "Inductors" },
 { name: "Crystals & Oscillators" },
 { name: "Fuses" }
 ]
 },
 {
 name: "Electromechanical",
 children: [
 { name: "Relays" },
 { name: "Switches" },
 { name: "Buttons" },
 { name: "Motors" }
 ]
 },
 {
 name: "Displays & LEDs",
 children: [
 { name: "LEDs" },
 { name: "7-Segment Displays" },
 { name: "OLED Displays" },
 { name: "LCD Displays" }
 ]
 },
 {
 name: "Sensors",
 children: [
 { name: "Temperature Sensors" },
 { name: "Humidity Sensors" },
 { name: "IMU / Accelerometers" },
 { name: "Optical Sensors" }
 ]
 },
 {
 name: "Modules & Breakouts",
 children: [
 { name: "WiFi / Bluetooth Modules" },
 { name: "Power Supply Modules" },
 { name: "Display Modules" }
 ]
 },
 { name: "Mechanical & Hardware" },
 { name: "PCBs" },
 { name: "Tools & Consumables" }
 ]
};

function Section({ title, description, children }) {
 return (
 <div className="card" style={{ marginBottom: 16 }}>
 <h2 style={{ fontSize: 15, marginBottom: 4 }}>{title}</h2>
 {description && <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 14 }}>{description}</p>}
 {children}
 </div>
 );
}

function useFileOp(label) {
 const [state, setState] = useState({ loading: false, msg: '', err: '' });
 const flash = (msg, isErr) => {
 setState({ loading: false, msg: isErr ? '' : msg, err: isErr ? msg : '' });
 setTimeout(() => setState(s => ({ ...s, msg: '', err: '' })), 5000);
 };
 const start = () => setState({ loading: true, msg: '', err: '' });
 return { ...state, flash, start };
}

async function triggerDownload(fetchPromise, fallbackName) {
 const res = await fetchPromise;
 if (!res.ok) throw new Error(await res.text());
 const blob = await res.blob();
 const cd = res.headers.get('Content-Disposition') || '';
 const match = cd.match(/filename="?([^"]+)"?/);
 const filename = match ? match[1] : fallbackName;
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url; a.download = filename; a.click();
 URL.revokeObjectURL(url);
}

export default function Settings() {
 return (
 <div>
 <div className="page-header"><h1>Settings</h1></div>

 <TemplateSection />
 <InventorySection />
 <BackupSection />
 </div>
 );
}

function TemplateSection() {
 const op = useFileOp('template');
 const fileRef = useRef(null);

 const downloadExample = () => {
 const blob = new Blob([JSON.stringify(EXAMPLE_TEMPLATE, null, 2)], { type: 'application/json' });
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = 'electronics-template.json';
 a.click();
 };

 const importFile = async (e) => {
 const file = e.target.files[0]; if (!file) return;
 op.start();
 try {
 const form = new FormData(); form.append('file', file);
 const res = await api.importTemplate(form);
 op.flash(`Created ${res.created} categories.`);
 } catch(err) { op.flash(err.message, true); }
 e.target.value = '';
 };

 return (
 <Section
 title=" Category Template"
 description="Import a predefined set of categories and subcategories to quickly scaffold your inventory structure. Does not affect existing categories.">
 {op.msg && <div className="alert alert-success">{op.msg}</div>}
 {op.err && <div className="alert alert-error">{op.err}</div>}
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
 <button className="btn btn-secondary" onClick={downloadExample}>
 Download Example Template
 </button>
 <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
 Import Template
 <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importFile} />
 </label>
 </div>
 <div style={{ marginTop: 14, background: '#0d1117', borderRadius: 6, border: '1px solid #30363d', padding: 12 }}>
 <p style={{ color: '#8b949e', fontSize: 12, marginBottom: 8 }}>Template JSON format:</p>
 <pre style={{ color: '#8b949e', fontSize: 11, margin: 0, overflowX: 'auto' }}>{`{
 "categories": [
 {
 "name": "Resistors",
 "children": [
 { "name": "Through-Hole Resistors" },
 {
 "name": "SMD Resistors",
 "children": [
 { "name": "0402" },
 { "name": "0805" }
 ]
 }
 ]
 }
 ]
}`}</pre>
 </div>
 </Section>
 );
}

function InventorySection() {
 const expOp = useFileOp('export');
 const impOp = useFileOp('import');
 const importRef = useRef(null);

 const doExport = async () => {
 expOp.start();
 try {
 await triggerDownload(api.exportInventory(), 'inventory.json');
 expOp.flash('Inventory exported.');
 } catch(err) { expOp.flash(err.message, true); }
 };

 const doImport = async (e) => {
 const file = e.target.files[0]; if (!file) return;
 if (!window.confirm('This will merge the inventory file into your current data. Existing parts will not be overwritten. Continue?')) {
 e.target.value = ''; return;
 }
 impOp.start();
 try {
 const form = new FormData(); form.append('file', file);
 const res = await api.importInventory(form);
 impOp.flash(`Imported ${res.categories} categories and ${res.variants} parts.`);
 } catch(err) { impOp.flash(err.message, true); }
 e.target.value = '';
 };

 return (
 <Section
 title="Inventory Export / Import"
 description="Export your full category tree and all parts (with quantities and locations) to a JSON file. Import merges into existing data without overwriting.">
 {expOp.msg && <div className="alert alert-success">{expOp.msg}</div>}
 {expOp.err && <div className="alert alert-error">{expOp.err}</div>}
 {impOp.msg && <div className="alert alert-success">{impOp.msg}</div>}
 {impOp.err && <div className="alert alert-error">{impOp.err}</div>}
 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
 <button className="btn btn-secondary" onClick={doExport} disabled={expOp.loading}>
 {expOp.loading ? 'Exporting…' : ' Export Inventory'}
 </button>
 <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
 {impOp.loading ? 'Importing…' : 'Import Inventory'}
 <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={doImport} />
 </label>
 </div>
 <p style={{ color: '#8b949e', fontSize: 12, marginTop: 12 }}>
 Exported file includes: categories, subcategories, part labels, quantities, storage locations, and notes.
 Does <strong>not</strong> include orders, projects, or uploaded files.
 </p>
 </Section>
 );
}

function BackupSection() {
 const backOp = useFileOp('backup');
 const restOp = useFileOp('restore');
 const restoreRef = useRef(null);

 const doBackup = async () => {
 backOp.start();
 try {
 await triggerDownload(api.downloadBackup(), 'parttrack-backup.json');
 backOp.flash('Backup downloaded.');
 } catch(err) { backOp.flash(err.message, true); }
 };

 const doRestore = async (e) => {
 const file = e.target.files[0]; if (!file) return;
 if (!window.confirm(
 'RESTORE will WIPE ALL current data and replace it with the backup.\n\nThis cannot be undone. Are you sure?'
 )) { e.target.value = ''; return; }
 restOp.start();
 try {
 const form = new FormData(); form.append('file', file);
 await api.restoreBackup(form);
 restOp.flash('Restore complete. Reload the page to see your data.');
 } catch(err) { restOp.flash(err.message, true); }
 e.target.value = '';
 };

 return (
 <Section
 title="Backup & Restore"
 description="A full backup includes everything: inventory, orders, projects, checklists, and adjustment logs. Restoring completely replaces all current data.">
 {backOp.msg && <div className="alert alert-success">{backOp.msg}</div>}
 {backOp.err && <div className="alert alert-error">{backOp.err}</div>}
 {restOp.msg && <div className="alert alert-success">{restOp.msg}</div>}
 {restOp.err && <div className="alert alert-error">{restOp.err}</div>}

 <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
 <button className="btn btn-secondary" onClick={doBackup} disabled={backOp.loading}>
 {backOp.loading ? 'Preparing…' : 'Download Backup'}
 </button>
 <label className="btn btn-danger" style={{ cursor: 'pointer' }}>
 {restOp.loading ? 'Restoring…' : ' Restore from Backup'}
 <input ref={restoreRef} type="file" accept=".json" style={{ display: 'none' }} onChange={doRestore} />
 </label>
 </div>

 <div style={{ background: '#5d1a1a', border: '1px solid #f85149', borderRadius: 6, padding: '10px 14px' }}>
 <p style={{ color: '#f85149', fontSize: 13, margin: 0 }}>
 Restore permanently deletes all current data. Always download a backup before restoring.
 Uploaded image files and documents on disk are <strong>not</strong> included in the backup JSON and must be preserved separately.
 </p>
 </div>
 </Section>
 );
}
