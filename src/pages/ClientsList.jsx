import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AdminLayout from '../components/AdminLayout'

function StatusBadge({ survey }) {
  if (!survey) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.25em 0.8em',
          borderRadius: 999,
          fontSize: '0.8rem',
          fontWeight: 700,
          background: 'var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        אין שאלון עדיין
      </span>
    )
  }
  const answered = Boolean(survey.responses)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25em 0.8em',
        borderRadius: 999,
        fontSize: '0.8rem',
        fontWeight: 700,
        background: answered ? 'var(--color-blue-light)' : 'var(--color-border)',
        color: 'var(--color-navy)',
      }}
    >
      {answered ? 'שאלון נענה' : 'שאלון טרם נענה'}
    </span>
  )
}

export default function ClientsList() {
  const navigate = useNavigate()
  const [clients, setClients] = useState(null)
  const [error, setError] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function loadClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, created_at, surveys(id, public_token, responses(updated_at))')
      .contains('lines', ['website'])
      .order('created_at', { ascending: false })

    if (error) {
      setError('שגיאה בטעינת הלקוחות')
      return
    }
    setClients(data)
  }

  useEffect(() => {
    loadClients()
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    const { data, error } = await supabase.from('clients').insert({ name: newName.trim() }).select('id').single()
    setCreating(false)
    if (error) {
      alert('יצירת לקוח נכשלה')
      return
    }
    navigate(`/clients/${data.id}`)
  }

  async function handleDelete(id, name) {
    if (!confirm(`למחוק את "${name}"? הפעולה לא הפיכה, וכל השאלון והתשובות שלו יימחקו.`)) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) {
      alert('מחיקה נכשלה')
      return
    }
    setClients((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5em' }}>
        <h1>הלקוחות שלי</h1>
        <button className="btn btn-primary" onClick={() => setShowNewForm((v) => !v)}>
          + לקוח חדש
        </button>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="card" style={{ display: 'flex', gap: '0.6em', marginBottom: '1.5em' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם הפרויקט, לדוגמה: Saru"
            autoFocus
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
            {creating ? 'יוצרת...' : 'יצירה'}
          </button>
        </form>
      )}

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {clients === null && <p>טוען...</p>}

      {clients?.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          עדיין אין לקוחות. לחצי על "לקוח חדש" כדי להוסיף את הראשון.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
        {clients?.map((client) => {
          const survey = client.surveys
          return (
            <div
              key={client.id}
              className="card"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1em', flexWrap: 'wrap' }}
            >
              <Link to={`/clients/${client.id}`} style={{ flex: 1, minWidth: 200, color: 'inherit' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '0.3em' }}>
                  <strong>{client.name}</strong>
                  <StatusBadge survey={survey} />
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  נוצר ב-{new Date(client.created_at).toLocaleDateString('he-IL')}
                </div>
              </Link>
              <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
                <Link to={`/clients/${client.id}`} className="btn btn-ghost btn-sm">
                  פתיחה
                </Link>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(client.id, client.name)}>
                  מחיקה
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </AdminLayout>
  )
}
