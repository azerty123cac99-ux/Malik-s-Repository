// Small shared building blocks so every screen looks and behaves the same.
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh flex items-start sm:items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 sm:p-6">{children}</div>
}

export function Brand() {
  return (
    <div className="mb-6 text-center">
      <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Investment Club</div>
      <div className="text-2xl font-bold">Trade Journal</div>
    </div>
  )
}

// Inputs use a 16px font (text-base): smaller text makes iPhone and iPad
// Safari zoom in when the field is tapped.
export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base
                   focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900
                   read-only:bg-slate-100 read-only:text-slate-600"
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-slate-500 mt-1">
          {hint}
        </p>
      )}
    </div>
  )
}

export function Button({
  loading,
  variant = 'primary',
  children,
  className = '',
  ...props
}: { loading?: boolean; variant?: 'primary' | 'secondary' | 'danger' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50',
    danger: 'bg-red-700 text-white hover:bg-red-800',
  }[variant]
  return (
    <button
      className={`w-full rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-60 ${styles} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) {
  const styles = tone === 'error' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-slate-100 text-slate-700 ring-slate-200'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2.5 text-sm ring-1 ${styles}`}>
      {children}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="min-h-dvh flex items-center justify-center text-slate-500" role="status">
      Loading…
    </div>
  )
}
