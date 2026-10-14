import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import {
  FLAGS, ORDER_FIELDS, stageSinceText, OWNERS, PRODUCTS, isLate, money, productText, stageOf, stagesFor, useStages,
} from './lib'

export default function Orders() {
  const stages = useStages()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [orders, setOrders] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkStage, setBulkStage] = useState('closed')
  const [busy, setBusy] = useState(false)

  const owner = params.get('owner') || 'all'
  const product = params.get('product') || 'all'
  const stageFilter = params.get('stage') || ''
  const mode = params.get('mode') || 'table'
  const showClosed = params.get('closed') === '1'
  const [query, setQuery] = useState('')

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value === null || value === 'all' || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  async function load() {
    let q = supabase.from('orders').select(`${ORDER_FIELDS}, clients(name, phone)`).order('ordered_at', { ascending: false })
    if (!showClosed) q = q.neq('stage', 'closed')
    const { data } = await q
    setOrders(data || [])
    setSelected(new Set())
  }

  useEffect(() => {
    load()
  }, [showClosed])

  const list = useMemo(() => {
    if (!orders || !stages) return []
    const qq = query.trim()
    return orders.filter(
      (o) =>
        (owner === 'all' || stageOf(stages, o.stage)?.owner === owner) &&
        (product === 'all' || o.product === product) &&
        (!stageFilter || o.stage === stageFilter) &&
        (!qq || o.clients?.name?.includes(qq) || (o.clients?.phone || '').includes(qq) || o.notes.includes(qq))
    )
  }, [orders, stages, owner, product, stageFilter, query])

  async function changeStage(order, stage) {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, stage, stage_since: new Date().toISOString() } : o)))
    const { error } = await supabase.from('orders').update({ stage }).eq('id', order.id)
    if (error) {
      alert('העדכון נכשל')
      load()
    }
  }

  async function bulkMove() {
    if (!selected.size) return
    setBusy(true)
    const patch = { stage: bulkStage }
    if (bulkStage === 'closed') patch.needs_review = false
    const { error } = await supabase.from('orders').update(patch).in('id', [...selected])
    setBusy(false)
    if (error) alert('העדכון נכשל')
    load()
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const boardStages = (stages || []).filter((s) => (showClosed || s.key !== 'closed') && (owner === 'all' || s.owner === owner))
  const ready = orders && stages

  return (
    <CrmLayout>
      <h1>הזמנות</h1>
      <p className="sub">
        {showClosed ? 'כל ההזמנות' : 'ההזמנות הפתוחות'} לפי שלב. לחיצה על לקוחה פותחת את התיק שלה.
      </p>

      <div className="toolbar">
        <input type="search" className="search" placeholder="🔍 חיפוש לפי שם או טלפון" value={query} onChange={(e) => setQuery(e.target.value)} />
        {['all', 'me', 'client', 'neutral'].map((k) => (
          <button key={k} className={`chip ${owner === k ? 'on' : ''}`} onClick={() => setParam('owner', k)}>
            {k === 'all' ? 'הכול' : OWNERS[k]}
          </button>
        ))}
        <select value={product} onChange={(e) => setParam('product', e.target.value)}>
          <option value="all">כל המוצרים</option>
          {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={stageFilter} onChange={(e) => setParam('stage', e.target.value)}>
          <option value="">כל השלבים</option>
          {(stages || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setParam('closed', e.target.checked ? '1' : null)} />
          כולל סגורות
        </label>
        <span style={{ flex: 1 }} />
        <button className={`chip ${mode === 'table' ? 'on' : ''}`} onClick={() => setParam('mode', null)}>טבלה</button>
        <button className={`chip ${mode === 'board' ? 'on' : ''}`} onClick={() => setParam('mode', 'board')}>לוח</button>
      </div>

      {!ready && <p>טוען...</p>}

      {ready && mode === 'board' && (
        <div className="board">
          {boardStages.map((s) => {
            const items = list.filter((o) => o.stage === s.key)
            return (
              <div key={s.key} className={`board-col ${s.owner}`}>
                <h4>{s.label}<span className="muted">{items.length}</span></h4>
                {items.map((o) => (
                  <Link key={o.id} to={`/crm/clients/${o.client_id}`} className={`board-tile ${isLate(stages, o) ? 'late' : ''}`}>
                    <div className="name">{o.clients?.name}</div>
                    <div className="muted">{productText(o)} · {stageSinceText(o)}</div>
                    {o.flag && <span className="pill flag">{FLAGS[o.flag]}</span>}{' '}
                    {o.needs_review && <span className="pill review">לבדיקה</span>}
                  </Link>
                ))}
                {s.key === 'awaiting_print' && items.length === 0 && (
                  <div className="muted" style={{ padding: 4 }}>כאן יופיעו אלבומים מאושרים שמחכים שתשלחי לדפוס</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {ready && mode === 'table' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={list.length > 0 && list.every((o) => selected.has(o.id))}
                    onChange={(e) => setSelected(new Set(e.target.checked ? list.map((o) => o.id) : []))}
                  />
                </th>
                <th>לקוחה</th><th>מוצר</th><th>שלב</th><th>אצל מי</th><th>בשלב</th><th>הוזמן</th><th>מחיר</th><th>רווח</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const s = stageOf(stages, o.stage)
                return (
                  <tr key={o.id} className="clickable" onClick={() => navigate(`/crm/clients/${o.client_id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                    </td>
                    <td className="name">{o.clients?.name}</td>
                    <td>{productText(o)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select value={o.stage} onChange={(e) => changeStage(o, e.target.value)}>
                        {stagesFor(stages, o.product).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                      {o.flag && <> <span className="pill flag">{FLAGS[o.flag]}</span></>}
                    </td>
                    <td><span className={`pill ${s?.owner}`}>{OWNERS[s?.owner]}</span></td>
                    <td className={`days ${isLate(stages, o) ? 'late' : ''}`}>{stageSinceText(o)}</td>
                    <td>{o.ordered_at ? new Date(o.ordered_at).toLocaleDateString('he-IL') : '-'}</td>
                    <td>{money(o.price)}</td>
                    <td>{o.profit != null ? money(o.profit) : <span className="muted">{o.price == null ? '-' : 'חסרים עמודים'}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {list.length === 0 && <p className="muted" style={{ padding: 16 }}>אין הזמנות שמתאימות לסינון.</p>}
        </div>
      )}

      {selected.size > 0 && mode === 'table' && (
        <div className="bulkbar">
          <b>{selected.size} נבחרו</b>
          <span>להעביר ל:</span>
          <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
            {(stages || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={bulkMove}>
            {busy ? 'מעדכנת...' : 'העברה'}
          </button>
          <button className="btn btn-sm" style={{ color: '#fff' }} onClick={() => setSelected(new Set())}>ביטול</button>
        </div>
      )}
    </CrmLayout>
  )
}
