import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './crm.css'

export default function CrmLayout({ children }) {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('needs_review', true),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('needs_review', true),
      supabase.from('orders').select('id', { count: 'exact', head: true }).neq('stage', 'closed'),
    ]).then(([o, c, open]) => setCounts({ review: (o.count || 0) + (c.count || 0), open: open.count || 0 }))
  }, [])

  return (
    <div className="crm">
      <nav className="crm-nav">
        <div className="crm-nav-logo">
          Nina Studio<small>מערכת לקוחות · אלבומים</small>
        </div>
        <NavLink to="/crm" end>היום</NavLink>
        <NavLink to="/crm/orders">
          הזמנות {counts.open > 0 && <span className="count">{counts.open}</span>}
        </NavLink>
        <NavLink to="/crm/clients">לקוחות</NavLink>
        <NavLink to="/crm/review">
          לבדיקה {counts.review > 0 && <span className="count">{counts.review}</span>}
        </NavLink>
        <div className="spacer" />
        <Link to="/websites">לקוחות אתרים ←</Link>
        <button onClick={() => supabase.auth.signOut()}>התנתקות</button>
      </nav>
      <main className="crm-main">{children}</main>
    </div>
  )
}
