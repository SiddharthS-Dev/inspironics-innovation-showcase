/** Locally-added gallery items, persisted in localStorage. */
const KEY = 'inspironics.customItems.v1'

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const write = (items) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch (err) {
    console.warn('Could not persist custom items', err)
  }
  window.dispatchEvent(new CustomEvent('inspironics:custom-items'))
  return items
}

export const loadCustomItems = read

export function addCustomItem(partial) {
  const f = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const item = {
    f,
    t: partial.imageUrl || '',
    full: partial.imageUrl || '',
    thumbUrl: partial.imageUrl || '',
    fullUrl: partial.imageUrl || '',
    title: partial.title?.trim() || 'Untitled Architecture',
    cat: partial.cat || 'Systems & Architecture',
    tech: partial.tech || [],
    components: partial.components || [],
    flow: partial.flow || [],
    objective: partial.objective || '',
    architecture: partial.architecture || '',
    bizben: [],
    techben: [],
    takeaway: '',
    esg: !!partial.esg,
    ai: !!partial.ai,
    iot: !!partial.iot,
    flagship: false,
    custom: true,
    addedAt: new Date().toISOString(),
  }
  write([item, ...read()])
  return item
}

export function removeCustomItem(f) {
  return write(read().filter((i) => i.f !== f))
}

export function clearCustomItems() {
  return write([])
}
