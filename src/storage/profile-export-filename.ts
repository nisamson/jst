export function profileExportFilename(label: string): string {
  const sanitized = label.replace(/[<>:"/\\|?*]|\p{Cc}/gu, '_').trim().replace(/^\.+|[. ]+$/g, '')
  const shortened = Array.from(sanitized).slice(0, 60).join('').replace(/[. ]+$/g, '')
  const name = shortened || 'job-search-profile'
  const safeName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name
  return `${safeName}.sqlite3`
}
