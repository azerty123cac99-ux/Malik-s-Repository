// Portfolio math done in the browser from the trade log.
// Prices come from the trades themselves (no live data), so every figure is
// "at the last traded price" and can be stale.
import type { Database } from './database.types'

export type Trade = Database['public']['Tables']['trades']['Row']
type TradeLike = Pick<Trade, 'id' | 'ticker' | 'side' | 'quantity' | 'price' | 'trade_date' | 'created_at' | 'voided_at'>

// Oldest first: by trade date, then by when it was logged.
function chronological(a: TradeLike, b: TradeLike) {
  return a.trade_date.localeCompare(b.trade_date) || a.created_at.localeCompare(b.created_at)
}

/**
 * Replays all non-voided trades in order and returns, for each trade id, the
 * position's share of the whole portfolio (cash + holdings) right after it.
 * Voided trades are skipped and get no value.
 */
export function positionPercentAfterEachTrade(trades: TradeLike[], startingCapital: number) {
  const result = new Map<string, number | null>()
  const holdings = new Map<string, number>()
  const lastPrice = new Map<string, number>()
  let cash = startingCapital

  for (const t of trades.filter((t) => !t.voided_at).sort(chronological)) {
    const qty = Number(t.quantity)
    const price = Number(t.price)
    const signed = t.side === 'buy' ? qty : -qty
    holdings.set(t.ticker, (holdings.get(t.ticker) ?? 0) + signed)
    lastPrice.set(t.ticker, price)
    cash -= signed * price

    let total = cash
    for (const [ticker, q] of holdings) total += q * (lastPrice.get(ticker) ?? 0)
    const value = (holdings.get(t.ticker) ?? 0) * price
    result.set(t.id, total > 0 ? (value / total) * 100 : null)
  }
  return result
}

/** Current quantity held per ticker, from non-voided trades. */
export function holdings(trades: TradeLike[]) {
  const map = new Map<string, number>()
  for (const t of trades) {
    if (t.voided_at) continue
    map.set(t.ticker, (map.get(t.ticker) ?? 0) + (t.side === 'buy' ? 1 : -1) * Number(t.quantity))
  }
  return map
}

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`)
