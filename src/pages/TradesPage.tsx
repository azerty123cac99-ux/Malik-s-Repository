import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../components/Modal'
import PositionsCard, { type PositionRow, type TotalsRow } from '../components/PositionsCard'
import { Alert, Button, TextArea } from '../components/ui'
import { formatDateTime, friendlyError } from '../lib/format'
import { money, pct, positionPercentAfterEachTrade, type Trade } from '../lib/portfolio'
import { ActionStatus, useFlash } from '../lib/useAction'
import { useLatest } from '../lib/useLatest'
import { Link } from '../lib/router'
import { supabase } from '../lib/supabase'
import { useTeamContent } from '../lib/useTeamContent'

type Names = Map<string, string>
const who = (names: Names, id: string | null) => (id && names.get(id)) || 'Removed user'

export default function TradesPage() {
  const { me, team, teamId, picker, canWrite, isLeader } = useTeamContent()
  const [trades, setTrades] = useState<Trade[]>([])
  const [names, setNames] = useState<Names>(new Map())
  const [pitchTickers, setPitchTickers] = useState<Map<string, string>>(new Map())
  const [voiding, setVoiding] = useState<Trade | null>(null)
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [totals, setTotals] = useState<TotalsRow | null>(null)
  const arrived = useFlash() // "Trade saved" after logging a trade
  const [voided, setVoided] = useState(false)
  const begin = useLatest()

  useEffect(() => {
    if (!voided) return
    const t = setTimeout(() => setVoided(false), 4000)
    return () => clearTimeout(t)
  }, [voided])

  const load = useCallback(async () => {
    if (!teamId) return
    const isLatest = begin()
    const [t, p, pi, pos, tot] = await Promise.all([
      supabase
        .from('trades')
        .select('*')
        .eq('team_id', teamId)
        .order('trade_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('pitches').select('id, ticker').eq('team_id', teamId),
      supabase.from('positions').select('*').eq('team_id', teamId).order('ticker'),
      supabase.from('portfolio_totals').select('*').eq('team_id', teamId).maybeSingle(),
    ])
    if (!isLatest()) return // a newer load started (e.g. after a void); keep its result
    setTrades(t.data ?? [])
    setNames(new Map((p.data ?? []).map((x) => [x.id, x.full_name])))
    setPitchTickers(new Map((pi.data ?? []).map((x) => [x.id, x.ticker])))
    setPositions(pos.data ?? [])
    setTotals(tot.data)
  }, [teamId, begin])

  useEffect(() => {
    load()
  }, [load])

  const percents = useMemo(
    () => positionPercentAfterEachTrade(trades, Number(team?.starting_capital ?? 0)),
    [trades, team],
  )

  // Group by trade date, newest first (the list is already sorted that way).
  const byDate = useMemo(() => {
    const groups = new Map<string, Trade[]>()
    for (const t of trades) groups.set(t.trade_date, [...(groups.get(t.trade_date) ?? []), t])
    return [...groups]
  }, [trades])

  const canVoid = (t: Trade) => !t.voided_at && canWrite && (t.placed_by === me?.id || isLeader)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Trade log</h1>
        {picker}
        {canWrite && (
          <Link to="/trades/new" className="rounded-lg bg-slate-900 text-white px-4 py-2.5 text-sm font-semibold">
            Log trade
          </Link>
        )}
      </div>

      <ActionStatus status={voided ? { tone: 'success', text: 'Trade voided' } : arrived} />

      {trades.length > 0 && <PositionsCard positions={positions} totals={totals} />}

      {trades.length === 0 && (
        <p className="bg-white rounded-2xl ring-1 ring-slate-200 p-4 text-sm text-slate-500">
          No trades yet. Every trade placed in WInS should be logged here with its rationale.
        </p>
      )}

      {byDate.map(([date, list]) => (
        <section key={date}>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">
            {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </h2>
          <ul className="space-y-3">
            {list.map((t) => (
              <TradeCard
                key={t.id}
                trade={t}
                percent={percents.get(t.id)}
                placedBy={who(names, t.placed_by)}
                voidedBy={who(names, t.voided_by)}
                pitchTicker={t.pitch_id ? pitchTickers.get(t.pitch_id) : undefined}
                onVoid={canVoid(t) ? () => setVoiding(t) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}

      {voiding && (
        <VoidDialog
          trade={voiding}
          onClose={() => setVoiding(null)}
          onVoided={async () => {
            await load()
            setVoiding(null)
            setVoided(true)
          }}
        />
      )}
    </div>
  )
}

function TradeCard({
  trade: t,
  percent,
  placedBy,
  voidedBy,
  pitchTicker,
  onVoid,
}: {
  trade: Trade
  percent: number | null | undefined
  placedBy: string
  voidedBy: string
  pitchTicker?: string
  onVoid?: () => void
}) {
  const voided = !!t.voided_at
  const qty = Number(t.quantity)
  const price = Number(t.price)
  return (
    <li
      className={`bg-white rounded-2xl ring-1 ring-slate-200 p-4 space-y-2 ${voided ? 'opacity-70' : ''}`}
      data-testid="trade"
    >
      <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${voided ? 'line-through decoration-2' : ''}`}>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
            t.side === 'buy' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {t.side.toUpperCase()}
        </span>
        <span className="font-bold text-lg">{t.ticker}</span>
        <span className="text-slate-600">
          {qty.toLocaleString()} × {money(price)} = <strong>{money(qty * price)}</strong>
        </span>
      </div>

      <div className="text-sm text-slate-500">
        {!voided && <>≈ {pct(percent)} of portfolio after · </>}
        by {placedBy}
        {pitchTicker && <> · pitch: {pitchTicker}</>}
        {!t.pitch_id && <> · no pitch</>}
      </div>

      <p className={`text-sm whitespace-pre-wrap ${voided ? 'line-through text-slate-500' : 'text-slate-800'}`}>
        {t.rationale}
      </p>

      {voided && (
        <div className="rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 text-sm text-red-900">
          <strong>Voided</strong> by {voidedBy}, {formatDateTime(t.voided_at!)}: {t.void_reason}
        </div>
      )}

      {onVoid && (
        <button onClick={onVoid} className="text-sm font-medium text-red-700 hover:underline">
          Void this trade
        </button>
      )}
    </li>
  )
}

function VoidDialog({ trade, onClose, onVoided }: { trade: Trade; onClose: () => void; onVoided: () => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false) // synchronous guard against a fast double tap

  async function submit() {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError(null)
    const { error } = await supabase.rpc('void_trade', { p_trade: trade.id, p_reason: reason })
    if (error) {
      submitting.current = false
      setLoading(false)
      return setError(friendlyError(error.message))
    }
    // Stay disabled until the list has refreshed and the dialog closes.
    await onVoided()
  }

  return (
    <Modal title={`Void ${trade.side} ${trade.ticker}?`} onClose={onClose}>
      <p className="text-sm text-slate-700">
        Voiding keeps this trade visible, struck through, and removes it from positions and the report. It can't be
        undone. If it was entered wrong, void it and log it again correctly.
      </p>
      <TextArea
        label="Reason (required)"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Entered 100 shares instead of 10"
      />
      {error && <Alert>{error}</Alert>}
      <Button variant="danger" disabled={!reason.trim()} loading={loading} onClick={submit}>
        Void trade
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </Modal>
  )
}
