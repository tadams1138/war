import { useEffect, useRef, type RefObject } from 'react'

// A ref that always holds the value of the latest render, for effects that
// must read the current callback without re-running when its identity changes.
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}
