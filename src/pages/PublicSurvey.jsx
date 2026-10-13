import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

const SAVE_DELAY = 900

export default function PublicSurvey() {
  const { token } = useParams()
  const [survey, setSurvey] = useState(null)
  const [answers, setAnswers] = useState({})
  const [status, setStatus] = useState('loading') // loading | ready | not-found
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error

  const [showBadge, setShowBadge] = useState(false)

  const saveTimer = useRef(null)
  const hideTimer = useRef(null)
  const latestAnswers = useRef({})

  // Clients see the questionnaire name in their tab, not the admin CRM name.
  useEffect(() => {
    document.title = 'שאלון אפיון | Nina Studio'
  }, [])

  useEffect(() => {
    async function load() {
      const { data: surveyRows, error: surveyError } = await supabase.rpc('get_survey_by_token', {
        p_token: token,
      })

      if (surveyError || !surveyRows || surveyRows.length === 0) {
        setStatus('not-found')
        return
      }

      const surveyData = surveyRows[0]
      setSurvey(surveyData)

      const { data: responseRows } = await supabase.rpc('get_response_by_token', { p_token: token })
      if (responseRows && responseRows.length > 0) {
        setAnswers(responseRows[0].answers || {})
        latestAnswers.current = responseRows[0].answers || {}
      }

      setStatus('ready')
    }
    load()
  }, [token])

  const persist = useCallback(
    (nextAnswers) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setSaveState('saving')
      setShowBadge(true)
      saveTimer.current = setTimeout(async () => {
        const { error } = await supabase.rpc('upsert_response_by_token', {
          p_token: token,
          p_answers: nextAnswers,
        })
        setSaveState(error ? 'error' : 'saved')
        if (!error) {
          hideTimer.current = setTimeout(() => setShowBadge(false), 2200)
        }
      }, SAVE_DELAY)
    },
    [token]
  )

  function handleChange(questionId, value) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value }
      latestAnswers.current = next
      persist(next)
      return next
    })
  }

  if (status === 'loading') {
    return <div className="container">טוען...</div>
  }

  if (status === 'not-found') {
    return (
      <div className="container" style={{ textAlign: 'center', paddingTop: '4em' }}>
        <img src={logo} alt="Nina Studio" className="logo-notfound" style={{ marginBottom: '1.5em' }} />
        <h1>השאלון לא נמצא</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          יכול להיות שהקישור שגוי או שהשאלון הוסר. אפשר לפנות לנינה סטודיו לקבלת קישור מעודכן.
        </p>
      </div>
    )
  }

  return (
    <div className="hero-page">
      <div className="hero-bg-layer" />

      <div className="container" style={{ maxWidth: 640 }}>
        <header style={{ textAlign: 'center', padding: '0 0 0.75em' }}>
          <img src={logo} alt="Nina Studio" className="logo-header" />
        </header>

        <div className="hero-panel">
          <h1 className="hero-title" style={{ textAlign: 'center', marginBottom: '0.9em' }}>
            {survey.title}
          </h1>

          {survey.intro && (
            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-navy)', marginBottom: '1em' }}>{survey.intro}</p>
          )}

          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1em' }}>
            אפשר למלא בכמה פעמים שרוצים — התשובות נשמרות אוטומטית, ואפשר לחזור לאותו קישור ולערוך בכל זמן.
          </p>
        </div>

        <div style={{ height: '1.3em' }} />

        <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '1.3em' }}>
          {survey.questions.map((q) =>
            q.type === 'section' ? (
              <h3
                key={q.id}
                className="hero-chip"
                style={{ marginTop: '0.6em', marginBottom: '-0.4em', display: 'inline-block' }}
              >
                {q.label}
              </h3>
            ) : (
              <div key={q.id} className="field card" style={{ marginBottom: 0 }}>
                <label htmlFor={q.id}>
                  {q.label}
                  {q.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
                </label>
                {q.type === 'textarea' ? (
                  <textarea
                    id={q.id}
                    value={answers[q.id] || ''}
                    required={q.required}
                    onChange={(e) => handleChange(q.id, e.target.value)}
                  />
                ) : (
                  <input
                    id={q.id}
                    type="text"
                    value={answers[q.id] || ''}
                    required={q.required}
                    onChange={(e) => handleChange(q.id, e.target.value)}
                  />
                )}
              </div>
            )
          )}
        </form>

        <div style={{ height: '3em' }} />
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: '1.2em',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          opacity: showBadge ? 1 : 0,
          transform: showBadge ? 'translateY(0)' : 'translateY(0.5em)',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
        }}
      >
        <div
          className="card"
          style={{
            padding: '0.6em 1.4em',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5em',
            color: 'var(--color-text-muted)',
          }}
        >
          {saveState === 'saving' && 'שומר...'}
          {saveState === 'saved' && '✓ נשמר'}
          {saveState === 'error' && <span style={{ color: 'var(--color-danger)' }}>שגיאה בשמירה, נסי שוב</span>}
        </div>
      </div>
    </div>
  )
}
