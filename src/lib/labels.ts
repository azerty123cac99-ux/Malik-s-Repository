import type { Database } from './database.types'

export type AssetClass = Database['public']['Enums']['asset_type']
export type DisplayStage = 'idea' | 'pitched' | 'approved' | 'bought' | 'sold' | 'rejected'

export const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'stock', label: 'Stocks' },
  { value: 'etf', label: 'ETFs' },
  { value: 'bond', label: 'Bonds' },
  { value: 'fund', label: 'Mutual funds' },
  { value: 'other', label: 'Other' },
]

export const ASSET_LABEL: Record<AssetClass, string> = {
  stock: 'Stock',
  etf: 'ETF',
  bond: 'Bond',
  fund: 'Fund',
  other: 'Other',
}

export const STAGES: { value: DisplayStage; label: string; style: string }[] = [
  { value: 'idea', label: 'Idea', style: 'bg-slate-100 text-slate-700' },
  { value: 'pitched', label: 'Pitched', style: 'bg-blue-100 text-blue-800' },
  { value: 'approved', label: 'Approved', style: 'bg-violet-100 text-violet-800' },
  { value: 'bought', label: 'Bought', style: 'bg-emerald-100 text-emerald-800' },
  { value: 'sold', label: 'Sold', style: 'bg-amber-100 text-amber-900' },
  { value: 'rejected', label: 'Rejected', style: 'bg-red-100 text-red-800' },
]

export const stageInfo = (s: string) => STAGES.find((x) => x.value === s) ?? STAGES[0]
