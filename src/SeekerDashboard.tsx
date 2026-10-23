import { useEffect, useState } from 'react';
import {
  Home, PlusCircle, ClipboardList, MessageSquare,
  ShieldCheck, LogOut, MapPin, Wallet, Clock, Trash2,
  ChevronRight, X, CheckCircle2
} from 'lucide-react';
import './SeekerDashboard.css';

type Props = {
  user: { full_name?: string; fullName?: string; email?: string; role?: string };
  onLogout: () => void;
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000';

type Draft = {
  id: string;
  type: string;
  area: string;
  budget: string;
  details: string;
  createdAt: string;
  status: string;
  assignedAgentName?: string | null;
  assignedAgentPhone?: string | null;
  assignedAgentEmail?: string | null;
};


export default function SeekerDashboard({ user, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'requests'>('overview');
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [requests, setRequests] = useState<Draft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nestora_request_drafts') || '[]');
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState({
    type: 'Apartment', area: '', budget: '', details: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [customArea, setCustomArea] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('nestora_token');
    fetch(`${API_BASE}/api/requests/area-catalog`, {
      headers: { Authorization: `Bearer ${token || ''}` }
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load Kaduna areas.');
        setAreas(Array.isArray(data.areas) ? data.areas : []);
      })
      .catch(error => setNotice(error instanceof Error ? error.message : 'Could not load Kaduna areas.'))
      .finally(() => setAreasLoading(false));
  }, []);


  async function deleteAccount() {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete your account?'
    );
    if (!confirmed || deletingAccount) return;

    const token = localStorage.getItem('nestora_token');
    if (!token) {
      setNotice('Please sign in again before deleting your account.');
      return;
    }

    setDeletingAccount(true);
    try {
      const response = await fetch(`${API_BASE}/api/requests/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not delete your account.');
      }

      localStorage.removeItem('nestora_request_drafts');
      localStorage.removeItem('nestora_token');
      localStorage.removeItem('nestora_user');
      onLogout();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete your account.');
    } finally {
      setDeletingAccount(false);
    }
  }

  async function retryPayment(request: Draft) {
    const token = localStorage.getItem('nestora_token');
    if (!token) {
      setNotice('Please sign in again to continue payment.');
      return;
    }
    try {
      setNotice('');
      const response = await fetch(`${API_BASE}/api/requests/${encodeURIComponent(request.id)}/retry-payment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not retry payment.');
      if (typeof data.authorization_url !== 'string' ||
          !data.authorization_url.startsWith('https://checkout.paystack.com/')) {
        throw new Error('Paystack returned an invalid checkout link.');
      }
      window.location.assign(data.authorization_url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not retry payment.');
    }
  }

  async function cancelRequest(request: Draft) {
    if (!window.confirm('Cancel this unpaid request? You can submit a new one later.')) return;
    const token = localStorage.getItem('nestora_token');
    if (!token) {
      setNotice('Please sign in again to cancel this request.');
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/requests/${encodeURIComponent(request.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not cancel request.');
      setRequests(current => current.filter(item => item.id !== request.id));
      setNotice('Unpaid request cancelled.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not cancel request.');
    }
  }

  const name = user.full_name || user.fullName || 'Seeker';

  async function loadRequests() {
    const token = localStorage.getItem('nestora_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/api/requests/mine`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || data.message || 'Could not load requests.');

      const serverRequests = Array.isArray(data) ? data : (data.requests || data.data || []);
      const mapped: Draft[] = serverRequests.map((r: any) => ({
        id: r.id,
        type: r.property_type || r.type || 'Property',
        area: r.area || '',
        budget: String(r.budget ?? ''),
        details: r.requirements || r.details || '',
        createdAt: r.created_at || r.createdAt || new Date().toISOString(),
        status: r.status || 'Pending',
        assignedAgentName: r.assigned_agent_name || null,
        assignedAgentPhone: r.assigned_agent_phone || null,
        assignedAgentEmail: r.assigned_agent_email || null
      }));

      setRequests(mapped);
      localStorage.setItem('nestora_request_drafts', JSON.stringify(mapped));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your requests.');
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');

    if (!reference) {
      void loadRequests();
      return;
    }

    const token = localStorage.getItem('nestora_token');
    if (!token) {
      setNotice('Sign in again to confirm your payment.');
      return;
    }

    let cancelled = false;
    setNotice('Verifying your Paystack payment. Please wait...');

    fetch(`${API_BASE}/api/requests/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reference })
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || 'Payment verification failed.');
        return data;
      })
      .then(async data => {
        if (cancelled) return;
        window.history.replaceState({}, '', window.location.pathname);
        setNotice(data.message || 'Payment verified. Your request has been submitted.');
        await loadRequests();
        setActiveTab('requests');
      })
      .catch(error => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : 'Could not verify payment. Please try again.');
        }
      });

    return () => { cancelled = true; };
  }, []);

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();

    if (!form.area || !form.budget || Number(form.budget) <= 0) {
      setNotice('Choose an area and enter a valid budget.');
      return;
    }

    const token = localStorage.getItem('nestora_token');
    if (!token) {
      setNotice('Your session has expired. Sign in again to continue.');
      return;
    }

    setSubmitting(true);
    setNotice('');

    try {
      let selectedArea = form.area;

      if (form.area === 'Other Kaduna area') {
        const areaResponse = await fetch(`${API_BASE}/api/requests/area-catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ area: customArea })
        });
        const areaData = await areaResponse.json();
        if (!areaResponse.ok) throw new Error(areaData.error || 'Could not save this area.');
        selectedArea = areaData.area;
        setAreas(current => current.includes(selectedArea) ? current : [...current, selectedArea].sort());
        setForm(current => ({ ...current, area: selectedArea }));
      }

      const response = await fetch(`${API_BASE}/api/requests/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          property_type: form.type,
          type: form.type,
          area: selectedArea,
          budget: Number(form.budget),
          requirements: form.details,
          details: form.details
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || 'Could not start payment.');
      }

      const checkoutUrl = data.authorization_url || data.authorizationUrl ||
        data.data?.authorization_url;

      if (!checkoutUrl || !/^https:\/\/checkout\.paystack\.com\//.test(checkoutUrl)) {
        throw new Error('Paystack did not return a valid checkout link. No payment was made.');
      }

      setNotice('Opening Paystack checkout...');
      window.location.assign(checkoutUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not start payment. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="nestora-dashboard">
      <aside className="nestora-sidebar">
        <a className="nd-brand" href="/" onClick={(e) => e.preventDefault()}>
          <span className="nd-brand-mark">N</span>
          <span>Nestora<small>Your next home starts here.</small></span>
        </a>

        <div className="nd-user-card">
          <div className="nd-avatar">{name.charAt(0).toUpperCase()}</div>
          <div className="nd-user-info">
            <strong>{name}</strong>
            <span>Property seeker</span>
          </div>
        </div>

        <nav className="nd-nav">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            <Home size={18} /> Overview
          </button>
          <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}>
            <ClipboardList size={18} /> My requests
            {requests.length > 0 && <span className="nd-count">{requests.length}</span>}
          </button>
          <button onClick={() => { setShowForm(true); setNotice(''); }}>
            <PlusCircle size={18} /> Find a property
          </button>
        </nav>

        <div className="nd-sidebar-bottom">
          <div className="nd-privacy-note">
            <ShieldCheck size={20} />
            <strong>Your privacy matters</strong>
            <p>Your contact details stay private until you approve sharing them.</p>
          </div>
          <button
            className="nd-delete-account"
            onClick={deleteAccount}
            disabled={deletingAccount}
          >
            <Trash2 size={18} /> {deletingAccount ? 'Deleting account…' : 'Delete my account'}
          </button>
          <button className="nd-logout" onClick={onLogout}><LogOut size={18} /> Sign out</button>
        </div>
      </aside>

      <main className="nd-main">
        <header className="nd-topbar">
          <div>
            <span className="nd-eyebrow">KADUNA PROPERTY SEARCH</span>
            <h1>{activeTab === 'overview' ? `Welcome, ${name.split(' ')[0]}` : 'My requests'}</h1>
            <p>{activeTab === 'overview'
              ? 'Tell us what you need. The right local agent can help you find it.'
              : 'Track your property requests in one place.'}</p>
          </div>
          <button className="nd-primary" onClick={() => { setShowForm(true); setNotice(''); }}>
            <PlusCircle size={18} /> New request
          </button>
        </header>

        {notice && (
          <div className="nd-notice">
            <span>{notice}</span>
            <button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={17} /></button>
          </div>
        )}

        {activeTab === 'overview' ? (
          <>
            <section className="nd-welcome-panel">
              <div className="nd-welcome-copy">
                <span className="nd-pill">YOUR NEXT MOVE STARTS HERE</span>
                <h2>What kind of place<br />are you looking for?</h2>
                <p>Share your budget and preferred Kaduna area. Matching agents can then respond to your needs.</p>
                <button className="nd-light-button" onClick={() => setShowForm(true)}>
                  Create a request <ChevronRight size={17} />
                </button>
              </div>
              <div className="nd-house-art"><Home size={92} strokeWidth={1.1} /></div>
            </section>

            <section className="nd-stats">
              <article className="nd-stat-card">
                <span className="nd-stat-icon"><ClipboardList size={19} /></span>
                <span className="nd-stat-label">My requests</span>
                <strong>{requests.length}</strong>
                <small>From your account</small>
              </article>
              <article className="nd-stat-card">
                <span className="nd-stat-icon"><Wallet size={19} /></span>
                <span className="nd-stat-label">Request fee</span>
                <strong>₦500</strong>
                <small>Per Kaduna area</small>
              </article>
              <article className="nd-stat-card">
                <span className="nd-stat-icon"><MessageSquare size={19} /></span>
                <span className="nd-stat-label">Agent responses</span>
                <strong>—</strong>
                <small>Response service not connected yet</small>
              </article>
            </section>

            <section className="nd-section">
              <div className="nd-section-heading">
                <div><h2>Recent requests</h2><p>Your property requests</p></div>
                <button className="nd-text-button" onClick={() => setActiveTab('requests')}>View all <ChevronRight size={16} /></button>
              </div>
              {requests.length ? (
                <div className="nd-request-list">
                  {requests.slice(0, 3).map((r) => (
                    <RequestCard key={r.id} request={r} onRetry={retryPayment} onCancel={cancelRequest} />
                  ))}
                </div>
              ) : (
                <div className="nd-empty">
                  <span className="nd-empty-icon"><MapPin size={24} /></span>
                  <h3>Your property search starts here</h3>
                  <p>You haven't created a request yet. Tell us your preferred area, budget and property type.</p>
                  <button className="nd-outline-button" onClick={() => setShowForm(true)}>Create your first request</button>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="nd-section nd-requests-page">
            {requests.length ? (
              <div className="nd-request-list">
                {requests.map((r) => <RequestCard key={r.id} request={r} onRetry={retryPayment} onCancel={cancelRequest} />)}
              </div>
            ) : (
              <div className="nd-empty">
                <span className="nd-empty-icon"><ClipboardList size={24} /></span>
                <h3>No requests yet</h3>
                <p>Create a property request to start your search in Kaduna.</p>
                <button className="nd-primary" onClick={() => setShowForm(true)}><PlusCircle size={18} /> New request</button>
              </div>
            )}
          </section>
        )}

        <footer className="nd-footer">© Nestora · Kaduna, Nigeria <span>Property search, made clearer.</span></footer>
      </main>

      {showForm && (
        <div className="nd-modal-backdrop" onClick={() => setShowForm(false)}>
          <section className="nd-modal" onClick={(e) => e.stopPropagation()}>
            <button className="nd-modal-close" aria-label="Close form" onClick={() => setShowForm(false)}><X size={20} /></button>
            <span className="nd-eyebrow">YOUR PROPERTY SEARCH</span>
            <h2>Tell us what you need</h2>
            <p className="nd-modal-intro">One request covers one Kaduna area. Pay ₦500 securely through Paystack; publication happens only after server verification.</p>
            <form onSubmit={saveDraft}>
              <label>Property type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option>Apartment</option><option>Self-contained</option><option>Duplex</option>
                  <option>House</option><option>Shop</option><option>Office</option><option>Land</option>
                </select>
              </label>
              <label>Preferred Kaduna area
                <select required value={form.area} disabled={areasLoading} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                  <option value="">Choose an area</option>
                  {areas.map((area) => <option key={area}>{area}</option>)}
                  <option>Other Kaduna area</option>
                </select>
              </label>
              {form.area === 'Other Kaduna area' && (
                <label>Enter your Kaduna area
                  <input required maxLength={100} value={customArea}
                    placeholder="e.g. a neighbourhood or street"
                    onChange={(e) => setCustomArea(e.target.value)} />
                </label>
              )}
              <label>Maximum budget (₦)
                <input required type="number" min="1" placeholder="e.g. 500000" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </label>
              <label>Requirements <span className="nd-optional">(optional)</span>
                <textarea rows={3} maxLength={1000} placeholder="Bedrooms, facilities, preferred street..." value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
              </label>
              <div className="nd-fee-row"><span>Request fee</span><strong>₦500</strong></div>
              <button className="nd-primary nd-submit" type="submit" disabled={submitting}>{submitting ? "Connecting to Paystack..." : "Continue to pay ₦500"} <ChevronRight size={18} /></button>
              <small className="nd-form-footnote">Your request is published only after the server verifies your ₦500 payment.</small>
            </form>
          </section>
        </div>
      )}

      {user.role === 'agent' && (
        <div className="nd-agent-warning">
          <strong>Agent account detected.</strong> This is the seeker dashboard preview. Agent approval and the agent workspace will be connected separately.
        </div>
      )}
    </div>
  );
}

function RequestCard({ request, onRetry, onCancel }: {
  request: Draft;
  onRetry: (request: Draft) => void;
  onCancel: (request: Draft) => void;
}) {
  return (
    <article className="nd-request-card">
      <div className="nd-request-icon"><Home size={20} /></div>
      <div className="nd-request-details">
        <strong>{request.type} · {request.area}</strong>
        <span><MapPin size={14} /> {request.area}, Kaduna</span>
        <small>Budget: ₦{Number(request.budget).toLocaleString('en-NG')}</small>
        {request.assignedAgentName && (
          <div className="nd-assigned-agent">
            <strong>Assigned agent: {request.assignedAgentName}</strong>
            {request.assignedAgentPhone && <a href={`tel:${request.assignedAgentPhone}`}>Call: {request.assignedAgentPhone}</a>}
            {request.assignedAgentEmail && <a href={`mailto:${request.assignedAgentEmail}`}>Email: {request.assignedAgentEmail}</a>}
          </div>
        )}
      </div>
      <div className="nd-request-status">
        <span><Clock size={14} /> {request.status}</span>
        <small>{new Date(request.createdAt).toLocaleDateString('en-NG')}</small>
      </div>
      {request.status === 'pending_payment' && (
        <div className="nd-pending-actions">
          <button type="button" onClick={() => onRetry(request)}>Retry ₦500 payment</button>
          <button type="button" onClick={() => onCancel(request)}>Cancel request</button>
        </div>
      )}
      <CheckCircle2 className="nd-request-check" size={18} />
    </article>
  );
}
