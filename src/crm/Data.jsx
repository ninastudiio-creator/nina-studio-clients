import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import { PRODUCTS, money } from './lib'

// Validated with the dataviz palette checker (lightness, CVD, contrast).
const REVENUE = '#4a6fd1'
const PROFIT = '#b7811a'
const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']

const sum = (list, key) => list.reduce((s, o) => s + (Number(o[key]) || 0), 0)

// Round tick step (1 / 2 / 2.5 / 5 × 10^k) giving about five gridlines.
function niceTicks(v) {
  if (v <= 0) return [0, 1000]
  const raw = v / 5
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)
  const ticks = []
  for (let t = 0; t < v + step; t += step) ticks.push(t)
  return ticks
}

// Rounded top, square baseline.
function barPath(x, y, w, h) {
  if (h <= 0) return ''
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function MonthlyChart({ months }) {
  const [hover, setHover] = useState(null)
  const W = 760, H = 260, top = 16, bottom = 28, left = 8, right = 56
  const ticks = niceTicks(Math.max(...months.map((m) => m.revenue), 0))
  const max = ticks[ticks.length - 1]
  const band = (W - left - right) / 12
  const bw = Math.min(16, band / 2 - 4)
  const y = (v) => top + (H - top - bottom) * (1 - v / max)
  // Right-to-left: January on the right.
  const bandX = (i) => W - right - band * (i + 1)

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="הכנסות ורווח לפי חודש">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="#ece8df" strokeWidth="1" />
            <text x={W - right + 8} y={y(t) + 4} fontSize="11" fill="#6b6759" textAnchor="start">
              {t >= 1000 ? `${(t / 1000).toLocaleString('he-IL')}K` : t}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = bandX(i)
          const cx = x + band / 2
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={top} width={band} height={H - top - bottom} fill={hover === i ? '#f4f1eb' : 'transparent'} />
              {/* Revenue on the right of the pair, profit on the left (RTL reading order). */}
              <path d={barPath(cx + 1, y(m.revenue), bw, y(0) - y(m.revenue))} fill={REVENUE} />
              <path d={barPath(cx - 1 - bw, y(Math.max(0, m.profit)), bw, y(0) - y(Math.max(0, m.profit)))} fill={PROFIT} />
              <text x={cx} y={H - 8} fontSize="11" fill="#6b6759" textAnchor="middle">{MONTHS[i]}</text>
            </g>
          )
        })}
        <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke="#cfc8ba" strokeWidth="1" />
      </svg>
      {hover !== null && months[hover].count > 0 && (
        <div
          style={{
            position: 'absolute', top: 0, right: `${((W - bandX(hover) - band / 2) / W) * 100}%`, transform: 'translateX(50%)',
            background: '#192648', color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}
        >
          <b>{MONTHS[hover]}</b> · {months[hover].count} הזמנות<br />
          <Swatch color={REVENUE} /> הכנסות {money(months[hover].revenue)}<br />
          <Swatch color={PROFIT} /> רווח {money(months[hover].profit)}
        </div>
      )}
    </div>
  )
}

const Swatch = ({ color }) => (
  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color, marginLeft: 6, verticalAlign: 'middle' }} />
)

const PURPOSES = { chat: 'שיחות בטלגרם', diprint_extract: 'קריאת מיילים מדיפרינט', other: 'אחר' }
const usd = (n) => `$${Number(n || 0).toFixed(2)}`

// This month's Claude API cost for the agent (estimates logged by the agent itself).
function ClaudeCost() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    supabase.from('claude_usage_daily').select('*').gte('day', first).then(({ data }) => setRows(data || []))
  }, [])

  if (!rows) return null
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const total = rows.reduce((s, r) => s + Number(r.cost_usd), 0)
  const projection = (total / now.getDate()) * daysInMonth
  const byPurpose = Object.entries(
    rows.reduce((acc, r) => ({ ...acc, [r.purpose]: (acc[r.purpose] || 0) + Number(r.cost_usd) }), {})
  ).sort((a, b) => b[1] - a[1])
  const today = rows.filter((r) => r.day === now.toISOString().slice(0, 10)).reduce((s, r) => s + Number(r.cost_usd), 0)

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>🤖 עלות Claude החודש (הערכה)</h3>
      {rows.length === 0 ? (
        <p className="muted">עוד אין נתונים החודש.</p>
      ) : (
        <>
          <div className="kpis" style={{ marginBottom: 8 }}>
            <div className="kpi"><b>{usd(total)}</b><span>עד היום</span></div>
            <div className="kpi"><b>{usd(projection)}</b><span>תחזית לסוף החודש</span></div>
            <div className="kpi"><b>{usd(today)}</b><span>היום</span></div>
          </div>
          <table>
            <tbody>
              {byPurpose.map(([k, v]) => (
                <tr key={k}><td>{PURPOSES[k] || k}</td><td>{usd(v)}</td><td className="muted">{Math.round((v / (total || 1)) * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            הבוט מתריע בטלגרם אם התחזית עוברת $6 או אם יום עולה מעל $0.50. היתרה האמיתית נמצאת ב-console.anthropic.com.
          </p>
        </>
      )}
    </div>
  )
}

export default function Data() {
  const [orders, setOrders] = useState(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, client_id, product, ordered_at, price, profit, stage, clients(name)')
      .not('ordered_at', 'is', null)
      .then(({ data }) => setOrders(data || []))
  }, [])

  const years = useMemo(() => [...new Set((orders || []).map((o) => Number(o.ordered_at.slice(0, 4))))].sort((a, b) => b - a), [orders])

  const view = useMemo(() => {
    if (!orders) return null
    const inYear = orders.filter((o) => o.ordered_at.startsWith(String(year)))
    const months = MONTHS.map((_, i) => {
      const list = inYear.filter((o) => Number(o.ordered_at.slice(5, 7)) === i + 1)
      return { count: list.length, revenue: sum(list, 'price'), profit: sum(list, 'profit') }
    })
    // Same period last year, for a fair comparison of the current year.
    const now = new Date()
    const cutoff = year === now.getFullYear() ? now.toISOString().slice(5, 10) : '12-31'
    const lastYear = orders.filter((o) => o.ordered_at.startsWith(String(year - 1)) && o.ordered_at.slice(5, 10) <= cutoff)
    const products = Object.keys(PRODUCTS)
      .map((p) => {
        const list = inYear.filter((o) => o.product === p)
        return { key: p, count: list.length, revenue: sum(list, 'price'), profit: sum(list, 'profit') }
      })
      .filter((p) => p.count)
      .sort((a, b) => b.revenue - a.revenue)
    const unknown = inYear.filter((o) => !o.product || !PRODUCTS[o.product]).length

    // Repeat clients are counted over all years.
    const byClient = {}
    for (const o of orders) {
      const c = (byClient[o.client_id] ||= { id: o.client_id, name: o.clients?.name, count: 0, total: 0, last: '' })
      c.count += 1
      c.total += Number(o.price) || 0
      if (o.ordered_at > c.last) c.last = o.ordered_at
    }
    const clients = Object.values(byClient)
    const repeat = clients.filter((c) => c.count > 1).sort((a, b) => b.count - a.count || b.total - a.total)
    const best = months.reduce((b, m, i) => (m.revenue > (months[b]?.revenue ?? -1) ? i : b), 0)

    return {
      inYear, months, products, unknown, repeat, clients, best,
      revenue: sum(inYear, 'price'),
      profit: sum(inYear, 'profit'),
      noProfit: inYear.filter((o) => o.price != null && o.profit == null).length,
      lastRevenue: sum(lastYear, 'price'),
      lastCount: lastYear.length,
      cutoff,
    }
  }, [orders, year])

  const delta = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null)

  return (
    <CrmLayout>
      <h1>נתונים</h1>
      <p className="sub">הכנסות כוללות מע"מ (מ-2026). רווח נטו = אחרי מע"מ, הדפסה ומשלוח. המספרים מ-2024–2025 מגיעים מהשיטס כמו שהם.</p>

      <div className="toolbar">
        {years.map((y) => (
          <button key={y} className={`chip ${year === y ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>

      {!view ? (
        <p>טוען...</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <b>{view.inYear.length}</b>
              <span>
                הזמנות
                {delta(view.inYear.length, view.lastCount) !== null && ` · ${delta(view.inYear.length, view.lastCount) > 0 ? '+' : ''}${delta(view.inYear.length, view.lastCount)}% מול ${year - 1}`}
              </span>
            </div>
            <div className="kpi">
              <b>{money(view.revenue)}</b>
              <span>
                הכנסות
                {delta(view.revenue, view.lastRevenue) !== null && ` · ${delta(view.revenue, view.lastRevenue) > 0 ? '+' : ''}${delta(view.revenue, view.lastRevenue)}% מול ${year - 1}`}
              </span>
            </div>
            <div className="kpi">
              <b>{money(view.profit)}</b>
              <span>רווח נטו{view.noProfit > 0 && ` · בלי ${view.noProfit} הזמנות שחסרים בהן עמודים`}</span>
            </div>
            <div className="kpi"><b>{money(view.inYear.length ? view.revenue / view.inYear.length : 0)}</b><span>ממוצע להזמנה</span></div>
          </div>
          {view.cutoff !== '12-31' && view.lastCount > 0 && (
            <p className="muted" style={{ marginTop: -8 }}>ההשוואה ל-{year - 1} היא לאותה תקופה (עד {view.cutoff.split('-').reverse().join('.')}).</p>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="file-head" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>הכנסות ורווח לפי חודש · {year}</h3>
              <div className="btn-row" style={{ alignItems: 'center', fontSize: '0.85rem' }}>
                <span><Swatch color={REVENUE} />הכנסות</span>
                <span><Swatch color={PROFIT} />רווח נטו</span>
                <button className="chip" onClick={() => setShowTable((v) => !v)}>{showTable ? 'גרף' : 'טבלה'}</button>
              </div>
            </div>
            {showTable ? (
              <table>
                <thead><tr><th>חודש</th><th>הזמנות</th><th>הכנסות</th><th>רווח נטו</th></tr></thead>
                <tbody>
                  {view.months.map((m, i) => (
                    <tr key={i}><td>{MONTHS[i]}</td><td>{m.count}</td><td>{money(m.revenue)}</td><td>{money(m.profit)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <MonthlyChart months={view.months} />
            )}
            {view.months[view.best].revenue > 0 && (
              <p className="muted" style={{ margin: '8px 0 0' }}>
                החודש החזק: {MONTHS[view.best]} ({view.months[view.best].count} הזמנות, {money(view.months[view.best].revenue)})
              </p>
            )}
          </div>

          <div className="crm-grid">
            <div className="card">
              <h3>לפי מוצר · {year}</h3>
              <table>
                <thead><tr><th>מוצר</th><th>הזמנות</th><th>הכנסות</th><th>רווח ממוצע</th></tr></thead>
                <tbody>
                  {view.products.map((p) => (
                    <tr key={p.key}>
                      <td>
                        {PRODUCTS[p.key]}
                        <div style={{ height: 6, borderRadius: 3, background: REVENUE, width: `${(p.revenue / (view.products[0]?.revenue || 1)) * 100}%`, marginTop: 4 }} />
                      </td>
                      <td>{p.count}</td>
                      <td>{money(p.revenue)}</td>
                      <td>{money(p.profit / p.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.unknown > 0 && <p className="muted" style={{ margin: '8px 0 0' }}>{view.unknown} הזמנות בלי מוצר מוגדר</p>}
            </div>

            <div className="card">
              <h3>לקוחות חוזרות (כל השנים)</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                {view.repeat.length} מתוך {view.clients.length} הזמינו יותר מפעם אחת ({Math.round((view.repeat.length / (view.clients.length || 1)) * 100)}%).
                המספר יעלה ככל שמאחדים כפילויות.
              </p>
              {view.repeat.slice(0, 10).map((c) => (
                <Link key={c.id} to={`/crm/clients/${c.id}`} className="list-row">
                  <div>
                    <div className="name">{c.name}</div>
                    <div className="muted">אחרונה: {new Date(c.last).toLocaleDateString('he-IL')}</div>
                  </div>
                  <div className="days">{c.count} הזמנות · {money(c.total)}</div>
                </Link>
              ))}
            </div>
          </div>
          <ClaudeCost />
        </>
      )}
    </CrmLayout>
  )
}
