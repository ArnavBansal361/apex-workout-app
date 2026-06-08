import { useEffect, useState } from 'react'
import { signInWithGoogle, supabase } from '../lib/supabase'
import { ApexLogo } from './ApexLogo'

type Mode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'

const inp =
  'w-full min-h-12 px-3 py-2.5 rounded-[8px] text-[14px] font-normal bg-[#141414] border-[0.5px] border-white/[0.08] text-white placeholder:text-white/30 focus:outline-none focus:border-white/[0.15]'

export function Auth({
  initialMode = 'sign-in',
  onPasswordReset,
}: {
  initialMode?: Mode
  onPasswordReset?: () => void
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-apex-theme')
    document.documentElement.setAttribute('data-apex-theme', 'dark')
    return () => {
      if (prev) document.documentElement.setAttribute('data-apex-theme', prev)
      else document.documentElement.removeAttribute('data-apex-theme')
    }
  }, [])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const trimmed = email.trim()

    if (mode === 'forgot-password') {
      if (!trimmed) { setMessage('Enter your email address.'); return }
      setBusy(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setMessage('Check your email for a password reset link.')
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (mode === 'reset-password') {
      if (!password) { setMessage('Enter a new password.'); return }
      setBusy(true)
      try {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setMessage('Password updated! Signing you in…')
        onPasswordReset?.()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (!trimmed || !password) {
      setMessage('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({ email: trimmed, password })
        if (error) throw error
        setMessage('Check your email to confirm your account, or sign in if already confirmed.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password })
        if (error) throw error
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setMessage(null)
    setBusy(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Google sign-in failed.')
      setBusy(false)
    }
  }

  const headings: Record<Mode, { title: string; subtitle: string }> = {
    'sign-in': {
      title: 'Sign in',
      subtitle: 'Welcome back. Sign in to sync your training.',
    },
    'sign-up': {
      title: 'Create account',
      subtitle: 'Join Lift to track workouts, PRs, and progress.',
    },
    'forgot-password': {
      title: 'Reset password',
      subtitle: 'Enter your email and we'll send you a reset link.',
    },
    'reset-password': {
      title: 'Set new password',
      subtitle: 'Choose a new password for your account.',
    },
  }

  const { title, subtitle } = headings[mode]

  return (
    <div
      data-apex-theme="dark"
      className="apex-safe-top min-h-[100dvh] bg-[#0a0a0a] text-white px-4 py-6 pb-12 flex flex-col"
    >
      <div className="w-full max-w-[480px] mx-auto flex-1 flex flex-col justify-center">
        <div className="mb-8 flex justify-center">
          <ApexLogo size={48} />
        </div>

        <div className="rounded-[12px] border-[0.5px] border-white/[0.08] bg-[#141414] p-5 space-y-5">
          <div>
            <h1 className="text-[26px] font-medium tracking-tight text-white leading-tight">
              {title}
            </h1>
            <p className="mt-2 text-[14px] font-normal text-white/50 leading-relaxed">
              {subtitle}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleEmailSubmit}>
            {mode !== 'reset-password' && (
              <label className="block space-y-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/30">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  className={inp}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}

            {(mode === 'sign-in' || mode === 'sign-up' || mode === 'reset-password') && (
              <label className="block space-y-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/30">
                  {mode === 'reset-password' ? 'New password' : 'Password'}
                </span>
                <input
                  type="password"
                  autoComplete={mode === 'sign-up' || mode === 'reset-password' ? 'new-password' : 'current-password'}
                  className={inp}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}

            {mode === 'sign-in' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-[12px] text-white/40 hover:text-white/70 underline-offset-2 hover:underline"
                  onClick={() => { setMode('forgot-password'); setMessage(null) }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {message ? (
              <p className="text-[13px] font-normal text-white/70 leading-relaxed" role="alert">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-12 rounded-[8px] apex-btn-primary text-[14px] font-medium disabled:opacity-50"
            >
              {busy
                ? 'Please wait…'
                : mode === 'sign-in'
                ? 'Sign in'
                : mode === 'sign-up'
                ? 'Sign up'
                : mode === 'forgot-password'
                ? 'Send reset link'
                : 'Update password'}
            </button>
          </form>

          {(mode === 'sign-in' || mode === 'sign-up') && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.08]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/30">
                  or
                </span>
                <div className="h-px flex-1 bg-white/[0.08]" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGoogle()}
                className="w-full min-h-12 rounded-[8px] border-[0.5px] border-white/[0.15] bg-transparent text-white text-[14px] font-medium disabled:opacity-50"
              >
                Continue with Google
              </button>
            </>
          )}

          <p className="text-center text-[13px] font-normal text-white/50">
            {mode === 'sign-in' ? (
              <>
                No account?{' '}
                <button
                  type="button"
                  className="text-white font-medium underline-offset-2 hover:underline"
                  onClick={() => { setMode('sign-up'); setMessage(null) }}
                >
                  Sign up
                </button>
              </>
            ) : mode === 'reset-password' ? null : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="text-white font-medium underline-offset-2 hover:underline"
                  onClick={() => { setMode('sign-in'); setMessage(null) }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
