import { useEffect, useState } from 'react'
import type { Database } from '../lib/database.types'
import { money, pct } from '../lib/portfolio'
import { supabase } from '../lib/supabase'

type Position = Database['public']['Views']['positions']['Row']
type Totals = Database['public']['Views']['portfolio_totals']['Row']

// Current holdings plus cash, all from the database views, so what students
// see here is exactly what the % figures are based on.
//   total value = cash + every position at its last traded price
//   cash        = starting capital − buys + sells (voided trades ignored)
export default function PositionsCard({ teamId, reloadKey }: { teamId: string; reloadKey: number }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('positions').select('*').eq('team_id', teamId).order('ticker'),
      supabase.from('portfolio_totals').select('*').eq('team_id', teamId).maybeSingle(),
    ]).then(([p, t]) => {
      setPositions((p.data ?? []).filter((x) => Number(x.quantity) !== 0))
      setTotals(t.data)
    })
  }, [teamId, reloadKey])

  if (!totals) return null
  const total = Number(totals.total_value)
  const share = (v: number) => (total > 0 ? (v / total) * 100 : null)

  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden" aria-labelledby="positions-title">
      <h2 id="positions-title" className="px-4 pt-4 font-semibold">
        Positions
      </h2>
      <table className="w-full text-sm mt-2">
        <thead className="text-slate-500 text-xs uppercase">
          <tr>
            <th className="text-left font-medium px-4 py-2">Ticker</th>
            <th className="text-right font-medium px-2 py-2">Qty</th>
            <th className="text-right font-medium px-2 py-2 hidden sm:table-cell">Last price</th>
            <th className="text-right font-medium px-2 py-2">Value</th>
            <th className="text-right font-medium px-4 py-2">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {positions.map((p) => (
            <tr key={p.ticker}>
              <td className="px-4 py-2 font-semibold">{p.ticker}</td>
              <td className="px-2 py-2 text-right tabular-nums">{Number(p.quantity).toLocaleString()}</td>
              <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{money(Number(p.last_price))}</td>
              <td className="px-2 py-2 text-right tabular-nums">{money(Number(p.market_value))}</td>
              <td className="px-4 py-2 text-right tabular-nums">{pct(share(Number(p.market_value)))}</td>
            </tr>
          ))}
          <tr data-testid="cash-row">
            <td className="px-4 py-2 font-semibold">Cash</td>
            <td className="px-2 py-2" />
            <td className="px-2 py-2 hidden sm:table-cell" />
            <td className="px-2 py-2 text-right tabular-nums">{money(Number(totals.cash))}</td>
            <td className="px-4 py-2 text-right tabular-nums">{pct(share(Number(totals.cash)))}</td>
          </tr>
          <tr className="bg-slate-50 font-semibold" data-testid="total-row">
            <td className="px-4 py-2">Total</td>
            <td className="px-2 py-2" />
            <td className="px-2 py-2 hidden sm:table-cell" />
            <td className="px-2 py-2 text-right tabular-nums">{money(total)}</td>
            <td className="px-4 py-2 text-right tabular-nums">100%</td>
          </tr>
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-slate-500">
        Cash = starting capital {money(Number(totals.starting_capital))} − buys {money(Number(totals.total_bought))} + sells{' '}
        {money(Number(totals.total_sold))}. Values use each ticker's last traded price, not live prices. Check Cash
        against WInS; if it doesn't match, a trade is missing or wrong.
      </p>
    </section>
  )
}
