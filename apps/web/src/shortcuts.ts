import { useEffect, useRef } from 'react';

// Single-key shortcuts must never fire while you type, pick from a list, or
// have a dialog open, or hold a modifier (those keys belong to the browser).
function ignored(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))) return true;
  return document.querySelector('dialog[open]') != null;
}

/** Calls `handler` with each key pressed anywhere on the page, unless it should be left alone. */
export function useShortcut(handler: (key: string) => boolean | void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ignored(e) && latest.current(e.key)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
