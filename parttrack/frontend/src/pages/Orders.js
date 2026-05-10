import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

export default function Orders() {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('list');
  const [importData, setImportData] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [sort, setSort]           = useState('date');       // 'date' | 'imported'
  const [err, setErr]             = useState('');
  const [msg, setMsg]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const o = await api.getOrders(sort);
    setOrders(o); setLoading(false);
  }, [sort]);

  useEffect(() => { load(); }, [load]);

  const flash = (m, isErr) => {
    if (isErr) setErr(m); else setMsg(m);
    setTimeout(() => { setErr(''); setMsg(''); }, 4000);
  };

  const receiveOrder = async (id) => {
    try { await api.receiveOrder(id); flash('Order marked received'); load(); }
    catch (e) { flash(e.message, true); }
  };

  const deleteOrder = async (id, status) => {
    const warning = status === 'received'
      ? 'This order is marked received. Deleting it will reverse the inventory changes (subtract the received quantities). Continue?'
      : 'Delete this order record?';
    if (!window.confirm(warning)) return;
    try { await api.deleteOrder(id); flash('Order deleted'); load(); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <div>
      <div className="page-header"><h1>Orders</h1></div>
      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="tabs">
        <button className={`tab ${tab==='list'?'active':''}`} onClick={() => setTab('list')}>
          Orders ({orders.length})
        </button>
        <button className={`tab ${tab==='import'?'active':''}`} onClick={() => setTab('import')}>
          Import CSV
        </button>
      </div>

      {tab === 'import' && (
        <ImportPanel onImported={data => { setImportData(data); setTab('map'); }} />
      )}

      {tab === 'map' && importData && (
        <MappingPanel
          data={importData}
          onConfirm={() => { setImportData(null); setTab('list'); load(); flash('Orders imported!'); }}
          onCancel={() => { setImportData(null); setTab('list'); }}
        />
      )}

      {tab === 'list' && (
        <div>
          {/* Sort controls */}
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
            <span style={{color:'#8b949e', fontSize:13}}>Sort by:</span>
            <button
              className={`btn btn-sm ${sort==='date'?'btn-primary':'btn-secondary'}`}
              onClick={() => setSort('date')}>Order Date</button>
            <button
              className={`btn btn-sm ${sort==='imported'?'btn-primary':'btn-secondary'}`}
              onClick={() => setSort('imported')}>Import Date</button>
          </div>

          {loading ? <div className="loading">Loading...</div> :
           orders.length === 0 ? <div className="empty">No orders yet. Import a CSV to get started.</div> :
           orders.map(o => (
            <div key={o.id} className="card">
              <div className="card-header">
                <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                  <strong>Order #{o.id}</strong>
                  <span style={{color:'#8b949e', fontSize:12}}>
                    Order date: {o.date}
                  </span>
                  {o.imported_at && (
                    <span style={{color:'#8b949e', fontSize:12}}>
                      Imported: {new Date(o.imported_at).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`badge ${o.status==='received'?'badge-green':'badge-yellow'}`}>
                    {o.status==='received'?'Received':'Ordered'}
                  </span>
                  <span style={{color:'#8b949e', fontSize:12}}>{o.item_count} items</span>
                </div>
                <div style={{display:'flex', gap:6}}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedOrder(o.id)}>
                    View Items
                  </button>
                  {o.status === 'ordered' && (
                    <button className="btn btn-primary btn-sm" onClick={() => receiveOrder(o.id)}>
                      Mark Received
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => deleteOrder(o.id, o.status)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal orderId={selectedOrder} onClose={() => setSelectedOrder(null)} onRefresh={load} />
      )}
    </div>
  );
}

// ── Import panel ──────────────────────────────────────────────────────────────
function ImportPanel({ onImported }) {
  const [file, setFile]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState('');

  const parse = async () => {
    if (!file) return;
    setLoading(true); setErr('');
    try {
      const form = new FormData(); form.append('file', file);
      const data = await api.importCsv(form);
      onImported(data);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="card">
      <h3>Import CSV</h3>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="alert alert-info" style={{marginBottom:12}}>
        Supports AliExpress order export. Items on the same date are grouped into one order.
        Completed orders go directly to available stock. Reads the <code>Product Image Url</code> column for part photos.
      </div>
      <div className="form-group">
        <label>CSV File</label>
        <input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])}
          style={{background:'none', border:'none', padding:0}} />
      </div>
      <button className="btn btn-primary" onClick={parse} disabled={!file || loading}>
        {loading ? 'Parsing...' : 'Parse CSV'}
      </button>
    </div>
  );
}

// ── Mapping panel ─────────────────────────────────────────────────────────────
function MappingPanel({ data, onConfirm, onCancel }) {
  const [orders, setOrders] = useState(() =>
    data.orders.map(o => ({
      ...o,
      items: o.items.map(i => ({
        ...i,
        import_qty: i.quantity,
        part_variant_id: null,
        _search: '',
        _results: [],
        _creating: false,
        _selected: null,
        _skipped: false,
        _mapped: false,
        product_image_url: i.product_image_url || '',
      }))
    }))
  );
  const [confirming, setConfirming] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [err, setErr] = useState('');
  const timers = useRef({});

  const updateItem = (oi, ii, patch) =>
    setOrders(prev => prev.map((o, oi2) => oi2 !== oi ? o : {
      ...o, items: o.items.map((it, ii2) => ii2 !== ii ? it : { ...it, ...patch })
    }));

  const searchVariants = (oi, ii, q) => {
    updateItem(oi, ii, { _search: q, part_variant_id: null, _selected: null, _skipped: false });
    const key = `${oi}-${ii}`;
    clearTimeout(timers.current[key]);
    if (q.length < 1) { updateItem(oi, ii, { _results: [] }); return; }
    timers.current[key] = setTimeout(async () => {
      const vs = await api.getVariants({ search: q });
      updateItem(oi, ii, { _results: vs });
    }, 250);
  };

  const pick = (oi, ii, v) => {
    const catPath = v.parent_name ? `${v.parent_name} › ${v.group_name}` : v.group_name;
    updateItem(oi, ii, {
      part_variant_id: v.id,
      _search: `${catPath} — ${v.label}`,
      _results: [], _selected: v, _skipped: false, _mapped: true,
    });
  };

  const skipItem = (oi, ii) => {
    updateItem(oi, ii, {
      _skipped: true, _mapped: false, part_variant_id: null,
      _search: '', _results: [], _selected: null, _creating: false,
    });
  };

  const unskipItem = (oi, ii) => {
    updateItem(oi, ii, { _skipped: false });
  };

  const confirm = async () => {
    setConfirming(true); setErr('');
    const imageCount = orders.flatMap(o => o.items)
      .filter(i => i.part_variant_id && i.product_image_url).length;
    setConfirmMsg(imageCount > 0
      ? `Saving and downloading ${imageCount} image(s)...`
      : 'Saving orders...');
    try {
      const payload = {
        orders: orders.map(o => ({
          date: o.date, status: o.status,
          items: o.items.map(it => ({
            raw_name: it.raw_name,
            quantity: parseInt(it.import_qty) || it.quantity,
            part_variant_id: it.part_variant_id || null,
            product_url: it.product_url || '',
            product_image_url: it.product_image_url || '',
            is_completed: it.is_completed || o.status === 'received',
          }))
        }))
      };
      await api.confirmImport(payload);
      onConfirm();
    } catch (e) { setErr(e.message); setConfirming(false); setConfirmMsg(''); }
  };

  const allItems = orders.flatMap(o => o.items);
  const totalItems = allItems.length;
  const mappedItems = allItems.filter(i => i._mapped || i.part_variant_id).length;
  const skippedItems = allItems.filter(i => i._skipped).length;
  const pendingItems = totalItems - mappedItems - skippedItems;

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position:'sticky', top:0, zIndex:50, background:'#0f1117',
        borderBottom:'1px solid #30363d', padding:'12px 0', marginBottom:16
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <strong style={{fontSize:15}}>Map Order Items</strong>
            <div style={{display:'flex', gap:8, fontSize:12}}>
              <span style={{background:'#1f6231', color:'#56d364', padding:'2px 8px', borderRadius:10}}>
                {mappedItems} mapped
              </span>
              {skippedItems > 0 && (
                <span style={{background:'#21262d', color:'#8b949e', padding:'2px 8px', borderRadius:10}}>
                  {skippedItems} skipped
                </span>
              )}
              {pendingItems > 0 && (
                <span style={{background:'#1b3a5a', color:'#58a6ff', padding:'2px 8px', borderRadius:10}}>
                  {pendingItems} pending
                </span>
              )}
            </div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-secondary" onClick={onCancel} disabled={confirming}>Cancel</button>
            <button className="btn btn-primary" onClick={confirm} disabled={confirming}>
              {confirming ? (confirmMsg || 'Saving...') : 'Confirm Import'}
            </button>
          </div>
        </div>
        {err && <div className="alert alert-error" style={{marginTop:8}}>{err}</div>}
      </div>

      {orders.map((order, oi) => (
        <div key={oi} style={{marginBottom:24}}>
          {/* Order date header */}
          <div style={{
            display:'flex', alignItems:'center', gap:10, marginBottom:12,
            padding:'8px 14px', background:'#161b22', border:'1px solid #30363d', borderRadius:8
          }}>
            <strong style={{fontSize:14}}>{order.date}</strong>
            <span className={`badge ${order.status==='received'?'badge-green':'badge-yellow'}`}>
              {order.status==='received' ? 'Completed — goes to Available' : 'Ordered — goes to On Order'}
            </span>
            <span style={{color:'#8b949e', fontSize:12, marginLeft:'auto'}}>{order.items.length} items</span>
          </div>

          {/* Grid */}
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',
            gap:12
          }}>
            {order.items.map((item, ii) => (
              <ItemCard
                key={ii}
                item={item}
                orderStatus={order.status}
                onUpdate={patch => updateItem(oi, ii, patch)}
                onSearch={q => searchVariants(oi, ii, q)}
                onPick={v => pick(oi, ii, v)}
                onClearPick={() => updateItem(oi, ii, {
                  part_variant_id:null, _search:'', _results:[], _selected:null, _mapped:false
                })}
                onCreated={v => pick(oi, ii, v)}
                onSkip={() => skipItem(oi, ii)}
                onUnskip={() => unskipItem(oi, ii)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, orderStatus, onUpdate, onSearch, onPick, onClearPick, onCreated, onSkip, onUnskip }) {
  const [expanded, setExpanded] = useState(false);
  const isMapped  = !!item.part_variant_id;
  const isSkipped = item._skipped;
  const isCreating = item._creating;
  const isCompleted = item.is_completed || orderStatus === 'received';

  const borderColor = isMapped ? '#238636' : isSkipped ? '#30363d' : '#30363d';
  const cardOpacity = isSkipped ? 0.45 : 1;

  return (
    <div style={{
      background:'#161b22', border:`1px solid ${borderColor}`,
      borderRadius:8, overflow:'hidden', display:'flex', flexDirection:'column',
      opacity: cardOpacity, transition:'opacity 0.2s'
    }}>
      {/* Image + title */}
      <div style={{display:'flex', gap:0}}>
        <div style={{width:80, flexShrink:0, background:'#21262d', position:'relative'}}>
          {item.product_image_url ? (
            <img src={item.product_image_url} alt=""
              style={{width:80, height:80, objectFit:'cover', display:'block'}}
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
          ) : null}
          <div style={{
            width:80, height:80, display: item.product_image_url ? 'none' : 'flex',
            alignItems:'center', justifyContent:'center', fontSize:28, color:'#30363d'
          }}>[ ]</div>
        </div>
        <div style={{flex:1, padding:'8px 10px', minWidth:0}}>
          <div style={{
            fontSize:12, fontWeight:500, color: isSkipped ? '#8b949e' : '#e1e4e8',
            lineHeight:1.4,
            display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden',
            marginBottom:6, textDecoration: isSkipped ? 'line-through' : 'none'
          }} title={item.raw_name}>
            {item.raw_name}
          </div>
          {item.attributes && (
            <div style={{fontSize:10, color:'#8b949e', marginBottom:4,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {item.attributes}
            </div>
          )}
          {/* Qty */}
          {!isSkipped && (
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span style={{fontSize:11, color:'#8b949e'}}>Qty:</span>
              <input type="number" min={1} value={item.import_qty}
                onChange={e => onUpdate({ import_qty: e.target.value })}
                style={{width:60, fontSize:12, padding:'2px 6px',
                  background:'#21262d', border:'1px solid #30363d', borderRadius:4, color:'#e1e4e8'}} />
              {item.import_qty != item.quantity && (
                <span style={{fontSize:10, color:'#d29922'}}>was {item.quantity}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status strip */}
      {!isSkipped && (
        <div style={{
          padding:'4px 10px', fontSize:11,
          background: isCompleted ? '#1f3a1f' : '#1c1c2e',
          color: isCompleted ? '#56d364' : '#8b949e',
          borderTop:'1px solid #21262d', borderBottom:'1px solid #21262d'
        }}>
          {isCompleted ? 'Goes to Available' : 'Goes to On Order'}
          {item.store && <span style={{marginLeft:8, opacity:0.7}}>{item.store}</span>}
          {item.product_url && (
            <a href={item.product_url} target="_blank" rel="noreferrer"
              style={{marginLeft:8, color:'#58a6ff', textDecoration:'none'}}>Link</a>
          )}
        </div>
      )}

      {/* Skipped state */}
      {isSkipped ? (
        <div style={{padding:'10px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <span style={{fontSize:12, color:'#8b949e'}}>Skipped — will be saved without mapping</span>
          <button className="btn btn-secondary btn-sm" onClick={onUnskip}>Undo</button>
        </div>
      ) : (
        /* Mapping section */
        <div style={{padding:'10px', flex:1}}>
          {isCreating ? (
            <CreateVariantInline
              itemName={item.raw_name}
              onCreated={onCreated}
              onCancel={() => onUpdate({ _creating: false })}
            />
          ) : isMapped ? (
            <MappedDisplay item={item} onClear={onClearPick} />
          ) : (
            <SearchBox
              search={item._search}
              results={item._results}
              onSearch={onSearch}
              onPick={onPick}
              onCreate={() => onUpdate({ _creating: true, _results: [] })}
              onSkip={onSkip}
            />
          )}
        </div>
      )}

      {/* Image URL toggle — only when not skipped */}
      {!isSkipped && (
        <div style={{padding:'0 10px 10px'}}>
          <button onClick={() => setExpanded(e => !e)}
            style={{background:'none', border:'none', color:'#8b949e', fontSize:11,
              padding:0, cursor:'pointer', textDecoration:'underline'}}>
            {expanded ? 'Hide image URL' : 'Edit image URL'}
          </button>
          {expanded && (
            <div style={{display:'flex', gap:6, alignItems:'center', marginTop:6}}>
              <input value={item.product_image_url || ''}
                onChange={e => onUpdate({ product_image_url: e.target.value })}
                placeholder="Direct image URL..."
                style={{flex:1, fontSize:11, padding:'3px 8px'}} />
              {item.product_image_url && (
                <img src={item.product_image_url} alt=""
                  style={{width:24, height:24, objectFit:'cover', borderRadius:3, flexShrink:0}}
                  onError={e => e.target.style.display='none'} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mapped display ────────────────────────────────────────────────────────────
function MappedDisplay({ item, onClear }) {
  const img = item._selected
    ? (item._selected.variant_image_path || item._selected.group_image_path || item._selected.parent_image_path)
    : null;
  const catPath = item._selected
    ? (item._selected.parent_name
        ? `${item._selected.parent_name} › ${item._selected.group_name}`
        : item._selected.group_name)
    : '';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8, padding:'7px 8px',
      background:'#1c2128', borderRadius:6, border:'1px solid #238636'
    }}>
      {img
        ? <img src={`/files/images/${img}`} alt=""
            style={{width:28, height:28, objectFit:'cover', borderRadius:4, flexShrink:0}} />
        : <div style={{width:28, height:28, background:'#21262d', borderRadius:4,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0,
            color:'#56d364', fontWeight:700, border:'1px solid #238636'}}>✓</div>
      }
      <div style={{flex:1, minWidth:0}}>
        {catPath && <div style={{fontSize:10, color:'#8b949e', overflow:'hidden',
          textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{catPath}</div>}
        <div style={{fontSize:12, fontWeight:600, color:'#56d364', overflow:'hidden',
          textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {item._selected?.label || item._search}
        </div>
      </div>
      <button className="btn btn-secondary btn-sm" style={{flexShrink:0}} onClick={onClear}>Change</button>
    </div>
  );
}

// ── Search box ────────────────────────────────────────────────────────────────
function SearchBox({ search, results, onSearch, onPick, onCreate, onSkip }) {
  return (
    <div style={{position:'relative'}}>
      <input value={search} onChange={e => onSearch(e.target.value)}
        placeholder="Search or create part..."
        style={{width:'100%', fontSize:12, marginBottom:4}} />
      {results.length > 0 && (
        <div style={{
          position:'absolute', top:'100%', left:0, right:0,
          background:'#0d1117', border:'1px solid #30363d', borderRadius:6,
          zIndex:20, maxHeight:180, overflowY:'auto', marginTop:2
        }}>
          {results.map(v => {
            const img = v.variant_image_path || v.group_image_path || v.parent_image_path;
            const catPath = v.parent_name ? `${v.parent_name} › ${v.group_name}` : v.group_name;
            return (
              <div key={v.id} onClick={() => onPick(v)}
                style={{padding:'6px 10px', cursor:'pointer', borderBottom:'1px solid #21262d',
                  display:'flex', alignItems:'center', gap:8}}
                onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                {img
                  ? <img src={`/files/images/${img}`} alt=""
                      style={{width:24, height:24, objectFit:'cover', borderRadius:3, flexShrink:0}} />
                  : <div style={{width:24, height:24, background:'#21262d', borderRadius:3,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0}}>?</div>
                }
                <div style={{flex:1, minWidth:0}}>
                  <div style={{color:'#8b949e', fontSize:10, overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{catPath}</div>
                  <div style={{fontSize:12, fontWeight:500}}>{v.label}</div>
                </div>
                <span style={{
                  fontSize:11, flexShrink:0,
                  color: v.quantity_available<0?'#f85149':v.quantity_available<=5?'#d29922':'#56d364'
                }}>{v.quantity_available}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{display:'flex', gap:6, marginTop:4}}>
        <button className="btn btn-primary btn-sm" style={{flex:1, fontSize:11}} onClick={onCreate}>
          + New Part
        </button>
        <button className="btn btn-secondary btn-sm"
          style={{fontSize:11, color:'#8b949e', border:'1px solid #30363d'}}
          onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Create variant inline ─────────────────────────────────────────────────────
function CreateVariantInline({ itemName, onCreated, onCancel }) {
  const [allCats, setAllCats] = useState([]);
  const [form, setForm] = useState({
    group_id: '', new_group_name: '', new_group_parent: '',
    label: itemName.slice(0, 80),
    quantity_available: 0,
    storage_location: '',
    notes: '',
    product_url: '',
  });
  const [useExisting, setUseExisting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => { api.getCategoriesFlat().then(setAllCats); }, []);

  const leafCats = allCats.filter(c => !allCats.some(x => x.parent_id === c.id));
  const getLabelFor = (c) => {
    const par = allCats.find(p => p.id === c.parent_id);
    return par ? `${par.name} › ${c.name}` : c.name;
  };

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      let gid = form.group_id;
      if (!useExisting) {
        if (!form.new_group_name) { setErr('Category name required'); setSaving(false); return; }
        const g = await api.createCategory({
          name: form.new_group_name, category: form.new_group_name,
          parent_id: form.new_group_parent || null
        });
        gid = g.id;
      }
      if (!gid) { setErr('Select a category'); setSaving(false); return; }
      if (!form.label) { setErr('Label required'); setSaving(false); return; }
      const v = await api.createVariant(gid, {
        label: form.label,
        quantity_available: parseInt(form.quantity_available) || 0,
        storage_location: form.storage_location || null,
        notes: form.notes || null,
        product_url: form.product_url || null,
      });
      const grp = allCats.find(g => g.id === parseInt(gid));
      const parent = grp ? allCats.find(p => p.id === grp.parent_id) : null;
      setDone(true);
      setTimeout(() => {
        onCreated({
          ...v,
          group_name: grp?.name || form.new_group_name,
          parent_name: parent?.name || null,
          part_group_id: gid,
          group_image_path: null, variant_image_path: null, parent_image_path: null
        });
      }, 800);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  // Done state — show brief success before handing off to parent
  if (done) {
    return (
      <div style={{
        background:'#1f3a1f', border:'1px solid #238636', borderRadius:6,
        padding:'12px 14px', display:'flex', alignItems:'center', gap:10
      }}>
        <div style={{
          width:24, height:24, borderRadius:'50%', background:'#238636',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#fff', fontWeight:700, fontSize:14, flexShrink:0
        }}>✓</div>
        <div>
          <div style={{color:'#56d364', fontWeight:600, fontSize:13}}>Part created and mapped</div>
          <div style={{color:'#8b949e', fontSize:11, marginTop:2}}>{form.label}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{background:'#0d1117', border:'1px solid #58a6ff', borderRadius:6, padding:10}}>
      <div style={{fontSize:12, color:'#58a6ff', marginBottom:8, fontWeight:600}}>New Part</div>
      {err && <div className="alert alert-error" style={{marginBottom:8, padding:'5px 8px', fontSize:11}}>{err}</div>}

      {/* Category picker */}
      <div style={{display:'flex', gap:4, marginBottom:8}}>
        <button className={`btn btn-sm ${useExisting?'btn-primary':'btn-secondary'}`}
          style={{fontSize:11, flex:1}} onClick={() => setUseExisting(true)}>Existing</button>
        <button className={`btn btn-sm ${!useExisting?'btn-primary':'btn-secondary'}`}
          style={{fontSize:11, flex:1}} onClick={() => setUseExisting(false)}>New Category</button>
      </div>

      {useExisting ? (
        <select value={form.group_id} onChange={e => f('group_id', e.target.value)}
          style={{width:'100%', marginBottom:8, fontSize:12}}>
          <option value="">Select category...</option>
          {leafCats.map(c => <option key={c.id} value={c.id}>{getLabelFor(c)}</option>)}
        </select>
      ) : (
        <div style={{display:'flex', gap:4, marginBottom:8}}>
          <select value={form.new_group_parent} onChange={e => f('new_group_parent', e.target.value)}
            style={{flex:1, fontSize:11}}>
            <option value="">Top level</option>
            {allCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input placeholder="Category name" value={form.new_group_name}
            onChange={e => f('new_group_name', e.target.value)} style={{flex:1, fontSize:11}} />
        </div>
      )}

      <div style={{marginBottom:6}}>
        <div style={{fontSize:10, color:'#8b949e', marginBottom:3}}>Label *</div>
        <input value={form.label} onChange={e => f('label', e.target.value)}
          style={{width:'100%', fontSize:12}} />
      </div>
      <div style={{display:'flex', gap:6, marginBottom:6}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10, color:'#8b949e', marginBottom:3}}>Qty Available</div>
          <input type="number" value={form.quantity_available}
            onChange={e => f('quantity_available', e.target.value)}
            style={{width:'100%', fontSize:12}} />
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:10, color:'#8b949e', marginBottom:3}}>Location</div>
          <input value={form.storage_location} onChange={e => f('storage_location', e.target.value)}
            placeholder="Bin A3" style={{width:'100%', fontSize:12}} />
        </div>
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:10, color:'#8b949e', marginBottom:3}}>Notes</div>
        <textarea value={form.notes} onChange={e => f('notes', e.target.value)}
          rows={2} style={{width:'100%', fontSize:12, resize:'none'}} />
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:10, color:'#8b949e', marginBottom:3}}>Product URL</div>
        <input value={form.product_url} onChange={e => f('product_url', e.target.value)}
          placeholder="https://..." style={{width:'100%', fontSize:12}} />
      </div>
      <div style={{display:'flex', gap:6}}>
        <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={submit} disabled={saving}>
          {saving ? 'Creating...' : 'Create & Map'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Order detail modal ────────────────────────────────────────────────────────
function OrderDetailModal({ orderId, onClose, onRefresh }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrder(orderId).then(o => { setOrder(o); setLoading(false); });
  }, [orderId]);

  const mapItem = async (item) => {
    const q = window.prompt('Enter part variant ID to map (or 0 to unmap):', item.part_variant_id || '');
    if (q === null) return;
    const vid = parseInt(q) || null;
    await api.mapOrderItem(item.id, { part_variant_id: vid });
    api.getOrder(orderId).then(setOrder);
    onRefresh();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:720}}>
        {loading ? <div className="loading">Loading...</div> : !order ? null : (
          <>
            <h2>Order #{order.id} — {order.date}</h2>
            <div style={{display:'flex', gap:10, marginBottom:12, flexWrap:'wrap'}}>
              <span className={`badge ${order.status==='received'?'badge-green':'badge-yellow'}`}>
                {order.status}
              </span>
              {order.imported_at && (
                <span style={{color:'#8b949e', fontSize:12}}>
                  Imported {new Date(order.imported_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <table>
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Mapped To</th><th></th></tr>
              </thead>
              <tbody>
                {order.items.map(item => (
                  <tr key={item.id}>
                    <td style={{fontSize:12, maxWidth:300}}>
                      <span title={item.raw_name}>
                        {item.raw_name.slice(0,80)}{item.raw_name.length>80?'...':''}
                      </span>
                    </td>
                    <td>{item.quantity}</td>
                    <td style={{fontSize:12}}>
                      {item.part_variant_id
                        ? <span style={{color:'#56d364'}}>{item.group_name} — {item.variant_label}</span>
                        : <span style={{color:'#8b949e'}}>Unmapped</span>}
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => mapItem(item)}>Map</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
