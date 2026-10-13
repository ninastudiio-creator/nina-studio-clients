import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

export default function SetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('לפחות 8 תווים')
    if (password !== again) return setError('הסיסמאות לא זהות')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) return setError('השמירה נכשלה. אולי הלינק מהמייל פג תוקף, נסי לבקש חדש.')
    navigate('/crm', { replace: true })
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: '4em' }}>
      <div style={{ textAlign: 'center', marginBottom: '2em' }}>
        <img src={logo} alt="Nina Studio" className="logo-hero" />
      </div>
      <div className="card">
        <h1 style={{ fontSize: '1.3rem', textAlign: 'center' }}>בחירת סיסמה חדשה</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password">סיסמה חדשה</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field">
            <label htmlFor="again">שוב, לאימות</label>
            <input id="again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
            {saving ? 'שומרת...' : 'שמירה וכניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
