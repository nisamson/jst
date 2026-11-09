export function developerToolsEnabled(
  hostname = globalThis.location?.hostname,
  development = import.meta.env.DEV,
) {
  return development || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}
