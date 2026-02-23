import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchCounter() {
    try {
      const res = await fetch('/api/counter')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCount(data.value)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    }
  }

  async function handleIncrement() {
    setLoading(true)
    try {
      const res = await fetch('/api/counter/increment', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setCount(data.value)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to increment')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCounter()
  }, [])

  return (
    <div className="app">
      <h1>Docker Node App Demo</h1>
      <div className="card">
        <p className="counter-display">
          {count === null ? '...' : count}
        </p>
        <button onClick={handleIncrement} disabled={loading}>
          {loading ? 'Incrementing...' : 'Increment'}
        </button>
        {error && <p className="error">{error}</p>}
        <p className="hint">
          Counter value is stored in PostgreSQL.
        </p>
      </div>
    </div>
  )
}

export default App
