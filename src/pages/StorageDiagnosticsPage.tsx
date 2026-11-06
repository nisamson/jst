import StorageStatus from '../components/StorageStatus'
import StorageProbe from '../components/StorageProbe'
import './StorageDiagnosticsPage.css'

export default function StorageDiagnosticsPage() {
  return (
    <main className="storage-diagnostics">
      <a href="/">Back to app</a>
      <h1>Storage diagnostics</h1>
      <p>
        Test real SQLite/OPFS storage in this browser. Checks use only
        {' '}<code>/jst-storage-diagnostics.sqlite3</code>, never profile databases.
        No personal information is requested or stored by these checks.
      </p>
      <p>
        This database holds one replaceable synthetic record. The URL carries
        its expected token, not a copy of the record. A different browser,
        device, or origin has separate storage. Passing here does not guarantee backup.
      </p>
      <StorageStatus>
        <StorageProbe />
      </StorageStatus>
    </main>
  )
}
