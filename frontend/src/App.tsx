import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('...')
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('unreachable'))
  }, [])
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">newapp</h1>
      <p className="text-sm text-gray-500">backend: {status}</p>
    </main>
  )
}
