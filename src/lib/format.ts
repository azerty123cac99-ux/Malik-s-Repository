export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// For "type the name to confirm": ignore case and extra spaces.
export function sameName(a: string, b: string) {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  return norm(a) !== '' && norm(a) === norm(b)
}

// Database errors we raise start with a code like "SELL_NEEDS_PITCH: ".
// Keep the readable part for students.
export function friendlyError(message: string) {
  return message.replace(/^[A-Z_]+: /, '')
}
