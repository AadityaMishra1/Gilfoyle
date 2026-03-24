import { useEffect } from 'react'

export interface ShortcutConfig {
  key: string
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  handler: () => void
}

/**
 * Registers a global keydown listener for a keyboard shortcut and
 * automatically removes it when the component unmounts.
 *
 * metaKey maps to Cmd on macOS and Ctrl on Windows/Linux — the handler
 * checks both e.metaKey and e.ctrlKey so cross-platform behaviour is
 * correct without extra configuration.
 */
export function useShortcut(config: ShortcutConfig): void {
  const { key, metaKey = false, shiftKey = false, altKey = false, handler } = config

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const modMatch = metaKey ? e.metaKey || e.ctrlKey : true
      const shiftMatch = shiftKey ? e.shiftKey : !e.shiftKey
      const altMatch = altKey ? e.altKey : !e.altKey
      const keyMatch = e.key === key

      if (modMatch && shiftMatch && altMatch && keyMatch) {
        e.preventDefault()
        handler()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, metaKey, shiftKey, altKey, handler])
}
