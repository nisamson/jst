import { useCallback, useEffect, useState } from 'react'
import StorageStatus from './components/StorageStatus'
import ProfileLandingPage from './pages/ProfileLandingPage'
import ClaimsPage from './pages/ClaimsPage'

function getCurrentLocation() {
  return `${window.location.pathname}${window.location.search}`
}

function App() {
  const [location, setLocation] = useState(getCurrentLocation)

  useEffect(() => {
    const handlePopState = () => setLocation(getCurrentLocation())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path)
    setLocation(getCurrentLocation())
  }, [])

  const url = new URL(location, window.location.origin)
  const profileIds = url.searchParams.getAll('profile')
  const profileId = profileIds.length === 1 ? profileIds[0] : undefined
  const claimIds = url.searchParams.getAll('claim')
  const claimId = claimIds.length === 1 ? claimIds[0] : undefined

  return (
    <StorageStatus>
      {url.pathname === '/claims'
        ? <ClaimsPage profileId={profileId} claimId={claimId} onNavigate={navigate} />
        : <ProfileLandingPage onOpenProfile={(id) => navigate(`/claims?profile=${encodeURIComponent(id)}`)} />}
    </StorageStatus>
  )
}

export default App
