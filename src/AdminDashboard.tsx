import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Clock3, LogOut, MapPin,
  RefreshCw, ShieldCheck, Users, Wallet, XCircle, MessageSquare
} from 'lucide-react'
import './AdminDashboard.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'

type RequestItem = {
  id: string
  property_type: string
  area: string
  budget: string | number
  requirements: string
  status: string
  published_at: string | null
  expires_at: string | null
  payment_status: string | null
  claimed_by: string | null
  claimed_at: string | null
  progress_status: string | null
  assigned_agent_name: string | null
  eligible_agent_count: number
  no_eligible_agents: boolean
  expired: boolean
}

type Agent = {
  id: string
  full_name: string
  email: string
  phone: string | null
  email_verified: boolean
  agent_status: string
  created_at: string
  service_areas: string[]
}

type SupportTicket = {
  id: string
  name: string
  email: string
  category: string
  subject: string
  message: string
  status: 'open' | 'resolved'
  created_at: string
}

type PaymentSummary = {
  revenue_kobo: string | number
  successful_count: number
  pending_count: number
  unsuccessful_count: number
  pending_kobo: string | number
}

type PaymentTransaction = {
  id: string
  seeker_name: string
  seeker_email: string
  reference: string
  amount_kobo: number
  currency: string
  status: string
  created_at: string
  paid_at: string | null
  property_type: string
  area: string
}

type Props = {
  user: { full_name?: string; email?: string }
  onLogout: () => void
}

const money = (value: string | number) =>
  '₦' + Number(value || 0).toLocaleString('en-NG')

const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '—'

export default function AdminDashboard({ user, onLogout }: Props) {
  const [activeSection, setActiveSection] = useState<'overview' | 'requests' | 'agents' | 'payments' | 'support'>('overview')
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null)
  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([])
  const [selectedPayment, setSelectedPayment] = useState<PaymentTransaction | null>(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsError, setPaymentsError] = useState('')
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [error, setError] = useState('')
  const [agentsError, setAgentsError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [processingAgent, setProcessingAgent] = useState<string | null>(null)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [ticketsError, setTicketsError] = useState('')
  const [ticketFilter, setTicketFilter] = useState('open')
  const [processingTicket, setProcessingTicket] = useState<string | null>(null)


  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(`${API_BASE}/api/requests/admin/pool`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load requests.')
      setRequests(Array.isArray(data.requests) ? data.requests : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true)
    setAgentsError('')
    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(`${API_BASE}/api/requests/admin/agents`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load registered agents.')
      setAgents(Array.isArray(data.agents) ? data.agents : [])
    } catch (err) {
      setAgentsError(err instanceof Error ? err.message : 'Connection failed. Please try again.')
    } finally {
      setAgentsLoading(false)
    }
  }, [])

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true)
    setPaymentsError('')
    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(`${API_BASE}/api/requests/admin/payments`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load payment records.')
      setPaymentSummary(data.summary || null)
      setPaymentTransactions(Array.isArray(data.transactions) ? data.transactions : [])
    } catch (err) {
      setPaymentsError(err instanceof Error ? err.message : 'Could not load payment records.')
    } finally {
      setPaymentsLoading(false)
    }
  }, [])

  const loadSupportTickets = useCallback(async () => {
    setTicketsLoading(true)
    setTicketsError('')
    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(`${API_BASE}/api/support/admin`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load support tickets.')
      setTickets(Array.isArray(data.tickets) ? data.tickets : [])
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : 'Could not load support tickets.')
    } finally {
      setTicketsLoading(false)
    }
  }, [])

  const updateTicketStatus = async (ticket: SupportTicket, status: 'open' | 'resolved') => {
    setProcessingTicket(ticket.id)
    setTicketsError('')
    setNotice('')
    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(`${API_BASE}/api/support/admin/${ticket.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update ticket status.')
      setTickets(current => current.map(item =>
        item.id === ticket.id ? { ...item, status } : item
      ))
      setNotice(status === 'resolved' ? 'Support ticket marked as resolved.' : 'Support ticket reopened.')
    } catch (err) {
      setTicketsError(err instanceof Error ? err.message : 'Could not update ticket status.')
    } finally {
      setProcessingTicket(null)
    }
  }

  const refreshAll = useCallback(() => {
    void loadRequests()
    void loadAgents()
    void loadSupportTickets()
    void loadPayments()
  }, [loadRequests, loadAgents, loadSupportTickets, loadPayments])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const releaseRequest = async (request: RequestItem) => {
    if (!request.claimed_by || request.expired || request.progress_status === 'completed') {
      return
    }

    const confirmed = window.confirm(
      `Release this ${request.property_type} request in ${request.area}?\n\n` +
      `${request.assigned_agent_name || 'The assigned agent'} will lose access to this request. ` +
      `Other eligible agents may claim it. The previous agent cannot claim it again.`
    )
    if (!confirmed) return

    setProcessingRequest(request.id)
    setActionError('')
    setNotice('')

    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(
        `${API_BASE}/api/requests/admin/${request.id}/release`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not release request.')

      setNotice('Request released. Other eligible agents can now claim it.')
      await loadRequests()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not release request.')
    } finally {
      setProcessingRequest(null)
    }
  }

  const updateAgentStatus = async (agent: Agent, status: 'approved' | 'rejected') => {
    setProcessingAgent(agent.id)
    setActionError('')
    setNotice('')

    try {
      const token = localStorage.getItem('nestora_token')
      const response = await fetch(
        `${API_BASE}/api/requests/admin/agents/${agent.id}/status`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not update agent status.')

      setAgents(current =>
        current.map(item =>
          item.id === agent.id ? { ...item, agent_status: status } : item
        )
      )

      setNotice(
        `${agent.full_name} has been ${status === 'approved' ? 'approved' : 'rejected'}.`
      )

      // Agent approval changes which agents can receive requests.
      void loadRequests()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update agent status.')
    } finally {
      setProcessingAgent(null)
    }
  }

  const uncovered = requests.filter(r => r.no_eligible_agents).length
  const expired = requests.filter(r => r.expired).length
  const pendingAgents = agents.filter(a => a.agent_status === 'pending').length
  const approvedAgents = agents.filter(a => a.agent_status === 'approved').length

  const filtered = requests.filter(r => {
    if (filter === 'uncovered') return r.no_eligible_agents
    if (filter === 'expired') return r.expired
    if (filter === 'covered') return !r.no_eligible_agents
    return true
  })

  const filteredAgents = agents.filter(agent => {
    if (agentFilter === 'pending') return agent.agent_status === 'pending'
    if (agentFilter === 'approved') return agent.agent_status === 'approved'
    if (agentFilter === 'rejected') return agent.agent_status === 'rejected'
    return true
  })

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <a className="admin-brand" href="/" aria-label="Nestora home">
          <span className="admin-brand-mark">N</span>
          <span>Nestora<small>ADMINISTRATION</small></span>
        </a>
        <div className="admin-account">
          <div>
            <strong>{user.full_name || 'Administrator'}</strong>
            <small>{user.email || 'Admin account'}</small>
          </div>
          <button className="admin-logout" onClick={onLogout}>
            <LogOut size={17} /> Logout
          </button>
        </div>
      </header>

      <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <span className="admin-sidebar-label">WORKSPACE</span>
        {([
          ['overview', 'Overview'],
          ['requests', 'Requests'],
          ['agents', 'Agents'],
          ['payments', 'Payments & Balance'],
          ['support', 'Support Inbox']
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-nav-item ${activeSection === key ? 'active' : ''}`}
            onClick={() => setActiveSection(key)}
          >
            {label}
            {key === 'agents' && pendingAgents > 0 && (
              <span className="admin-nav-count">{pendingAgents}</span>
            )}
            {key === 'support' && tickets.filter(ticket => ticket.status === 'open').length > 0 && (
              <span className="admin-nav-count">
                {tickets.filter(ticket => ticket.status === 'open').length}
              </span>
            )}
          </button>
        ))}
        <div className="admin-sidebar-note">
          <ShieldCheck size={17} />
          <span>Manage Nestora operations from one place.</span>
        </div>
      </aside>

      <section className="admin-content">
        <div className="admin-heading">
          <div>
            <span className="admin-eyebrow">
              <ShieldCheck size={15} /> CONTROL CENTRE
            </span>
            <h1>{({
              overview: 'Overview',
              requests: 'Request management',
              agents: 'Agent management',
              payments: 'Payments & Balance',
              support: 'Support Inbox'
            })[activeSection]}</h1>
            <p>Monitor and manage Nestora operations.</p>
          </div>
          <button className="admin-refresh" onClick={refreshAll} disabled={loading || agentsLoading}>
            <RefreshCw size={16} className={loading || agentsLoading ? 'admin-spinning' : ''} />
            Refresh all
          </button>
        </div>

        {activeSection === 'overview' && (
          <div className="admin-overview">
            <div className="admin-overview-intro">
              <div>
                <h2>Welcome back, {user.full_name || 'Administrator'}</h2>
                <p>Here is the current state of your property platform.</p>
              </div>
              <button className="admin-refresh" onClick={refreshAll}>
                <RefreshCw size={16} /> Refresh overview
              </button>
            </div>
            <div className="admin-stats admin-overview-stats">
              <article>
                <span className="admin-stat-icon"><Wallet size={19} /></span>
                <small>Confirmed payments</small>
                <strong>View payments</strong>
                <p>Open payment records for actual totals.</p>
                <button className="admin-text-action" onClick={() => setActiveSection('payments')}>View payment records →</button>
              </article>
              <article>
                <span className="admin-stat-icon"><Users size={19} /></span>
                <small>Registered agents</small>
                <strong>{agents.length}</strong>
                <p>{pendingAgents} awaiting review · {approvedAgents} approved</p>
                <button className="admin-text-action" onClick={() => setActiveSection('agents')}>Manage agents →</button>
              </article>
              <article>
                <span className="admin-stat-icon"><Clock3 size={19} /></span>
                <small>Published requests</small>
                <strong>{requests.length}</strong>
                <p>{requests.filter(r => !r.claimed_by && !r.expired && r.progress_status !== 'completed').length} currently unclaimed</p>
                <button className="admin-text-action" onClick={() => setActiveSection('requests')}>Manage requests →</button>
              </article>
              <article className="admin-stat-alert">
                <span className="admin-stat-icon"><MapPin size={19} /></span>
                <small>Requests without coverage</small>
                <strong>{uncovered}</strong>
                <p>{expired} expired requests</p>
                <button className="admin-text-action" onClick={() => { setFilter('uncovered'); setActiveSection('requests') }}>Review coverage →</button>
              </article>
              <article className="admin-stat-alert">
                <span className="admin-stat-icon"><MessageSquare size={19} /></span>
                <small>Open support tickets</small>
                <strong>{tickets.filter(ticket => ticket.status === 'open').length}</strong>
                <p>{tickets.length} total support tickets</p>
                <button className="admin-text-action" onClick={() => setActiveSection('support')}>Open inbox →</button>
              </article>
            </div>
            {(error || agentsError || ticketsError) && (
              <div className="admin-error">
                <AlertCircle size={18} />
                <span>Some overview data could not be loaded. Open the relevant section to retry.</span>
              </div>
            )}
          </div>
        )}

        {activeSection === 'payments' && (
          <section className="admin-list admin-payments">
            <div className="admin-list-heading">
              <div>
                <span className="admin-eyebrow"><Wallet size={15} /> SEEKER FEES</span>
                <h2>Payments & Balance</h2>
                <p>Revenue from the ₦500 property-request fee.</p>
              </div>
              <button className="admin-refresh" onClick={() => void loadPayments()} disabled={paymentsLoading}>
                <RefreshCw size={16} /> {paymentsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {paymentsError && <div className="admin-error">{paymentsError}</div>}

            <div className="admin-stats admin-payment-stats">
              <article>
                <span className="admin-stat-icon"><Wallet size={19} /></span>
                <small>Total collected</small>
                <strong>{paymentSummary ? money(Number(paymentSummary.revenue_kobo) / 100) : '—'}</strong>
                <p>Successful payments only</p>
              </article>
              <article>
                <span className="admin-stat-icon"><CheckCircle2 size={19} /></span>
                <small>Successful payments</small>
                <strong>{paymentSummary?.successful_count ?? '—'}</strong>
                <p>Confirmed transactions</p>
              </article>
              <article>
                <span className="admin-stat-icon"><Clock3 size={19} /></span>
                <small>Pending payments</small>
                <strong>{paymentSummary?.pending_count ?? '—'}</strong>
                <p>{paymentSummary ? money(Number(paymentSummary.pending_kobo) / 100) + ' awaiting confirmation' : 'Awaiting records'}</p>
              </article>
              <article>
                <span className="admin-stat-icon"><XCircle size={19} /></span>
                <small>Unsuccessful payments</small>
                <strong>{paymentSummary?.unsuccessful_count ?? '—'}</strong>
                <p>Failed or otherwise unsuccessful</p>
              </article>
            </div>

            <div className="admin-payment-history">
              <div className="admin-list-heading">
                <div>
                  <h2>Seeker payment history</h2>
                  <p>Latest 100 payment records.</p>
                </div>
              </div>
              {paymentsLoading && !paymentSummary ? (
                <p className="admin-empty">Loading payment records…</p>
              ) : paymentTransactions.length === 0 ? (
                <p className="admin-empty">{paymentsError ? 'Payment history could not be loaded.' : 'No payment records found.'}</p>
              ) : (
                <div className="admin-payment-table-wrap">
                  <table className="admin-payment-table">
                    <thead>
                      <tr>
                        <th>Seeker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentTransactions.map(payment => (
                        <tr key={payment.id}>
                          <td>
                            <button
                              type="button"
                              className="admin-seeker-name-button"
                              onClick={() => setSelectedPayment(payment)}
                            >
                              {payment.seeker_name}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedPayment && (
              <div className="admin-payment-detail-backdrop" onClick={() => setSelectedPayment(null)}>
                <section
                  className="admin-payment-detail"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="admin-payment-detail-title"
                  onClick={event => event.stopPropagation()}
                >
                  <div className="admin-list-heading">
                    <div>
                      <span className="admin-eyebrow">SEEKER PAYMENT DETAILS</span>
                      <h2 id="admin-payment-detail-title">{selectedPayment.seeker_name}</h2>
                      <p>{selectedPayment.seeker_email}</p>
                    </div>
                    <button type="button" className="admin-refresh" onClick={() => setSelectedPayment(null)}>Close</button>
                  </div>
                  <dl className="admin-payment-detail-grid">
                    <div><dt>Amount</dt><dd>{money(Number(selectedPayment.amount_kobo) / 100)}</dd></div>
                    <div><dt>Payment status</dt><dd>{selectedPayment.status.replaceAll('_', ' ')}</dd></div>
                    <div><dt>Payment reference</dt><dd>{selectedPayment.reference}</dd></div>
                    <div><dt>Payment date</dt><dd>{date(selectedPayment.paid_at)}</dd></div>
                    <div><dt>Transaction created</dt><dd>{date(selectedPayment.created_at)}</dd></div>
                    <div><dt>Property type</dt><dd>{selectedPayment.property_type}</dd></div>
                    <div><dt>Preferred area</dt><dd>{selectedPayment.area}</dd></div>
                  </dl>
                </section>
              </div>
            )}
          </section>
        )}

        {activeSection === 'requests' && <>
        <div className="admin-stats">
          <article>
            <span className="admin-stat-icon"><Wallet size={19} /></span>
            <small>Published requests</small>
            <strong>{requests.length}</strong>
            <p>Requests in the pool</p>
          </article>
          <article className="admin-stat-alert">
            <span className="admin-stat-icon"><MapPin size={19} /></span>
            <small>No eligible agents</small>
            <strong>{uncovered}</strong>
            <p>Areas needing coverage</p>
          </article>
          <article>
            <span className="admin-stat-icon"><Clock3 size={19} /></span>
            <small>Expired requests</small>
            <strong>{expired}</strong>
            <p>Past their expiry time</p>
          </article>
        </div>

        <section className="admin-list">
          <div className="admin-list-heading">
            <div>
              <h2>Published requests</h2>
              <p>Payment status and agent coverage at a glance.</p>
            </div>
            <label className="admin-filter">
              Filter
              <select value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="all">All requests</option>
                <option value="uncovered">No eligible agents</option>
                <option value="covered">Coverage available</option>
                <option value="expired">Expired</option>
              </select>
            </label>
          </div>

          {error && (
            <div className="admin-error">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => void loadRequests()}>Retry</button>
            </div>
          )}

          {loading && <p className="admin-empty">Loading request pool…</p>}

          {!loading && !error && filtered.length === 0 && (
            <div className="admin-empty">
              <Users size={26} />
              <strong>No requests found</strong>
              <span>There are no requests matching this filter.</span>
            </div>
          )}

          {!loading && !error && filtered.map(request => (
            <article className="admin-request" key={request.id}>
              <div className="admin-request-main">
                <div className="admin-request-title">
                  <h3>{request.property_type}</h3>
                  <span className={`admin-badge ${request.expired ? 'badge-expired' : request.no_eligible_agents ? 'badge-warning' : 'badge-good'}`}>
                    {request.expired ? 'Expired' : request.no_eligible_agents ? 'No eligible agents' : 'Coverage available'}
                  </span>
                </div>
                <p className="admin-area"><MapPin size={14} />{request.area}, Kaduna</p>
                <strong className="admin-budget">{money(request.budget)}</strong>
                {request.requirements && (
                  <p className="admin-requirements">{request.requirements}</p>
                )}
              </div>
              <div className="admin-request-meta">
                <span>
                  <small>Payment</small>
                  <strong className={request.payment_status === 'success' ? 'text-good' : 'text-muted'}>
                    {request.payment_status || 'Unknown'}
                  </strong>
                </span>
                <span>
                  <small>Assigned agent</small>
                  <strong>{request.assigned_agent_name || 'Unclaimed'}</strong>
                </span>
                <span>
                  <small>Progress</small>
                  <strong>{request.progress_status === 'completed'
                    ? 'Completed'
                    : request.progress_status === 'in_progress'
                      ? 'In progress'
                      : request.claimed_by ? 'Claimed' : 'Available'}</strong>
                </span>
                <span><small>Eligible agents</small><strong>{request.eligible_agent_count}</strong></span>
                <span><small>Published</small><strong>{date(request.published_at)}</strong></span>
                <span><small>Expires</small><strong>{date(request.expires_at)}</strong></span>
              </div>
              {request.claimed_by && (
                <div className="admin-request-actions">
                  <button
                    type="button"
                    className="admin-release"
                    disabled={
                      processingRequest === request.id ||
                      request.expired ||
                      request.progress_status === 'completed'
                    }
                    onClick={() => void releaseRequest(request)}
                  >
                    {processingRequest === request.id
                      ? 'Releasing…'
                      : request.progress_status === 'completed'
                        ? 'Completed'
                        : request.expired
                          ? 'Expired'
                          : 'Release Request'}
                  </button>
                </div>
              )}
            </article>
          ))}

          {!loading && !error && (
            <p className="admin-footnote">
              Seeker contact details are not displayed in this pool. Viewing a request does not claim it for an agent.
            </p>
          )}
        </section>

        </>}

        {activeSection === 'agents' && <>
        <section className="admin-list" style={{ marginTop: 28 }}>
          <div className="admin-list-heading">
            <div>
              <span className="admin-eyebrow"><Users size={15} /> AGENT ACCOUNTS</span>
              <h2>Agent management</h2>
              <p>Review registrations and control which agents can receive requests.</p>
            </div>
            <button
              className="admin-refresh"
              onClick={() => void loadAgents()}
              disabled={agentsLoading}
            >
              <RefreshCw size={16} className={agentsLoading ? 'admin-spinning' : ''} />
              Refresh agents
            </button>
          </div>

          <div className="admin-stats" style={{ marginBottom: 20 }}>
            <article>
              <span className="admin-stat-icon"><Users size={19} /></span>
              <small>Registered agents</small>
              <strong>{agents.length}</strong>
              <p>All agent accounts</p>
            </article>
            <article className="admin-stat-alert">
              <span className="admin-stat-icon"><Clock3 size={19} /></span>
              <small>Awaiting review</small>
              <strong>{pendingAgents}</strong>
              <p>Pending approval</p>
            </article>
            <article>
              <span className="admin-stat-icon"><CheckCircle2 size={19} /></span>
              <small>Approved agents</small>
              <strong>{approvedAgents}</strong>
              <p>Approved accounts</p>
            </article>
          </div>

          {notice && (
            <div role="status" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: 12,
              marginBottom: 14, borderRadius: 8, background: '#e8f6ee',
              color: '#17643a'
            }}>
              <CheckCircle2 size={18} />{notice}
            </div>
          )}

          {actionError && (
            <div className="admin-error">
              <AlertCircle size={18} /><span>{actionError}</span>
            </div>
          )}

          {agentsError && (
            <div className="admin-error">
              <AlertCircle size={18} />
              <span>{agentsError}</span>
              <button onClick={() => void loadAgents()}>Retry</button>
            </div>
          )}

          <div className="admin-list-heading" style={{ marginBottom: 16 }}>
            <strong>{filteredAgents.length} agent{filteredAgents.length === 1 ? '' : 's'}</strong>
            <label className="admin-filter">
              Status
              <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                <option value="all">All agents</option>
                <option value="pending">Pending review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>

          {agentsLoading && <p className="admin-empty">Loading registered agents…</p>}

          {!agentsLoading && !agentsError && filteredAgents.length === 0 && (
            <div className="admin-empty">
              <Users size={26} />
              <strong>No agents found</strong>
              <span>
                {agents.length === 0
                  ? 'New agent registrations will appear here.'
                  : 'No agents match the selected status.'}
              </span>
            </div>
          )}

          {!agentsLoading && !agentsError && filteredAgents.map(agent => {
            const busy = processingAgent === agent.id
            const statusLabel =
              agent.agent_status === 'approved' ? 'Approved' :
              agent.agent_status === 'rejected' ? 'Rejected' : 'Pending review'

            const statusColor =
              agent.agent_status === 'approved' ? '#17643a' :
              agent.agent_status === 'rejected' ? '#a32929' : '#8a5a00'

            const statusBackground =
              agent.agent_status === 'approved' ? '#e8f6ee' :
              agent.agent_status === 'rejected' ? '#fdecec' : '#fff3d6'

            return (
              <article className="admin-request" key={agent.id}>
                <div className="admin-request-main">
                  <div className="admin-request-title">
                    <h3>{agent.full_name}</h3>
                    <span
                      className="admin-badge"
                      style={{ color: statusColor, background: statusBackground }}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <p style={{ margin: '8px 0 4px', overflowWrap: 'anywhere' }}>
                    <strong>Email:</strong> {agent.email}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Phone:</strong> {agent.phone || 'Not provided'}
                  </p>
                  <p style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    margin: '8px 0', color: agent.email_verified ? '#17643a' : '#8a5a00'
                  }}>
                    {agent.email_verified
                      ? <CheckCircle2 size={15} />
                      : <AlertCircle size={15} />}
                    {agent.email_verified ? 'Email verified' : 'Email not verified'}
                  </p>

                  <p style={{ margin: '8px 0 4px' }}>
                    <strong>Service areas:</strong>{' '}
                    {Array.isArray(agent.service_areas) && agent.service_areas.length
                      ? agent.service_areas.join(', ')
                      : 'None selected'}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.75 }}>
                    Registered: {date(agent.created_at)}
                  </p>
                </div>

                <div style={{
                  display: 'flex', flexWrap: 'wrap', alignContent: 'center',
                  alignItems: 'center', gap: 8, paddingTop: 12
                }}>
                  {agent.agent_status !== 'approved' && (
                    <button
                      type="button"
                      disabled={busy}
                      title="Approve this agent"
                      onClick={() => void updateAgentStatus(agent, 'approved')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: 6, minHeight: 40, padding: '9px 13px', border: 0,
                        borderRadius: 7, background: '#17643a', color: '#fff',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.55 : 1
                      }}
                    >
                      <CheckCircle2 size={16} />
                      {busy ? 'Saving…' : 'Approve'}
                    </button>
                  )}

                  {agent.agent_status !== 'rejected' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void updateAgentStatus(agent, 'rejected')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: 6, minHeight: 40, padding: '9px 13px',
                        border: '1px solid #d8a0a0', borderRadius: 7,
                        background: '#fff', color: '#a32929',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.55 : 1
                      }}
                    >
                      <XCircle size={16} />
                      {busy ? 'Saving…' : 'Reject'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}

          <p className="admin-footnote">
            Agents must have a verified email and approved status to become eligible for property requests.
          </p>
        </section>
        </>}

        {activeSection === 'support' && <>
        <section className="admin-list admin-support-inbox">
          <div className="admin-list-heading">
            <div>
              <span className="admin-eyebrow"><MessageSquare size={15} /> SUPPORT CENTRE</span>
              <h2>Support Inbox</h2>
              <p>Read user messages and track requests that still need attention.</p>
            </div>
            <button
              className="admin-refresh"
              onClick={() => void loadSupportTickets()}
              disabled={ticketsLoading}
            >
              <RefreshCw size={16} className={ticketsLoading ? 'admin-spinning' : ''} />
              Refresh inbox
            </button>
          </div>

          <div className="admin-stats admin-support-stats">
            <article className="admin-stat-alert">
              <span className="admin-stat-icon"><MessageSquare size={19} /></span>
              <small>Open tickets</small>
              <strong>{tickets.filter(ticket => ticket.status === 'open').length}</strong>
              <p>Need attention</p>
            </article>
            <article>
              <span className="admin-stat-icon"><CheckCircle2 size={19} /></span>
              <small>Resolved tickets</small>
              <strong>{tickets.filter(ticket => ticket.status === 'resolved').length}</strong>
              <p>Completed support</p>
            </article>
            <article>
              <span className="admin-stat-icon"><Users size={19} /></span>
              <small>Total tickets</small>
              <strong>{tickets.length}</strong>
              <p>All submissions</p>
            </article>
          </div>

          <div className="admin-list-heading admin-support-filter">
            <strong>
              {tickets.filter(ticket => ticketFilter === 'all' || ticket.status === ticketFilter).length}
              {' '}ticket(s)
            </strong>
            <label className="admin-filter">
              Status
              <select value={ticketFilter} onChange={e => setTicketFilter(e.target.value)}>
                <option value="open">Open tickets</option>
                <option value="resolved">Resolved tickets</option>
                <option value="all">All tickets</option>
              </select>
            </label>
          </div>

          {ticketsError && (
            <div className="admin-error">
              <AlertCircle size={18} />
              <span>{ticketsError}</span>
              <button onClick={() => void loadSupportTickets()}>Retry</button>
            </div>
          )}

          {ticketsLoading && <p className="admin-empty">Loading support tickets…</p>}

          {!ticketsLoading && !ticketsError && tickets.length === 0 && (
            <div className="admin-empty">
              <MessageSquare size={26} />
              <strong>No support tickets yet</strong>
              <span>Messages submitted through Help Centre will appear here.</span>
            </div>
          )}

          {!ticketsLoading && !ticketsError &&
            tickets.filter(ticket => ticketFilter === 'all' || ticket.status === ticketFilter).length === 0 &&
            tickets.length > 0 && (
              <div className="admin-empty">
                <CheckCircle2 size={26} />
                <strong>No matching tickets</strong>
                <span>Try another status filter.</span>
              </div>
            )}

          {!ticketsLoading && !ticketsError && tickets
            .filter(ticket => ticketFilter === 'all' || ticket.status === ticketFilter)
            .map(ticket => (
              <article className="admin-request admin-support-ticket" key={ticket.id}>
                <div className="admin-request-main">
                  <div className="admin-request-title">
                    <h3>{ticket.subject}</h3>
                    <span className={`admin-badge ${ticket.status === 'open' ? 'badge-warning' : 'badge-good'}`}>
                      {ticket.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                  </div>
                  <p className="admin-support-sender">
                    <strong>{ticket.name}</strong> · {ticket.email}
                  </p>
                  <p className="admin-support-category">{ticket.category} · {date(ticket.created_at)}</p>
                  <p className="admin-support-message">{ticket.message}</p>
                </div>
                <div className="admin-support-actions">
                  <button
                    type="button"
                    disabled={processingTicket === ticket.id}
                    onClick={() => void updateTicketStatus(
                      ticket,
                      ticket.status === 'open' ? 'resolved' : 'open'
                    )}
                  >
                    {processingTicket === ticket.id
                      ? 'Saving…'
                      : ticket.status === 'open' ? 'Mark resolved' : 'Reopen ticket'}
                  </button>
                </div>
              </article>
            ))}
        </section>
        </>}
      </section>
      </div>
    </main>
  )
}
