import { stageInfo } from '../lib/labels'

export default function StageBadge({ stage }: { stage: string }) {
  const s = stageInfo(stage)
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.style}`}>{s.label}</span>
}
