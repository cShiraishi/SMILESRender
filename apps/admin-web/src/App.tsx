import { useEffect, useState } from 'react'
import LoginPage from './LoginPage'

const TOKEN_KEY = 'smilerender_admin_token'

interface Stats {
  total: number
  errors: number
  errorRate: number
  avgMs: number
  topEndpoints: { path: string; count: number }[]
}

interface SystemStatus {
  chemistry: 'ok' | 'down'
  database: 'ok' | 'down'
  ts: string
}

function apiFetch(path: string, token: string) {
  return fetch(`/admin/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ── Root: handles auth gate ──────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY),
  )

  const handleLogin = (newToken: string) => {
    sessionStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
  }

  const handleLogout = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  if (!token) return <LoginPage onLogin={handleLogin} />
  return <Dashboard token={token} onLogout={handleLogout} />
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchData = async () => {
    try {
      const [statsRes, systemRes] = await Promise.all([
        apiFetch('/stats', token),
        apiFetch('/system', token),
      ])

      // Token expired or revoked
      if (statsRes.status === 401 || systemRes.status === 401) {
        onLogout()
        return
      }

      setStats(await statsRes.json())
      setSystem(await systemRes.json())
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Failed to fetch admin data', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto p-6">

        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">SmileRender Admin</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1.5 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={onLogout}
              className="text-xs text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-800 rounded px-3 py-1.5 transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-4 mb-8">
          <StatCard label="Total Requests" value={stats?.total.toLocaleString() ?? '—'} />
          <StatCard
            label="Error Rate"
            value={stats ? `${stats.errorRate}%` : '—'}
            accent={stats && stats.errorRate > 5 ? 'red' : 'green'}
          />
          <StatCard
            label="Avg Response"
            value={stats ? `${stats.avgMs} ms` : '—'}
            accent={stats && stats.avgMs > 500 ? 'yellow' : 'blue'}
          />
        </section>

        {/* System status */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            System
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <ServiceBadge name="NestJS Gateway" status="ok" />
            <ServiceBadge name="Chemistry Service" status={system?.chemistry ?? 'down'} />
            <ServiceBadge name="Postgres" status={system?.database ?? 'down'} />
          </div>
        </section>

        {/* Top endpoints */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
            Top Endpoints
          </h2>
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">#</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium">Path</th>
                  <th className="text-right px-4 py-2.5 text-gray-500 font-medium">Requests</th>
                </tr>
              </thead>
              <tbody>
                {stats?.topEndpoints.map((ep, i) => (
                  <tr
                    key={ep.path}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-2.5 text-gray-600 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-300">{ep.path}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">
                      {ep.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!stats?.topEndpoints.length && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-600 text-sm">
                      No requests recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  )
}

// ── Shared components ────────────────────────────────────────────────────────

type Accent = 'green' | 'red' | 'blue' | 'yellow'

function StatCard({
  label,
  value,
  accent = 'blue',
}: {
  label: string
  value: string
  accent?: Accent
}) {
  const colors: Record<Accent, string> = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-sky-400',
    yellow: 'text-yellow-400',
  }
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-2 tabular-nums ${colors[accent]}`}>{value}</p>
    </div>
  )
}

function ServiceBadge({ name, status }: { name: string; status: 'ok' | 'down' }) {
  const ok = status === 'ok'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center gap-3">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`}
      />
      <span className="text-sm text-gray-300 truncate">{name}</span>
      <span className={`ml-auto text-xs font-medium ${ok ? 'text-green-400' : 'text-red-400'}`}>
        {ok ? 'OK' : 'DOWN'}
      </span>
    </div>
  )
}
