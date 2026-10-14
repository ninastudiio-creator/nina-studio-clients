import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CrmLayout from './CrmLayout'
import { ORDER_FIELDS, PRODUCTS_SHORT, stageSinceText, daysSince, daysText, isLate, stageOf, useStages } from './lib'

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
          {[PRODUCTS_SHORT[order.product], showStage && stageOf(stages, order.stage)?.label].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className={`days ${late ? 'late' : ''}`}>{stageSinceText(order)}</div>
    </Link>
  )
}

// All cards share one height; long lists scroll inside the card.
function TodayCard({ accent, title, children }) {
  return (
    <div className={`card today-card accent-${accent}`}>
      <h3>{title}</h3>
      <div className="today-card-body">{children}</div>
    </div>
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

  const open = loading ? [] : orders.filter((o) => o.flag !== 'hold')
  const onHold = loading ? [] : orders.filter((o) => o.flag === 'hold').sort(byAge)
  // Waiting on Hagar: approved albums to send to print first, then the oldest.
  const mine = open
    .filter((o) => owner(o) === 'me')
    .sort((a, b) => (b.stage === 'awaiting_print') - (a.stage === 'awaiting_print') || byAge(a, b))
  // Moving along at the client / printer, within the normal time.
  const elsewhere = open.filter((o) => ['client', 'neutral'].includes(owner(o)))
  const inProgress = elsewhere.filter((o) => !isLate(stages, o)).sort(byAge)
  const atClient = inProgress.filter((o) => owner(o) === 'client')
  const atPrinter = inProgress.filter((o) => owner(o) === 'neutral')
  const late = elsewhere.filter((o) => isLate(stages, o)).sort(byAge)
  const LEAD_LATE = { new: 1, talking: 5, offer_sent: 4 }
  const followUps = leads.filter((l) => daysSince(l.last_contact_at || l.stage_since) > LEAD_LATE[l.stage])
  const recent = loading ? [] : orders.filter((o) => daysSince(o.created_at) <= 2 && !o.legacy_ref)
  const toCheck = late.length + onHold.length + followUps.length + (reviewCount > 0 ? 1 : 0)

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
            <div className="kpi"><b>{atClient.length}</b><span>אצל הלקוחה</span></div>
            <div className="kpi"><b>{atPrinter.length}</b><span>בדפוס ובמשלוח</span></div>
            <div className="kpi"><b>{late.length + onHold.length}</b><span>כדאי לבדוק</span></div>
          </div>

          <div className="today-grid today-main">
            <TodayCard accent="me" title={`🔵 משימות אצלי (${mine.length})`}>
              {mine.length === 0 && <p className="muted">אין כלום. כל הכבוד 🎉</p>}
              {mine.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
            </TodayCard>

            <TodayCard accent="client" title={`🟡 משימות אצל הלקוחה (${atClient.length})`}>
              {atClient.length === 0 && <p className="muted">אין כרגע.</p>}
              {atClient.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
            </TodayCard>

            <TodayCard accent="neutral" title={`🖨️ בדפוס ובמשלוח (${atPrinter.length})`}>
              {atPrinter.length === 0 && <p className="muted">אין כרגע.</p>}
              {atPrinter.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
            </TodayCard>
          </div>

          {(toCheck > 0 || recent.length > 0) && <h2 className="today-sub">כדאי להציץ</h2>}
          <div className="today-grid today-secondary">
            {(late.length > 0 || onHold.length > 0 || reviewCount > 0) && (
              <TodayCard accent="alert" title={`⚠️ כדאי לבדוק (${late.length + onHold.length})`}>
                {late.length > 0 && <div className="muted today-group">עברו יותר זמן מהרגיל</div>}
                {late.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
                {onHold.length > 0 && <div className="muted today-group">בהולד</div>}
                {onHold.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
                {reviewCount > 0 && (
                  <Link to="/crm/review" className="list-row">
                    <div>
                      <div className="name">{reviewCount} הזמנות מהשיטס לבדיקה</div>
                      <div className="muted">כפילויות, החזרים, מוצר חסר</div>
                    </div>
                  </Link>
                )}
              </TodayCard>
            )}

            {followUps.length > 0 && (
              <TodayCard accent="client" title={`💬 לידים שמחכים לפולואפ (${followUps.length})`}>
                {followUps.map((l) => (
                  <Link key={l.id} to="/crm/leads" className="list-row">
                    <div className="name">{l.name || l.phone}</div>
                    <div className="days late">{daysText(daysSince(l.last_contact_at || l.stage_since))}</div>
                  </Link>
                ))}
              </TodayCard>
            )}

            {recent.length > 0 && (
              <TodayCard accent="done" title={`🆕 נכנסו ביומיים האחרונים (${recent.length})`}>
                {recent.map((o) => <OrderRow key={o.id} order={o} stages={stages} />)}
              </TodayCard>
            )}
          </div>
        </>
      )}
    </CrmLayout>
  )
}
