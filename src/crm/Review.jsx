import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import { dateText, money, productText, stageOf, useStages } from './lib'

const GROUPS = [
  { key: 'printing', title: 'בדפוס יותר מחודש', hint: 'כנראה כבר הגיעו ללקוחות ולא עודכנו בשיטס.', match: (n) => n.includes('בדפוס יותר מחודש') },
  { key: 'dup', title: 'אולי כפילות בין 2025 ל-2026', hint: 'שולמה ב-2025 והמשיכה ב-2026? פתחי את התיק, ואם זו אותה הזמנה, מחקי את השורה הריקה.', match: (n) => n.includes('לאחד') },
  { key: 'other', title: 'חסר מידע', hint: 'בלי סטטוס, בלי מוצר או החזר.', match: () => true },
]

export default function Review() {
  const stages = useStages()
  const [orders, setOrders] = useState(null)
  const [clients, setClients] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: o }, { data: c }] = await Promise.all([
      supabase.from('orders').select('id, client_id, product, product_name, stage, ordered_at, price, notes, review_note, clients(name)').eq('needs_review', true).order('ordered_at'),
      supabase.from('clients').select('id, name, review_note, orders(id)').eq('needs_review', true).order('name'),
    ])
    setOrders(o || [])
    setClients(c || [])
    setSelected(new Set())
  }

  useEffect(() => {
    load()
  }, [])

  async function update(ids, patch) {
    setBusy(true)
    const { error } = await supabase.from('orders').update({ ...patch, needs_review: false }).in('id', ids)
    setBusy(false)
    if (error) alert('העדכון נכשל')
    load()
  }

  async function clientOk(id) {
    await supabase.from('clients').update({ needs_review: false }).eq('id', id)
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

  if (!orders || !clients || !stages) return <CrmLayout><p>טוען...</p></CrmLayout>

  const used = new Set()
  const groups = GROUPS.map((g) => {
    const items = orders.filter((o) => !used.has(o.id) && g.match(o.review_note || ''))
    items.forEach((o) => used.add(o.id))
    return { ...g, items }
  })

  return (
    <CrmLayout>
      <h1>לבדיקה</h1>
      <p className="sub">דברים שסומנו בייבוא מהשיטס. עוברים פעם אחת, וזהו.</p>

      {orders.length === 0 && clients.length === 0 && <div className="card">הכול נבדק 🎉</div>}

      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.key} className="card" style={{ marginBottom: 16 }}>
          <div className="file-head" style={{ marginBottom: 6 }}>
            <div>
              <h3 style={{ marginBottom: 2 }}>{g.title} ({g.items.length})</h3>
              <div className="muted">{g.hint}</div>
            </div>
            {g.key === 'printing' && (
              <div className="btn-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(g.items.map((o) => o.id)))}>סימון כולן</button>
                <button className="btn btn-primary btn-sm" disabled={busy || !g.items.some((o) => selected.has(o.id))}
                  onClick={() => update(g.items.filter((o) => selected.has(o.id)).map((o) => o.id), { stage: 'closed' })}>
                  סגירת המסומנות
                </button>
              </div>
            )}
          </div>
          <table>
            <tbody>
              {g.items.map((o) => (
                <tr key={o.id}>
                  {g.key === 'printing' && (
                    <td style={{ width: 30 }}><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} /></td>
                  )}
                  <td>
                    <Link to={`/crm/clients/${o.client_id}`} className="name" style={{ color: 'inherit' }}>{o.clients?.name}</Link>
                    <div className="muted">{productText(o)} · {dateText(o.ordered_at)} · {money(o.price)}</div>
                  </td>
                  <td className="muted">{o.review_note}{o.notes && ` · "${o.notes}"`}</td>
                  <td><span className="pill neutral">{stageOf(stages, o.stage)?.label}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {o.stage !== 'closed' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => update([o.id], { stage: 'closed' })}>סגירה</button>}{' '}
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => update([o.id], {})}>תקין</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {clients.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 2 }}>לקוחות עם שם חלקי ({clients.length})</h3>
          <div className="muted" style={{ marginBottom: 8 }}>ייתכן שזו לקוחה שכבר קיימת בשם מלא. בתיק הלקוחה יש כפתור "איחוד".</div>
          <table>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/crm/clients/${c.id}`} className="name" style={{ color: 'inherit' }}>{c.name}</Link></td>
                  <td className="muted">{c.orders.length} הזמנות</td>
                  <td style={{ textAlign: 'left' }}><button className="btn btn-ghost btn-sm" onClick={() => clientOk(c.id)}>תקין</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CrmLayout>
  )
}
