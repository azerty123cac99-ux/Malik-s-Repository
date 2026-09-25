import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from './format'

type Status = { tone: 'success' | 'error'; text: string } | null
type Result = { error: { message: string } | null } | void

/**
 * Runs a write (save, vote, approve, ...) the same way everywhere:
 *   - only one action at a time on a screen: `busy` names the running one,
 *     so buttons can show "Saving…" and every action button can be disabled
 *     (no double taps)
 *   - after it succeeds, `refresh` reloads the screen's data
 *   - a success or error message is shown in <ActionStatus />
 *
 *   const action = useAction(load)
 *   action.run('approve', () => supabase.from(...).update(...), 'Pitch approved')
 */
export function useAction(refresh?: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const running = useRef(false) // synchronous guard: state updates are too slow for a fast double tap
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const run = useCallback(
    async (key: string, write: () => PromiseLike<Result> | Result, success: string) => {
      if (running.current) return false
      running.current = true
      setBusy(key)
      setStatus(null)
      clearTimeout(timer.current)
      let ok = false
      try {
        const res = await write()
        if (res && res.error) throw new Error(friendlyError(res.error.message))
        ok = true
        if (refresh) await refresh()
        setStatus({ tone: 'success', text: success })
        timer.current = setTimeout(() => setStatus(null), 4000)
      } catch (e) {
        setStatus({ tone: 'error', text: e instanceof Error ? e.message : String(e) })
      } finally {
        running.current = false
        setBusy(null)
      }
      return ok
    },
    [refresh],
  )

  // For flows that save on their own (e.g. a dialog) and just need to report.
  const notify = useCallback((tone: 'success' | 'error', text: string) => {
    clearTimeout(timer.current)
    setStatus({ tone, text })
    if (tone === 'success') timer.current = setTimeout(() => setStatus(null), 4000)
  }, [])

  return { run, busy, status, notify, clearStatus: () => setStatus(null) }
}

/** The message area for useAction. Screen readers announce changes. */
export function ActionStatus({ status }: { status: Status }) {
  return (
    <div aria-live="polite" role="status" className="empty:hidden">
      {status && (
        <div
          data-testid={`action-${status.tone}`}
          className={`rounded-lg px-3 py-2.5 text-sm ring-1 ${
            status.tone === 'success'
              ? 'bg-emerald-50 text-emerald-900 ring-emerald-200'
              : 'bg-red-50 text-red-800 ring-red-200'
          }`}
        >
          {status.tone === 'success' ? '✓ ' : ''}
          {status.text}
        </div>
      )}
    </div>
  )
}

/**
 * For updates and deletes: RLS silently skips rows you may not change, so
 * "no error" can still mean "nothing saved". Use with `.select('…')` so the
 * changed rows come back, and treat zero rows as an error.
 */
export async function changed(
  query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ error: { message: string } | null }> {
  const { data, error } = await query
  if (error) return { error }
  if (!data || data.length === 0) {
    return { error: { message: "Nothing was saved. You may not have permission, or it changed meanwhile. Refresh and try again." } }
  }
  return { error: null }
}

/**
 * Success message carried across a navigation, e.g. the Log trade form goes
 * to /trades?saved=Trade%20saved and the trade log shows "✓ Trade saved".
 * The parameter is removed from the address so a refresh doesn't repeat it.
 */
export function useFlash(): Status {
  const [text, setText] = useState(() => new URLSearchParams(window.location.search).get('saved'))
  useEffect(() => {
    if (!text) return
    const url = new URL(window.location.href)
    url.searchParams.delete('saved')
    window.history.replaceState(null, '', url.pathname + url.search)
    const t = setTimeout(() => setText(null), 4000)
    return () => clearTimeout(t)
  }, [text])
  return text ? { tone: 'success', text } : null
}

export const withFlash = (path: string, message: string) => `${path}?saved=${encodeURIComponent(message)}`
