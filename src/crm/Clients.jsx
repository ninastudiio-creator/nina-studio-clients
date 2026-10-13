import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import { PRODUCTS, dateText, money, stageOf, useStages } from './lib'

const FILTERS = {
  all: 'כולן',
  repeat: 'חוזרות',
  open: 'הזמנה פתוחה',
  wedding: 'חתונה',
  template: 'טמפלט',
  review: 'לבדיקה',
}

const SORTS = {
  last: { label: 'הזמנה אחרונה', fn: (a, b) => (b.last || '').localeCompare(a.last || '') },
  total: { label: 'סה"כ', fn: (a, b) => b.total - a.total },
  count: { label: 'הזמנות', fn: (a, b) => b.count - a.count },
  name: { label: 'שם', fn: (a, b) => a.name.localeCompare(b.name, 'he') },
}

export default function Clients() {
  const stages = useStages()
  const navigate = useNavigate()
  const [clients, setClients] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('last')

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, phone, email, needs_review, orders(price, ordered_at, stage, product)')
      .contains('lines', ['albums'])
      .then(({ data }) =>
        setClients(
          (data || []).map((c) => {
            const orders = c.orders || []
            return {
              ...c,
              count: orders.length,
              total: orders.reduce((sum, o) => sum + (Number(o.price) || 0), 0),
              last: orders.map((o) => o.ordered_at).filter(Boolean).sort().pop() || null,
              open: orders.filter((o) => o.stage !== 'closed'),
              products: [...new Set(orders.map((o) => o.product).filter(Boolean))],
            }
          })
        )
      )
  }, [])

  const stats = useMemo(() => {
    if (!clients) return null
    const paying = clients.filter((c) => c.total > 0)
    const repeat = clients.filter((c) => c.count > 1).length
    return {
      count: clients.length,
      repeat,
      repeatPct: clients.length ? Math.round((repeat / clients.length) * 100) : 0,
      avg: paying.length ? paying.reduce((s, c) => s + c.total, 0) / paying.length : 0,
      open: clients.filter((c) => c.open.length).length,
    }
  }, [clients])

  const list = useMemo(() => {
    if (!clients) return []
    const q = query.trim()
    const digits = q.replace(/\D/g, '')
    return clients
      .filter((c) => {
        if (q && !c.name.includes(q) && !(digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits)) && !(c.email || '').includes(q)) return false
        if (filter === 'repeat') return c.count > 1
        if (filter === 'open') return c.open.length > 0
        if (filter === 'wedding') return c.products.includes('wedding')
        if (filter === 'template') return c.products.includes('template')
        if (filter === 'review') return c.needs_review
        return true
      })
      .sort(SORTS[sort].fn)
  }, [clients, query, filter, sort])

  async function newClient() {
    const name = prompt('שם הלקוחה')
    if (!name?.trim()) return
    const { data, error } = await supabase
      .from('clients')
      .insert({ name: name.trim(), lines: ['albums'], source: 'manual' })
      .select('id')
      .single()
    if (error) return alert('יצירת הלקוחה נכשלה')
    navigate(`/crm/clients/${data.id}`)
  }

  return (
    <CrmLayout>
      <div className="file-head">
        <div>
          <h1>לקוחות</h1>
          <p className="sub">כל מי שהזמינה אלבום, מ-2024 עד היום.</p>
        </div>
        <button className="btn btn-primary" onClick={newClient}>+ לקוחה חדשה</button>
      </div>

      {stats && (
        <div className="kpis">
          <div className="kpi"><b>{stats.count}</b><span>לקוחות</span></div>
          <div className="kpi"><b>{stats.repeat}</b><span>חזרו להזמין ({stats.repeatPct}%)</span></div>
          <div className="kpi"><b>{money(stats.avg)}</b><span>ממוצע ללקוחה</span></div>
          <div className="kpi"><b>{stats.open}</b><span>עם הזמנה פתוחה</span></div>
        </div>
      )}

      <div className="toolbar">
        <input type="search" className="search" placeholder="🔍 חיפוש לפי שם, טלפון או מייל" value={query} onChange={(e) => setQuery(e.target.value)} />
        {Object.entries(FILTERS).map(([k, v]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{v}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span className="muted">מיון:</span>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {!clients ? (
        <p>טוען...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>שם</th><th>טלפון</th><th>הזמנות</th><th>סה"כ</th><th>הזמנה אחרונה</th><th>מוצרים</th><th>עכשיו</th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/crm/clients/${c.id}`)}>
                  <td className="name">
                    {c.name} {c.needs_review && <span className="pill review">לבדיקה</span>}
                  </td>
                  <td>{c.phone || '-'}</td>
                  <td>{c.count}</td>
                  <td>{money(c.total)}</td>
                  <td>{dateText(c.last)}</td>
                  <td className="muted">{c.products.map((p) => PRODUCTS[p]).join(', ') || '-'}</td>
                  <td>
                    {c.open.map((o, i) => {
                      const s = stageOf(stages, o.stage)
                      return <span key={i} className={`pill ${s?.owner}`}>{s?.label}</span>
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ padding: '8px 12px', margin: 0 }}>{list.length} לקוחות</p>
        </div>
      )}
    </CrmLayout>
  )
}
