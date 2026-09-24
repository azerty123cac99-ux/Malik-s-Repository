// A tiny router. The app has a handful of screens, so this is enough and
// saves adding a routing library: it reads the URL, and navigate() changes it
// without reloading the page.
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const NAVIGATE_EVENT = 'app:navigate'

export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

function readLocation() {
  return { path: window.location.pathname, params: new URLSearchParams(window.location.search) }
}

export function useLocation() {
  const [location, setLocation] = useState(readLocation)
  useEffect(() => {
    const update = () => setLocation(readLocation())
    window.addEventListener('popstate', update) // browser back/forward
    window.addEventListener(NAVIGATE_EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(NAVIGATE_EVENT, update)
    }
  }, [])
  return location
}

export function Link({ to, onClick, ...props }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    // Let ctrl/cmd-click open a new tab as usual.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handleClick} {...props} />
}
