/**
 * Reference-counted body scroll lock.
 *
 * Two overlays can be open at the same time — the gallery's lightbox and the one
 * Home opens for copilot results and `#<id>` share links. Each used to save and
 * restore `document.body.style.overflow` on its own, so whichever unmounted
 * second restored the *locked* value it had captured on the way in, leaving the
 * page unscrollable for good.
 *
 * Counting holders and remembering the page's own value once fixes that whatever
 * order things mount and unmount in.
 */
let holders = 0
let original = ''

/**
 * Lock body scrolling and return an idempotent release function, so it can be
 * handed straight back from a React effect cleanup.
 */
export function lockScroll() {
  if (holders === 0) {
    original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  holders += 1

  let released = false
  return () => {
    if (released) return
    released = true
    holders = Math.max(0, holders - 1)
    if (holders === 0) document.body.style.overflow = original
  }
}
