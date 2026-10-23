import { useState, type FormEvent } from 'react'
import {
  ArrowRight, CheckCircle2, Home, LoaderCircle, LockKeyhole,
  Mail, Phone, ShieldCheck, UserRound, X,
} from 'lucide-react'
import './AuthModal.css'

type AuthMode = 'login' | 'register'
type AccountRole = 'seeker' | 'agent'

interface AuthModalProps {
  mode: AuthMode
  onClose: () => void
  onModeChange: (mode: AuthMode) => void
  onSuccess: (message: string) => void
  initialRole?: AccountRole
}

const API_BASE = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'
).replace(/\/$/, '')

export default function AuthModal({
  mode,
  onClose,
  onModeChange,
  onSuccess,
  initialRole = 'seeker',
}: AuthModalProps) {
  const [role, setRole] = useState<AccountRole>(initialRole)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const registering = mode === 'register'
      const response = await fetch(
        `${API_BASE}/api/auth/${registering ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            registering
              ? {
                  full_name: fullName.trim(),
                  fullName: fullName.trim(),
                  email: email.trim().toLowerCase(),
                  phone: phone.trim(),
                  phoneNumber: phone.trim(),
                  password,
                  role,
                }
              : {
                  email: email.trim().toLowerCase(),
                  password,
                },
          ),
        },
      )

      const data: any = await response.json().catch(() => ({}))

      if (!response.ok) {
        const validationMessage = Array.isArray(data.issues)
          ? data.issues.map((issue: any) => issue.message).join(' ')
          : ''
        throw new Error(
          data.message || data.error || validationMessage ||
          'The request could not be completed. Please try again.',
        )
      }

      if (registering) {
        onSuccess(
          role === 'agent'
            ? 'Account created. Your agent account must be approved before you can access property requests.'
            : 'Account created successfully. You can now log in.',
        )
        return
      }

      if (data.token) {
        localStorage.setItem('nestora_token', data.token)
      }
      if (data.user) {
        localStorage.setItem('nestora_user', JSON.stringify(data.user))
      }

      onSuccess(
        data.user?.role === 'agent' &&
        data.user?.agent_status !== 'approved'
          ? 'You are signed in. Your agent account is awaiting verification.'
          : 'You have signed in successfully.',
      )
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Cannot reach Nestora. Check that the backend is running.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="auth-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose()
      }}
    >
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          className="auth-close"
          onClick={onClose}
          aria-label="Close authentication"
          disabled={loading}
          type="button"
        >
          <X size={21} />
        </button>

        <div className="auth-brand-mark"><Home size={25} /></div>
        <div className="auth-eyebrow">
          <ShieldCheck size={14} /> YOUR KADUNA PROPERTY CONNECTION
        </div>
        <h2 id="auth-title">
          {mode === 'login' ? 'Welcome back.' : 'Let’s get you started.'}
        </h2>
        <p className="auth-intro">
          {mode === 'login'
            ? 'Sign in to continue your Nestora journey.'
            : 'Create an account to find property or connect with seekers.'}
        </p>

        {mode === 'register' && (
          <div className="auth-role-picker">
            <button
              type="button"
              className={role === 'seeker' ? 'selected' : ''}
              onClick={() => setRole('seeker')}
              disabled={loading}
            >
              <Home size={18} />
              <span><strong>Property seeker</strong><small>I need a property</small></span>
              {role === 'seeker' && <CheckCircle2 size={17} />}
            </button>
            <button
              type="button"
              className={role === 'agent' ? 'selected' : ''}
              onClick={() => setRole('agent')}
              disabled={loading}
            >
              <UserRound size={18} />
              <span><strong>Property agent</strong><small>I help people find property</small></span>
              {role === 'agent' && <CheckCircle2 size={17} />}
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <label className="auth-label">
                Full name
                <span className="auth-input-wrap">
                  <UserRound size={18} />
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                    maxLength={120}
                  />
                </span>
              </label>
              <label className="auth-label">
                Phone number
                <span className="auth-input-wrap">
                  <Phone size={18} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Your phone number"
                    autoComplete="tel"
                    required
                    maxLength={25}
                  />
                </span>
              </label>
            </>
          )}

          <label className="auth-label">
            Email address
            <span className="auth-input-wrap">
              <Mail size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </span>
          </label>

          <label className="auth-label">
            Password
            <span className="auth-input-wrap">
              <LockKeyhole size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Create a password' : 'Enter your password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
            </span>
          </label>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? <><LoaderCircle className="auth-spinner" size={18} /> Please wait…</>
              : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></>}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>New to Nestora? <button type="button" onClick={() => { setError(''); onModeChange('register') }}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" onClick={() => { setError(''); onModeChange('login') }}>Sign in</button></>
          )}
        </div>

        <div className="auth-privacy">
          <ShieldCheck size={16} />
          Your details are protected. You control when your contact information is shared.
        </div>
      </section>
    </div>
  )
}
