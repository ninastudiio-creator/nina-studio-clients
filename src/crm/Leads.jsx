import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import { PRODUCTS, daysSince, daysText, whatsappHref } from './lib'

const LEAD_STAGES = [
  { key: 'new', label: 'פנייה חדשה', owner: 'me', late: 1 },
  { key: 'talking', label: 'בשיחה', owner: 'client', late: 5 },
  { key: 'offer_sent', label: 'קיבלה הצעה / לינק', owner: 'client', late: 4 },
]
const CLOSED = { won: 'הפכה ללקוחה', lost: 'לא רלוונטי' }
const SOURCES = { whatsapp: 'וואטסאפ', instagram: 'אינסטגרם', wix_cart: 'עגלה נטושה', wix_form: 'טופס באתר', referral: 'המלצה', past_client: 'לקוחת עבר', other: 'אחר' }
const LOST_REASONS = ['מחיר', 'לא ענתה', 'סתם שאלה', 'הזמינה ממישהו אחר', 'אחר']

const EMPTY = { name: '', phone: '', source: 'whatsapp', interest: '', notes: '' }

function LeadEditor({ lead, onClose, onSaved }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(lead.id ? lead : { ...EMPTY })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function save(extra = {}) {
    if (!form.name.trim() && !form.phone.trim()) return alert('צריך לפחות שם או טלפון')
    setBusy(true)
    const row = {
      name: form.name.trim(), phone: form.phone.trim(), source: form.source, interest: form.interest,
      notes: form.notes, ...extra,
    }
    if (extra.stage && extra.stage !== lead.stage) row.stage_since = new Date().toISOString()
    const res = lead.id
      ? await supabase.from('leads').update(row).eq('id', lead.id)
      : await supabase.from('leads').insert({ ...row, last_contact_at: new Date().toISOString() })
    setBusy(false)
    if (res.error) return alert('השמירה נכשלה')
    onSaved()
  }

  // Lead → client (matched by phone) + a new order, then open the client file.
  async function convert() {
    if (!confirm(`להפוך את ${form.name || form.phone} ללקוחה ולפתוח לה הזמנה?`)) return
    setBusy(true)
    const digits = form.phone.replace(/\D/g, '').slice(-9)
    let clientId = lead.client_id
    if (!clientId && digits.length === 9) {
      const { data } = await supabase.from('clients').select('id, lines').eq('phone_norm', digits).limit(1)
      if (data?.[0]) {
        clientId = data[0].id
        if (!data[0].lines.includes('albums')) await supabase.from('clients').update({ lines: [...data[0].lines, 'albums'] }).eq('id', clientId)
      }
    }
    if (!clientId) {
      const { data, error } = await supabase
        .from('clients')
        .insert({ name: form.name || form.phone, phone: form.phone, lines: ['albums'], source: SOURCES[form.source] || form.source })
        .select('id')
        .single()
      if (error) return setBusy(false) || alert('יצירת הלקוחה נכשלה')
      clientId = data.id
    }
    const product = Object.keys(PRODUCTS).find((k) => form.interest === k) || null
    const { data: order, error } = await supabase
      .from('orders')
      .insert({ client_id: clientId, product, ordered_at: new Date().toISOString().slice(0, 10), stage: 'awaiting_payment', notes: form.notes })
      .select('id')
      .single()
    if (error) return setBusy(false) || alert('יצירת ההזמנה נכשלה')
    await supabase.from('leads').update({ stage: 'won', stage_since: new Date().toISOString(), client_id: clientId, converted_order_id: order.id }).eq('id', lead.id)
    await supabase.from('events').insert({ client_id: clientId, order_id: order.id, lead_id: lead.id, type: 'note', text: `הפכה מליד ללקוחה (${SOURCES[form.source] || 'מקור לא ידוע'})` })
    navigate(`/crm/clients/${clientId}`)
  }

  async function markLost() {
    const reason = prompt(`למה לא רלוונטי? (${LOST_REASONS.join(' / ')})`, LOST_REASONS[0])
    if (reason === null) return
    await save({ stage: 'lost', lost_reason: reason })
  }

  return (
    <div className="card" style={{ marginBottom: 16, borderTop: '4px solid var(--color-blue)' }}>
      <div className="file-head" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{lead.id ? form.name || form.phone : 'ליד חדש'}</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>סגירה</button>
      </div>
      <div className="fields">
        <label>שם<input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus /></label>
        <label>טלפון<input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label>מאיפה הגיעה
          <select value={form.source || 'other'} onChange={(e) => set('source', e.target.value)}>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>מתעניינת ב
          <select value={form.interest} onChange={(e) => set('interest', e.target.value)}>
            <option value="">לא ידוע</option>
            {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="wide">הערות<textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="מה שאלה, לאיזה אירוע, מתי צריכה..." /></label>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save()}>{lead.id ? 'שמירה' : 'הוספה'}</button>
        {lead.id && (
          <>
            {LEAD_STAGES.filter((s) => s.key !== lead.stage).map((s) => (
              <button key={s.key} className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save({ stage: s.key })}>← {s.label}</button>
            ))}
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save({ last_contact_at: new Date().toISOString() })}>דיברנו היום</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={convert}>🎉 הזמינה!</button>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={markLost}>לא רלוונטי</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Leads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showClosed, setShowClosed] = useState(false)

  async function load() {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    setLeads(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  const open = (leads || []).filter((l) => !CLOSED[l.stage])
  const closed = (leads || []).filter((l) => CLOSED[l.stage])
  const lastTouch = (l) => l.last_contact_at || l.stage_since
  const isLateLead = (l) => daysSince(lastTouch(l)) > (LEAD_STAGES.find((s) => s.key === l.stage)?.late ?? 99)
  const won = closed.filter((l) => l.stage === 'won').length

  return (
    <CrmLayout>
      <div className="file-head">
        <div>
          <h1>לידים</h1>
          <p className="sub">מי שפנתה ועוד לא הזמינה. בהמשך הבוט יוסיף לכאן לבד פניות מוואטסאפ.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ ליד חדש</button>
      </div>

      {editing && (
        <LeadEditor
          key={editing.id || 'new'}
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {!leads ? (
        <p>טוען...</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><b>{open.length}</b><span>לידים פתוחים</span></div>
            <div className="kpi"><b>{open.filter(isLateLead).length}</b><span>צריכות פולואפ</span></div>
            <div className="kpi"><b>{won}</b><span>הפכו ללקוחות</span></div>
            <div className="kpi"><b>{closed.length ? Math.round((won / closed.length) * 100) : 0}%</b><span>אחוז סגירה</span></div>
          </div>

          <div className="board">
            {LEAD_STAGES.map((s) => {
              const items = open.filter((l) => l.stage === s.key)
              return (
                <div key={s.key} className={`board-col ${s.owner}`} style={{ flexBasis: 260 }}>
                  <h4>{s.label}<span className="muted">{items.length}</span></h4>
                  {items.map((l) => (
                    <button
                      key={l.id}
                      className={`board-tile ${isLateLead(l) ? 'late' : ''}`}
                      style={{ width: '100%', textAlign: 'right', border: 0, font: 'inherit' }}
                      onClick={() => setEditing(l)}
                    >
                      <div className="name">{l.name || l.phone}</div>
                      <div className="muted">
                        {SOURCES[l.source] || 'מקור לא ידוע'}
                        {l.interest && ` · ${PRODUCTS[l.interest] || l.interest}`}
                        {' · '}מגע אחרון {daysText(daysSince(lastTouch(l)))}
                      </div>
                      {l.notes && <div className="muted" style={{ marginTop: 4 }}>{l.notes.slice(0, 80)}</div>}
                      {whatsappHref(l.phone) && (
                        <a href={whatsappHref(l.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="muted">💬 וואטסאפ</a>
                      )}
                    </button>
                  ))}
                  {items.length === 0 && <div className="muted" style={{ padding: 4 }}>ריק</div>}
                </div>
              )
            })}
          </div>

          <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '12px 0' }}>
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            הצגת לידים סגורים ({closed.length})
          </label>
          {showClosed && closed.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>שם</th><th>מקור</th><th>תוצאה</th><th>סיבה</th><th>נסגר</th></tr></thead>
                <tbody>
                  {closed.map((l) => (
                    <tr key={l.id} className="clickable" onClick={() => (l.client_id ? navigate(`/crm/clients/${l.client_id}`) : setEditing(l))}>
                      <td className="name">{l.name || l.phone}</td>
                      <td>{SOURCES[l.source] || '-'}</td>
                      <td><span className={`pill ${l.stage === 'won' ? 'done' : 'neutral'}`}>{CLOSED[l.stage]}</span></td>
                      <td className="muted">{l.lost_reason}</td>
                      <td>{new Date(l.stage_since).toLocaleDateString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </CrmLayout>
  )
}
