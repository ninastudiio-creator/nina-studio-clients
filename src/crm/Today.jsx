import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import { ORDER_FIELDS, daysSince, daysText, isLate, productText, stageOf, useStages } from './lib'

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  return 'ערב טוב'
}

function OrderRow({ order, stages, showStage = true }) {
  const late = isLate(stages, order)
  return (
    <Link to={`/crm/clients/${order.client_id}`} className="list-row">
      <div>
        <div className="name">{order.clients?.name}</div>
        <div className="muted">
          {showStage && `${stageOf(stages, order.stage)?.label} · `}
          {productText(order)}
        </div>
      </div>
      <div className={`days ${late ? 'late' : ''}`}>{daysText(daysSince(order.stage_since))}</div>
    </Link>
  )
}

export default function Today() {
  const stages = useStages()
  const [orders, setOrders] = useState(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [leads, setLeads] = useState([])

  useEffect(() => {
    supabase
      .from('orders')
      .select(`${ORDER_FIELDS}, clients(name)`)
      .neq('stage', 'closed')
      .then(({ data }) => setOrders(data || []))
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('needs_review', true)
      .then(({ count }) => setReviewCount(count || 0))
    supabase
      .from('leads')
      .select('id, name, phone, stage, stage_since, last_contact_at')
      .in('stage', ['new', 'talking', 'offer_sent'])
      .then(({ data }) => setLeads(data || []))
  }, [])

  const now = new Date()
  const loading = !orders || !stages
  const owner = (o) => stageOf(stages, o.stage)?.owner
  const byAge = (a, b) => daysSince(b.stage_since) - daysSince(a.stage_since)

  const mine = loading ? [] : orders.filter((o) => owner(o) === 'me' && o.flag !== 'hold').sort(byAge)
  const waitingPrint = mine.filter((o) => o.stage === 'awaiting_print')
  const mineOther = mine.filter((o) => o.stage !== 'awaiting_print')
  const atClient = loading ? [] : orders.filter((o) => owner(o) === 'client')
  const stuckAtClient = atClient.filter((o) => isLate(stages, o)).sort(byAge)
  const printing = loading ? [] : orders.filter((o) => o.stage === 'printing' || o.stage === 'shipping')
  const stuckPrinting = printing.filter((o) => isLate(stages, o)).sort(byAge)
  const LEAD_LATE = { new: 1, talking: 5, offer_sent: 4 }
  const followUps = leads.filter((l) => daysSince(l.last_contact_at || l.stage_since) > LEAD_LATE[l.stage])
  const recent = loading ? [] : orders.filter((o) => daysSince(o.created_at) <= 2 && !o.legacy_ref)

  return (
    <CrmLayout>
      <h1>{greeting()} הגר</h1>
      <p className="sub">
        יום {HEBREW_DAYS[now.getDay()]}, {now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
      </p>

      {loading ? (
        <p>טוען...</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><b>{mine.length}</b><span>מחכות לך</span></div>
            <div className="kpi"><b>{atClient.length}</b><span>אצל לקוחות</span></div>
            <div className="kpi"><b>{printing.length}</b><span>בדפוס ובמשלוח</span></div>
            <div className="kpi"><b>{orders.length}</b><span>הזמנות פתוחות</span></div>
          </div>

          <div className="crm-grid">
            {waitingPrint.length > 0 && (
              <div className="card accent-me">
                <h3>🖨️ מאושרות, מחכות שתשלחי לדפוס ({waitingPrint.length})</h3>
                {waitingPrint.map((o) => <OrderRow key={o.id} order={o} stages={stages} showStage={false} />)}
              </div>
            )}

            <div className="card accent-me">
              <h3>🔵 מחכה לך ({mineOther.length})</h3>
              {mineOther.length === 0 && <p className="muted">אין כלום. כל הכבוד 🎉</p>}
              {mineOther.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
            </div>

            <div className="card accent-client">
              <h3>🟡 נתקעו אצל הלקוחה ({stuckAtClient.length})</h3>
              {stuckAtClient.length === 0 && <p className="muted">אף אחת לא נתקעה.</p>}
              {stuckAtClient.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
            </div>

            {followUps.length > 0 && (
              <div className="card accent-client">
                <h3>💬 לידים שמחכים לפולואפ ({followUps.length})</h3>
                {followUps.map((l) => (
                  <Link key={l.id} to="/crm/leads" className="list-row">
                    <div className="name">{l.name || l.phone}</div>
                    <div className="days late">{daysText(daysSince(l.last_contact_at || l.stage_since))}</div>
                  </Link>
                ))}
              </div>
            )}

            {(stuckPrinting.length > 0 || reviewCount > 0) && (
              <div className="card accent-alert">
                <h3>⚠️ כדאי לבדוק</h3>
                {stuckPrinting.length > 0 && (
                  <Link to="/crm/orders?stage=printing" className="list-row">
                    <div>
                      <div className="name">{stuckPrinting.length} הזמנות בדפוס מעל שבועיים</div>
                      <div className="muted">אם כבר הגיעו, אפשר לסגור אותן ביחד ממסך ההזמנות</div>
                    </div>
                  </Link>
                )}
                {reviewCount > 0 && (
                  <Link to="/crm/review" className="list-row">
                    <div>
                      <div className="name">{reviewCount} הזמנות מהשיטס לבדיקה</div>
                      <div className="muted">בלי סטטוס, כפילויות, החזרים</div>
                    </div>
                  </Link>
                )}
              </div>
            )}

            {recent.length > 0 && (
              <div className="card accent-done">
                <h3>🆕 נכנסו ביומיים האחרונים</h3>
                {recent.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
              </div>
            )}
          </div>
        </>
      )}
    </CrmLayout>
  )
}
