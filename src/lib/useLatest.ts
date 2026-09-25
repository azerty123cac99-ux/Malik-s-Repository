import { useCallback, useRef } from 'react'

/**
 * Guards against out-of-order responses. On a slow connection a load that
 * started earlier can finish later and overwrite newer data with stale data.
 *
 *   const begin = useLatest()
 *   async function load() {
 *     const isLatest = begin()
 *     const { data } = await supabase.from(...)
 *     if (!isLatest()) return   // a newer load has started; drop this result
 *     setData(data)
 *   }
 */
export function useLatest() {
  const counter = useRef(0)
  return useCallback(() => {
    const id = ++counter.current
    return () => id === counter.current
  }, [])
}
