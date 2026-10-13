import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import {
  DELIVERY, FLAGS, ORDER_FIELDS, OWNERS, PRODUCTS, dateText, daysSince, daysText, isLate, money, nextStage, productText,
  stageOf, stagesFor, useStages, whatsappHref,
} from './lib'

const SAVE_DELAY = 700
const CLIENT_FIELDS = 'id, name, phone, email, instagram, address, source, notes, needs_review, review_note, lines, created_at'
const NUMBER_FIELDS = ['pages', 'price', 'print_cost', 'shipping_cost']

// Debounced autosave for one row.
function useAutosave(table, id, onSaved) {
  const timer = useRef(null)
  const pending = useRef({})
  const [state, setState] = useState('idle')
  function save(patch) {
    pending.current = { ...pending.current, ...patch }
    setState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const toSave = pending.current
      pending.current = {}
      const { data, error } = await supabase.from(table).update(toSave).eq('id', id).select().single()
      setState(error ? 'error' : 'saved')
      if (!error && onSaved) onSaved(data, toSave)
    }, SAVE_DELAY)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return [save, state]
}

function SaveState({ state }) {
  const text = { saving: 'שומרת...', saved: 'נשמר ✓', error: 'השמירה נכשלה' }[state]
  return text ? <span className="save-state">{text}</span> : null
}

// Money fields Hagar edits by hand are logged, so the agent knows not to overwrite them
// (e.g. with numbers from a Diprint email) without asking.
const TRACKED_FIELDS = { pages: 'מספר עמודים', price: 'מחיר ששולם', print_cost: 'מחיר הדפסה', shipping_cost: 'משלוח' }

function logManualEdits(row, saved) {
  const rows = Object.keys(saved)
    .filter((k) => TRACKED_FIELDS[k])
    .map((field) => ({
      client_id: row.client_id,
      order_id: row.id,
      type: 'field_update',
      text: `${TRACKED_FIELDS[field]}: ${saved[field] ?? 'ריק'}`,
      data: { field, value: saved[field] },
      actor: 'hagar',
    }))
  if (rows.length) supabase.from('events').insert(rows).then()
}

function OrderCard({ order: initial, stages, defaultOpen, onChanged }) {
  const [order, setOrder] = useState(initial)
  const [save, saveState] = useAutosave('orders', initial.id, (row, saved) => {
    setOrder((o) => ({ ...o, profit: row.profit, print_cost_auto: row.print_cost_auto }))
    logManualEdits(row, saved)
  })
  const stage = stageOf(stages, order.stage)
  const next = nextStage(stages, order)

  // Costs are stored before VAT (like the sheet); on screen they're shown and typed including VAT.
  const vat = 1 + Number(order.vat_rate || 0)
  const withVat = (v) => (v == null ? null : Math.round(Number(v) * vat * 100) / 100)
  const hasVat = vat > 1
  // Two decimals so the before-VAT column adds up to the profit.
  const amount = (v) =>
    v == null ? '-' : `₪${Number(v).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  function setCost(key, value) {
    const v = value === '' ? null : Math.round((Number(value) / vat) * 100) / 100
    setOrder((o) => ({ ...o, [key]: v }))
    save({ [key]: key === 'shipping_cost' ? v ?? 0 : v })
  }

  function set(key, value) {
    const v = NUMBER_FIELDS.includes(key) ? (value === '' ? null : Number(value)) : value
    setOrder((o) => ({ ...o, [key]: v }))
    save({ [key]: v })
  }

  async function moveTo(key) {
    if (key === order.stage) return
    const patch = { stage: key }
    if (key === 'closed') patch.needs_review = false
    setOrder((o) => ({ ...o, ...patch, stage_since: new Date().toISOString() }))
    const { error } = await supabase.from('orders').update(patch).eq('id', order.id)
    if (error) alert('העדכון נכשל')
    onChanged()
  }

  async function clearReview() {
    setOrder((o) => ({ ...o, needs_review: false }))
    await supabase.from('orders').update({ needs_review: false }).eq('id', order.id)
    onChanged()
  }

  async function remove() {
    if (!confirm('למחוק את ההזמנה הזו? אי אפשר לבטל.')) return
    await supabase.from('orders').delete().eq('id', order.id)
    onChanged(true)
  }

  const path = stagesFor(stages, order.product)
  const currentIndex = path.findIndex((s) => s.key === order.stage)
  const late = isLate(stages, order)

  const printCost = order.print_cost ?? order.print_cost_auto
  const profitText = order.price == null ? 'חסר מחיר' : 'חסרים עמודים'

  return (
    <details className="card order-card" open={defaultOpen}>
      <summary>
        <div>
          <div className="name">{productText(order)}{order.topic && <span className="muted"> · {order.topic}</span>}</div>
          <div className="muted">הוזמן {dateText(order.ordered_at)}</div>
        </div>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          {order.flag && <span className="pill flag">{FLAGS[order.flag]}</span>}
          {order.needs_review && <span className="pill review">לבדיקה</span>}
          <span className={`pill ${stage?.owner}`}>{stage?.label}</span>
          {order.stage !== 'closed' && <span className={`days ${late ? 'late' : ''}`}>{daysText(daysSince(order.stage_since))}</span>}
        </div>
      </summary>

      {order.needs_review && (
        <div className="review-box">
          <span>לבדוק: {order.review_note || 'סומנה בייבוא מהשיטס'}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearReview}>בדקתי, תקין</button>
        </div>
      )}

      {/* 1. Where it stands */}
      <div className="steps">
        {path.map((s, i) => (
          <button
            key={s.key}
            className={i < currentIndex ? 'past' : i === currentIndex ? 'current' : ''}
            onClick={() => moveTo(s.key)}
            title={OWNERS[s.owner]}
          >
            {s.label}
          </button>
        ))}
      </div>
      {next && order.stage !== 'closed' && (
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => moveTo(next.key)}>העבירי ל"{next.label}" ←</button>
          <button className="btn btn-ghost btn-sm" onClick={() => moveTo('closed')}>סגירה</button>
        </div>
      )}

      {/* 2. The money: paid − my costs = profit, with and without VAT */}
      <div className="calc">
        <label className="calc-pages">
          <span>מספר עמודים</span>
          <input type="number" value={order.pages ?? ''} onChange={(e) => set('pages', e.target.value)} placeholder="למשל 80" />
          <small>עלות ההדפסה מחושבת לפיו</small>
        </label>

        <div className={`calc-table ${hasVat ? '' : 'no-vat'}`}>
          <span />
          <span className="calc-head">כולל מע"מ</span>
          {hasVat && <span className="calc-head">ללא מע"מ</span>}

          <span className="calc-label">מחיר ששולם</span>
          <span><input type="number" value={order.price ?? ''} onChange={(e) => set('price', e.target.value)} placeholder="0" /></span>
          {hasVat && <span className="calc-num">{amount(order.price == null ? null : order.price / vat)}</span>}

          <span className="calc-label">
            מחיר הדפסה
            <small>
              {order.print_cost != null && !hasVat ? (
                'מהשיטס'
              ) : order.print_cost != null ? (
                <button type="button" className="link-btn" onClick={() => setCost('print_cost', '')}>ידני · חזרה לחישוב לפי עמודים</button>
              ) : order.print_cost_auto != null ? `לפי ${order.pages} עמודים` : 'חסר מספר עמודים'}
            </small>
          </span>
          <span>
            <input
              type="number"
              value={withVat(order.print_cost) ?? ''}
              placeholder={order.print_cost_auto != null ? String(withVat(order.print_cost_auto)) : '-'}
              onChange={(e) => setCost('print_cost', e.target.value)}
            />
          </span>
          {hasVat && <span className="calc-num">{amount(printCost)}</span>}

          <span className="calc-label">
            משלוח
            <small>משלמת לדפוס, כלול במה שהלקוחה שילמה</small>
          </span>
          <span><input type="number" value={withVat(order.shipping_cost) ?? ''} onChange={(e) => setCost('shipping_cost', e.target.value)} placeholder="0" /></span>
          {hasVat && <span className="calc-num">{amount(order.shipping_cost)}</span>}

          <span className="calc-divider" />

          <span className="calc-label calc-total">
            רווח נטו
            <small style={{ fontWeight: 400 }}>{hasVat ? 'מה ששולם, פחות הדפסה ומשלוח, ללא מע"מ' : 'מה ששולם, פחות הדפסה ומשלוח'}</small>
          </span>
          {hasVat && <span className="calc-total" />}
          <span className="calc-num calc-total profit">{order.profit != null ? amount(order.profit) : profitText}</span>
        </div>
      </div>

      {/* 3. Notes + links */}
      <textarea rows={2} value={order.notes} onChange={(e) => set('notes', e.target.value)} placeholder="הערות להזמנה..." style={{ width: '100%', marginTop: 12 }} />
      <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span className="btn-row" style={{ alignItems: 'center' }}>
          {order.drive_folder_url && <a className="btn btn-secondary btn-sm" href={order.drive_folder_url} target="_blank" rel="noreferrer">📁 תיקייה בדרייב</a>}
          <span className="muted">
            {[order.wix_order_number && `וויקס #${order.wix_order_number}`, order.diprint_order_number && `דיפרינט #${order.diprint_order_number}`, order.delivery && DELIVERY[order.delivery]]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <SaveState state={saveState} />
      </div>

      {/* 4. Everything else, folded */}
      <details className="more">
        <summary>עוד פרטים</summary>
        <div className="fields" style={{ marginTop: 12 }}>
          <label>מוצר
            <select value={order.product || ''} onChange={(e) => set('product', e.target.value || null)}>
              <option value="">לא ידוע</option>
              {Object.entries(PRODUCTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>שם הטמפלט / פירוט
            <input type="text" value={order.product_name} onChange={(e) => set('product_name', e.target.value)} />
          </label>
          <label>נושא האלבום
            <input type="text" value={order.topic} onChange={(e) => set('topic', e.target.value)} />
          </label>
          <label>תאריך הזמנה
            <input type="date" value={order.ordered_at || ''} onChange={(e) => set('ordered_at', e.target.value || null)} />
          </label>
          <label>משלוח
            <select value={order.delivery || ''} onChange={(e) => set('delivery', e.target.value || null)}>
              <option value="">לא צוין</option>
              {Object.entries(DELIVERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>איפה שולם
            <input type="text" value={order.paid_via} onChange={(e) => set('paid_via', e.target.value)} />
          </label>
          <label>מצב מיוחד
            <select value={order.flag || ''} onChange={(e) => set('flag', e.target.value || null)}>
              <option value="">אין</option>
              {Object.entries(FLAGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>הזמנה בוויקס
            <input type="text" value={order.wix_order_number || ''} onChange={(e) => set('wix_order_number', e.target.value || null)} />
          </label>
          <label>הזמנה בדיפרינט
            <input type="text" value={order.diprint_order_number || ''} onChange={(e) => set('diprint_order_number', e.target.value || null)} />
          </label>
          <label className="check"><input type="checkbox" checked={order.receipt} onChange={(e) => set('receipt', e.target.checked)} /> קבלה הוצאה</label>
          <label className="check"><input type="checkbox" checked={order.print_paid} onChange={(e) => set('print_paid', e.target.checked)} /> שולם לדפוס</label>
          <label className="wide">תיקייה בדרייב
            <input type="url" value={order.drive_folder_url} onChange={(e) => set('drive_folder_url', e.target.value)} placeholder="https://drive.google.com/..." />
          </label>
          <label className="wide">כתובת משלוח
            <input type="text" value={order.address} onChange={(e) => set('address', e.target.value)} />
          </label>
        </div>
        <div className="muted" style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span>{order.legacy_ref ? `יובאה מהשיטס (${order.legacy_ref.replace('!', ' שורה ')})` : ''}</span>
          <button className="btn btn-danger btn-sm" onClick={remove}>מחיקת הזמנה</button>
        </div>
      </details>
    </details>
  )
}

function MergeBox({ client, onMerged }) {
  const [q, setQ] = useState(client.name.split(' ')[0])
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setResults([])
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, orders(ordered_at)')
        .contains('lines', ['albums'])
        .ilike('name', `%${term}%`)
        .neq('id', client.id)
        .limit(8)
      setResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q, client.id])

  async function merge(other) {
    if (!confirm(`לאחד את "${other.name}" לתוך התיק של "${client.name}"? כל ההזמנות שלה יעברו לכאן, והתיק שלה יימחק.`)) return
    setBusy(true)
    for (const table of ['orders', 'events', 'leads']) {
      const { error } = await supabase.from(table).update({ client_id: client.id }).eq('client_id', other.id)
      if (error) {
        setBusy(false)
        return alert('האיחוד נכשל באמצע: ' + error.message)
      }
    }
    const { data: full } = await supabase.from('clients').select('phone, email, instagram, address').eq('id', other.id).single()
    const fill = {}
    for (const k of ['phone', 'email', 'instagram', 'address']) if (!client[k] && full?.[k]) fill[k] = full[k]
    await supabase.from('clients').update({ ...fill, needs_review: false }).eq('id', client.id)
    await supabase.from('events').insert({ client_id: client.id, type: 'note', text: `אוחד עם "${other.name}"` })
    await supabase.from('clients').delete().eq('id', other.id)
    setBusy(false)
    onMerged()
  }

  return (
    <div style={{ marginTop: 12 }}>
      <p className="muted" style={{ marginTop: 0 }}>אותה לקוחה מופיעה פעמיים? חפשי ואחדי לתוך התיק הזה.</p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם" style={{ width: '100%' }} />
      {results.map((r) => (
        <div key={r.id} className="list-row">
          <div>
            <div className="name">{r.name}</div>
            <div className="muted">{r.phone || 'בלי טלפון'} · {r.orders.length} הזמנות</div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => merge(r)}>איחוד לכאן</button>
        </div>
      ))}
    </div>
  )
}

const EVENT_ICONS = { order_created: '🛒', field_update: '✏️', stage_change: '➡️', note: '📝', whatsapp_out: '💬', whatsapp_in: '💬', email: '✉️', payment: '💳' }

export default function ClientFile() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const stages = useStages()
  const [client, setClient] = useState(null)
  const [orders, setOrders] = useState(null)
  const [events, setEvents] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const [saveClient, clientSaveState] = useAutosave('clients', clientId)

  async function load() {
    const { data, error } = await supabase.from('clients').select(CLIENT_FIELDS).eq('id', clientId).single()
    if (error || !data) return setError('הלקוחה לא נמצאה')
    setClient(data)
    const [{ data: o }, { data: ev }] = await Promise.all([
      supabase.from('orders').select(ORDER_FIELDS).eq('client_id', clientId).order('ordered_at', { ascending: false, nullsFirst: true }),
      supabase.from('events').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100),
    ])
    setOrders(o || [])
    setEvents(ev || [])
    setVersion((v) => v + 1)
  }

  useEffect(() => {
    setClient(null)
    load()
  }, [clientId])

  function setField(key, value) {
    setClient((c) => ({ ...c, [key]: value }))
    saveClient({ [key]: value })
  }

  async function addOrder() {
    const { error } = await supabase.from('orders').insert({
      client_id: clientId,
      ordered_at: new Date().toISOString().slice(0, 10),
      stage: 'awaiting_payment',
      vat_rate: 0.18,
    })
    if (error) return alert('יצירת ההזמנה נכשלה')
    load()
  }

  async function addNote() {
    if (!note.trim()) return
    await supabase.from('events').insert({ client_id: clientId, type: 'note', text: note.trim() })
    setNote('')
    load()
  }

  async function clearClientReview() {
    setField('needs_review', false)
  }

  async function removeClient() {
    if (!confirm(`למחוק את ${client.name} וכל ההזמנות שלה? אי אפשר לבטל.`)) return
    await supabase.from('clients').delete().eq('id', clientId)
    navigate('/crm/clients')
  }

  if (error) return <CrmLayout><p>{error}</p><Link to="/crm/clients">חזרה ללקוחות</Link></CrmLayout>
  if (!client || !orders || !stages) return <CrmLayout><p>טוען...</p></CrmLayout>

  const wa = whatsappHref(client.phone)
  const total = orders.reduce((s, o) => s + (Number(o.price) || 0), 0)
  const profit = orders.reduce((s, o) => s + (Number(o.profit) || 0), 0)
  const openOrders = orders.filter((o) => o.stage !== 'closed')

  return (
    <CrmLayout>
      <Link to="/crm/clients" className="muted">→ כל הלקוחות</Link>
      <div className="file-head" style={{ marginTop: 8 }}>
        <div>
          <input
            type="text"
            value={client.name}
            onChange={(e) => setField('name', e.target.value)}
            className="document-title-input"
            style={{ fontSize: '1.7rem' }}
          />
          <div className="muted">
            {orders.length} הזמנות · {money(total)} · רווח {money(profit)}
            {client.created_at && ` · במערכת מ-${dateText(client.created_at)}`}
          </div>
        </div>
        <div className="btn-row">
          {wa && <a className="btn btn-secondary btn-sm" href={wa} target="_blank" rel="noreferrer">💬 וואטסאפ</a>}
          {client.instagram && (
            <a className="btn btn-ghost btn-sm" href={`https://instagram.com/${client.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">אינסטגרם</a>
          )}
          <button className="btn btn-primary btn-sm" onClick={addOrder}>+ הזמנה חדשה</button>
        </div>
      </div>

      {client.needs_review && (
        <div className="review-box" style={{ marginBottom: 16 }}>
          <span>לבדוק: {client.review_note || 'סומנה בייבוא'}. אם זו לקוחה שכבר קיימת, אפשר לאחד למטה.</span>
          <button className="btn btn-ghost btn-sm" onClick={clearClientReview}>בדקתי, תקין</button>
        </div>
      )}

      <div className="file-layout">
        <div>
          {orders.length === 0 && <div className="card muted">אין עדיין הזמנות.</div>}
          {orders.map((o) => (
            <OrderCard
              key={`${o.id}-${version}`}
              order={o}
              stages={stages}
              defaultOpen={o.stage !== 'closed' || orders.length === 1}
              onChanged={(reload) => (reload ? load() : supabase.from('events').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100).then(({ data }) => setEvents(data || [])))}
            />
          ))}
        </div>

        <div>
          <div className="card">
            <h3>פרטי קשר <SaveState state={clientSaveState} /></h3>
            <div className="fields" style={{ gridTemplateColumns: '1fr' }}>
              <label>טלפון<input type="tel" value={client.phone} onChange={(e) => setField('phone', e.target.value)} /></label>
              <label>מייל<input type="email" value={client.email} onChange={(e) => setField('email', e.target.value)} /></label>
              <label>אינסטגרם<input type="text" value={client.instagram} onChange={(e) => setField('instagram', e.target.value)} /></label>
              <label>כתובת<input type="text" value={client.address} onChange={(e) => setField('address', e.target.value)} /></label>
              <label>איך הגיעה<input type="text" value={client.source === 'sheet' ? '' : client.source} placeholder={client.source === 'sheet' ? 'יובאה מהשיטס' : ''} onChange={(e) => setField('source', e.target.value)} /></label>
              <label>הערות על הלקוחה<textarea rows={3} value={client.notes} onChange={(e) => setField('notes', e.target.value)} /></label>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3>ציר זמן</h3>
            <div className="btn-row" style={{ marginBottom: 14 }}>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="הוספת הערה..." style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" onClick={addNote}>הוספה</button>
            </div>
            <div className="timeline">
              {events.map((e) => (
                <div key={e.id}>
                  {EVENT_ICONS[e.type] || '•'} {e.type === 'stage_change' ? `עברה ל"${e.text}"` : e.text}
                  <small>
                    {new Date(e.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                    {e.actor === 'agent' && ' · העוזר'}
                  </small>
                </div>
              ))}
              {orders.filter((o) => o.ordered_at).map((o) => (
                <div key={o.id}>
                  🛒 הזמנה: {productText(o)}
                  <small>{dateText(o.ordered_at)}</small>
                </div>
              ))}
            </div>
            {openOrders.length === 0 && events.length === 0 && <p className="muted">עוד אין אירועים.</p>}
          </div>

          <details className="card more" style={{ marginTop: 16 }}>
            <summary>כלים: איחוד כפילויות, מחיקה</summary>
            <MergeBox client={client} onMerged={load} />
            <button className="btn btn-danger btn-sm" style={{ marginTop: 12 }} onClick={removeClient}>מחיקת לקוחה</button>
          </details>
        </div>
      </div>
    </CrmLayout>
  )
}
