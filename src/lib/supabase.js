import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Clicking the "reset password" email link logs in with a recovery session: send her to the new-password screen.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') window.location.hash = '#/set-password'
})
