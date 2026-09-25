import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Field, TextArea } from '../components/ui'
import { formatDate, friendlyError } from '../lib/format'
import { holdings, money, pct, positionPercentAfterEachTrade, type Trade } from '../lib/portfolio'
import { Link, navigate } from '../lib/router'
import { supabase } from '../lib/supabase'
import { withFlash } from '../lib/useAction'
import { useTeamContent } from '../lib/useTeamContent'

type ApprovedPitch = { id: string; ticker: string; thesis: string; display_stage: string; decided_at: string | null }

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

export default function TradeFormPage() {
  const { team, teamId, canWrite } = useTeamContent()
  const [trades, setTrades] = useState<Trade[]>([])
  const [pitches, setPitches] = useState<ApprovedPitch[]>([])

  const [date, setDate] = useState(today)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [ticker, setTicker] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  // null = let the form pick automatically; a string = the student's choice
  const [pitchChoice, setPitchChoice] = useState<string | null>(null)
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // One ID per opened form. If this form is submitted twice (double tap,
  // slow network), the database's unique constraint stops a second trade.
  const [requestId] = useState(() => crypto.randomUUID())
  const submitting = useRef(false) // synchronous guard against a fast double tap

  useEffect(() => {
    if (!teamId) return
    let current = true
    Promise.all([
      supabase.from('trades').select('*').eq('team_id', teamId),
      // Only approved pitches can be linked (the database enforces this too).
      supabase
        .from('pitch_board')
        .select('id, ticker, thesis, display_stage, decided_at')
        .eq('team_id', teamId)
        .eq('stage', 'approved')
        .order('ticker'),
    ]).then(([t, p]) => {
      if (!current) return
      setTrades(t.data ?? [])
      setPitches((p.data ?? []) as ApprovedPitch[])
      setLoaded(true)
    })
    return () => {
      current = false
    }
  }, [teamId])

  const cleanTicker = ticker.trim().toUpperCase()
  const qty = Number(quantity)
  const px = Number(price)
  const numbersOk = qty > 0 && px > 0
  const held = holdings(trades).get(cleanTicker) ?? 0
  // Pitches currently holding this ticker. A sell must link to one of them
  // (the database enforces this too); with two or more, the student chooses.
  const boughtFor = (t: string) => pitches.filter((p) => p.ticker === t && p.display_stage === 'bought')
  const sellMustLink = side === 'sell' ? boughtFor(cleanTicker) : []
  const pitchOptions = sellMustLink.length > 0 ? sellMustLink : pitches.filter((p) => !cleanTicker || p.ticker === cleanTicker)

  // The obvious pitch for this side and ticker. It's computed from the
  // current data (not set once on typing), so it still works if the pitch
  // list arrives after the student has typed the ticker.
  function autoPitch() {
    if (side === 'sell') return sellMustLink.length === 1 ? sellMustLink[0].id : ''
    const approved = pitches.filter((p) => p.ticker === cleanTicker)
    return approved.length === 1 ? approved[0].id : ''
  }
  const pitchId = pitchChoice ?? autoPitch()

  function changeTicker(value: string) {
    setTicker(value)
    setPitchChoice(null)
  }

  function changeSide(value: 'buy' | 'sell') {
    setSide(value)
    setPitchChoice(null)
  }

  function changePitch(id: string) {
    setPitchChoice(id)
    const p = pitches.find((x) => x.id === id)
    if (p) setTicker(p.ticker)
  }

  // Live preview of the position's share of the portfolio after this trade.
  const preview =
    numbersOk && cleanTicker
      ? positionPercentAfterEachTrade(
          [
            ...trades,
            {
              id: 'draft',
              ticker: cleanTicker,
              side,
              quantity: qty,
              price: px,
              trade_date: date,
              created_at: new Date().toISOString(),
              voided_at: null,
            },
          ],
          Number(team?.starting_capital ?? 0),
        ).get('draft')
      : null

  const pitchOk = sellMustLink.length === 0 || sellMustLink.some((p) => p.id === pitchId)
  // Wait for the pitch list: saving earlier could silently drop the pitch link.
  const canSave = loaded && canWrite && cleanTicker && numbersOk && pitchOk && rationale.trim().length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave || !teamId || submitting.current) return
    submitting.current = true
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('trades').insert({
      team_id: teamId,
      trade_date: date,
      ticker: cleanTicker,
      side,
      quantity: qty,
      price: px,
      pitch_id: pitchId || null,
      rationale: rationale.trim(),
      client_request_id: requestId,
    })
    // A duplicate request ID means this exact form was already saved.
    const alreadySaved = error?.code === '23505' && /client_request_id/.test(error.message)
    if (error && !alreadySaved) {
      submitting.current = false
      setSaving(false)
      return setError(friendlyError(error.message))
    }
    navigate(withFlash('/trades', 'Trade saved'))
  }

  if (!canWrite) return <Alert tone="info">Only members of this team can log trades.</Alert>

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Log a trade</h1>
        <Link to="/trades" className="text-sm text-slate-600 hover:underline">
          Cancel
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Buy or sell">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => changeSide(s)}
            className={`rounded-lg py-3 font-semibold ring-1 ${
              side === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300'
            }`}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Ticker"
          required
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={ticker}
          onChange={(e) => changeTicker(e.target.value)}
        />
        <Field label="Date" type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        <Field
          label="Quantity"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Field
          label="Price per share"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="pitch" className="block text-sm font-medium text-slate-700 mb-1">
          Linked pitch
        </label>
        <select
          id="pitch"
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
          value={pitchId}
          onChange={(e) => changePitch(e.target.value)}
        >
          {sellMustLink.length === 0 && <option value="">No pitch (e.g. rebalance)</option>}
          {sellMustLink.length > 1 && (
            <option value="" disabled>
              Choose which pitch this sell closes
            </option>
          )}
          {pitchOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.ticker}: {p.thesis.slice(0, 50)}
              {p.decided_at ? ` (approved ${formatDate(p.decided_at)})` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">
          {sellMustLink.length > 1
            ? `${cleanTicker} is held under ${sellMustLink.length} pitches. Pick the one this sell closes.`
            : sellMustLink.length === 1
              ? `${cleanTicker} is held under this pitch, so the sell links to it.`
              : 'Only approved pitches can be linked.'}
        </p>
      </div>

      <TextArea
        label="Rationale (required)"
        required
        rows={5}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="Why this trade, now? Which client objective does it serve? What would make us reverse it?"
      />

      {numbersOk && cleanTicker && (
        <div className="rounded-lg bg-slate-100 px-3 py-2.5 text-sm text-slate-700 space-y-1">
          <div>
            Total: <strong>{money(qty * px)}</strong>
          </div>
          <div>
            {cleanTicker} after this trade: ≈ <strong>{pct(preview)}</strong> of the portfolio (at last traded prices)
          </div>
          {side === 'sell' && qty > held && (
            <div className="text-amber-800">
              Heads up: the log shows {held.toLocaleString()} {cleanTicker} held. Is an earlier buy missing?
            </div>
          )}
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      <Button type="submit" disabled={!canSave} loading={saving}>
        {!loaded ? 'Loading…' : !pitchOk ? 'Choose a pitch to save' : rationale.trim() ? 'Save trade' : 'Add a rationale to save'}
      </Button>
    </form>
  )
}
