// PDF blobs + full text live in IndexedDB; localStorage (~5 MB) is far too small for files.
const DB = 'ai-research-os-pdfs', STORE = 'pdfs'
let dbp
const db = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
}))
const tx = async (mode, fn) => {
  const d = await db()
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE))
    t.oncomplete = () => res(req?.result)
    t.onerror = () => rej(t.error)
  })
}

export const putPdf = (id, rec) => tx('readwrite', s => s.put(rec, id)) // rec: { blob, name, text, pages }
export const getPdf = id => tx('readonly', s => s.get(id))
export const deletePdf = id => tx('readwrite', s => s.delete(id))
export const listPdfIds = () => tx('readonly', s => s.getAllKeys())
