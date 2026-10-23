import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, ClipboardList, MapPin, UserRound, ShieldCheck,
  LogOut, Bell, Clock3, CheckCircle2, ChevronRight, Briefcase,
  Menu, X, Save, LockKeyhole
} from 'lucide-react';
import './AgentDashboard.css';

type Props = {
  user: any;
  onLogout: () => void;
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000';


const navigation = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'requests', label: 'Request feed', icon: ClipboardList },
  { id: 'my-requests', label: 'My Requests', icon: Briefcase },
  { id: 'areas', label: 'Service areas', icon: MapPin },
  { id: 'profile', label: 'My profile', icon: UserRound },
];

export default function AgentDashboard({ user, onLogout }: Props) {
  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasSaving, setAreasSaving] = useState(false);
  const [customServiceArea, setCustomServiceArea] = useState('');
  const [areaCatalogue, setAreaCatalogue] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [myClaims, setMyClaims] = useState<any[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsError, setClaimsError] = useState('');
  const [progressBusy, setProgressBusy] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [newRequestCount, setNewRequestCount] = useState(0);
  const [incomingNotice, setIncomingNotice] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);

  const seenRequestIds = useRef<Set<string> | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  async function loadNotifications(showLoading = false) {
    const token = localStorage.getItem('nestora_token');
    if (showLoading) setNotificationsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/requests/notifications`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load notifications.');
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(Number(data.unreadCount || 0));
    } catch (error) {
      console.error('Could not load notification history:', error);
    } finally {
      if (showLoading) setNotificationsLoading(false);
    }
  }

  async function markNotificationRead(id: string) {
    const token = localStorage.getItem('nestora_token');
    try {
      const response = await fetch(
        `${API_BASE}/api/requests/notifications/${encodeURIComponent(id)}/read`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token || ''}` }
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update notification.');
      await loadNotifications();
      setNotificationsOpen(false);
      navigate('requests');
    } catch (error) {
      console.error('Could not mark notification as read:', error);
    }
  }

  async function markAllNotificationsRead() {
    const token = localStorage.getItem('nestora_token');
    try {
      const response = await fetch(`${API_BASE}/api/requests/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update notifications.');
      await loadNotifications();
    } catch (error) {
      console.error('Could not mark all notifications as read:', error);
    }
  }


  useEffect(() => {
    const token = localStorage.getItem('nestora_token');
    fetch(`${API_BASE}/api/requests/area-catalog`, {
      headers: { Authorization: `Bearer ${token || ''}` }
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load Kaduna areas.');
        setAreaCatalogue(Array.isArray(data.areas) ? data.areas : []);
      })
      .catch(error => setNotice(error.message || 'Could not load Kaduna areas.'));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('nestora_token');
    fetch(`${API_BASE}/api/requests/areas`, {
      headers: { Authorization: `Bearer ${token || ''}` }
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load service areas.');
        setSelectedAreas(Array.isArray(data.areas) ? data.areas : []);
      })
      .catch(error => setNotice(error.message || 'Could not load service areas.'))
      .finally(() => setAreasLoading(false));
  }, []);

  const status = String(user.agentStatus ?? user.agent_status ?? 'pending').toLowerCase();
  const approved = status === 'approved';

  useEffect(() => {
    if (!approved) return;
    void loadNotifications(true);
    const interval = window.setInterval(() => void loadNotifications(), 30000);
    return () => window.clearInterval(interval);
  }, [approved]);

  const name = user.fullName || user.full_name || user.name || 'Agent';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase();

  function toggleArea(area: string) {
    setSelectedAreas(current =>
      current.includes(area)
        ? current.filter(item => item !== area)
        : [...current, area]
    );
    setNotice('');
  }

  async function saveAreas() {
    const token = localStorage.getItem('nestora_token');
    setAreasSaving(true);
    setNotice('');

    try {
      let areasToSave = [...selectedAreas];

      if (selectedAreas.includes('Other Kaduna area')) {
        const areaResponse = await fetch(`${API_BASE}/api/requests/area-catalog`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || ''}`
          },
          body: JSON.stringify({ area: customServiceArea })
        });
        const areaData = await areaResponse.json();
        if (!areaResponse.ok) throw new Error(areaData.error || 'Could not save this area.');

        areasToSave = areasToSave.filter(area => area !== 'Other Kaduna area');
        if (!areasToSave.includes(areaData.area)) areasToSave.push(areaData.area);
        setAreaCatalogue(current => current.includes(areaData.area) ? current : [...current, areaData.area].sort());
      }

      const response = await fetch(`${API_BASE}/api/requests/areas`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`
        },
        body: JSON.stringify({ areas: areasToSave })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save service areas.');

      setSelectedAreas(Array.isArray(data.areas) ? data.areas : selectedAreas);
      setNotice('Your service areas have been saved successfully.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save service areas.');
    } finally {
      setAreasSaving(false);
    }
  }


  function decodeVapidKey(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function enablePushNotifications() {
    if (!approved) {
      setPushMessage('Your agent account must be approved by an administrator first.');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushMessage('Push notifications are not supported by this browser.');
      return;
    }

    const token = localStorage.getItem('nestora_token');
    if (!token) {
      setPushMessage('Please sign in again to enable notifications.');
      return;
    }

    setPushBusy(true);
    setPushMessage('');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Allow notifications in your browser settings to continue.');
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const keyResponse = await fetch(`${API_BASE}/api/requests/push-public-key`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const keyData = await keyResponse.json();
      if (!keyResponse.ok || !keyData.publicKey) {
        throw new Error(keyData.error || 'Could not retrieve the notification key.');
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyData.publicKey).buffer as ArrayBuffer
        });
      }

      const saveResponse = await fetch(`${API_BASE}/api/requests/push-subscription`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subscription })
      });
      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saveData.error || 'Could not save your notification subscription.');
      }

      setPushEnabled(true);
      setPushMessage('Notifications enabled. We’ll alert you about matching property requests.');
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : 'Could not enable notifications.');
    } finally {
      setPushBusy(false);
    }
  }

  async function togglePushNotifications() {
    if (pushBusy) return;

    setPushBusy(true);
    setPushMessage('');

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported by this browser.');
      }

      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration
        ? await registration.pushManager.getSubscription()
        : null;

      if (subscription) {
        const token = localStorage.getItem('nestora_token');
        const response = await fetch(`${API_BASE}/api/requests/push-subscription`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Could not disable notifications.');
        }

        if (!(await subscription.unsubscribe())) {
          throw new Error('The browser could not unsubscribe. Please try again.');
        }

        setPushEnabled(false);
        setPushMessage('Browser notifications disabled.');
      } else {
        await enablePushNotifications();
      }
    } catch (error) {
      setPushMessage(
        error instanceof Error ? error.message : 'Could not update notification settings.'
      );
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function checkPushSubscription() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

      try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;

        if (!cancelled) setPushEnabled(Boolean(subscription));
      } catch (error) {
        console.error('Could not check push subscription:', error);
      }
    }

    void checkPushSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadFeed() {
    const token = localStorage.getItem('nestora_token');
    setFeedLoading(true);
    setFeedError('');

    try {
      const response = await fetch(`${API_BASE}/api/requests/feed`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load property requests.');
      const incoming = Array.isArray(data.requests) ? data.requests : [];
      const currentIds = new Set<string>(
        incoming.map((request: any) => String(request.id))
      );

      if (seenRequestIds.current === null) {
        seenRequestIds.current = currentIds;
      } else {
        const fresh = incoming.filter(
          (request: any) => !seenRequestIds.current!.has(String(request.id))
        );

        if (fresh.length > 0) {
          setNewRequestCount(count => count + fresh.length);
          setIncomingNotice(
            `${fresh.length} new matching ${fresh.length === 1 ? 'property request' : 'property requests'} received.`
          );
        }

        seenRequestIds.current = new Set([
          ...seenRequestIds.current,
          ...currentIds
        ]);
      }

      setRequests(incoming);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Could not load property requests.');
      setRequests([]);
    } finally {
      setFeedLoading(false);
    }
  }

  async function loadMyClaims() {
    const token = localStorage.getItem('nestora_token');
    setClaimsLoading(true);
    setClaimsError('');

    try {
      const response = await fetch(`${API_BASE}/api/requests/my-claims`, {
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load your requests.');
      setMyClaims(Array.isArray(data.requests) ? data.requests : []);
    } catch (error) {
      setClaimsError(error instanceof Error ? error.message : 'Could not load your requests.');
    } finally {
      setClaimsLoading(false);
    }
  }

  async function updateProgress(requestId: string, progressStatus: string) {
    const token = localStorage.getItem('nestora_token');
    setProgressBusy(requestId);
    setNotice('');

    try {
      const response = await fetch(`${API_BASE}/api/requests/${requestId}/progress`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token || ''}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ progress_status: progressStatus })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update request progress.');

      setMyClaims(current => current.map(request =>
        request.id === requestId
          ? { ...request, progress_status: data.request.progress_status }
          : request
      ));
      setNotice(data.message || 'Request progress updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update request progress.');
    } finally {
      setProgressBusy(null);
    }
  }

  async function claimRequest(requestId: string) {
    const token = localStorage.getItem('nestora_token');
    setNotice('');

    try {
      const response = await fetch(`${API_BASE}/api/requests/${requestId}/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || ''}` }
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Could not respond to this request.');

      setNotice(data.message || 'You have responded to this request.');
      await loadFeed();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not respond to this request.');
      await loadFeed();
    }
  }

  useEffect(() => {
    if (section === 'my-requests') {
      void loadMyClaims();
      return;
    }

    void loadFeed();

    const interval = window.setInterval(() => {
      void loadFeed();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [section]);

  function navigate(id: string) {
    setSection(id);
    setSidebarOpen(false);
    setNotice('');

    if (id === 'requests') {
      setNewRequestCount(0);
      setIncomingNotice('');
    }
  }

  return (
    <div className="nad-shell">
      {sidebarOpen && <button className="nad-overlay" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}

      <aside className={`nad-sidebar ${sidebarOpen ? 'nad-sidebar-open' : ''}`}>
        <div className="nad-brand">
          <div className="nad-brand-mark">N</div>
          <div>
            <strong>Nestora</strong>
            <span>AGENT PORTAL</span>
          </div>
          <button className="nad-close-menu" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>

        <div className="nad-workspace-label">WORKSPACE</div>
        <nav className="nad-navigation">
          {navigation.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nad-nav-item ${section === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === 'requests' && newRequestCount > 0 && (
                  <span className="nad-notification-badge" aria-label={`${newRequestCount} new requests`}>
                    {newRequestCount > 99 ? '99+' : newRequestCount}
                  </span>
                )}
                {section === item.id && <ChevronRight size={16} className="nad-nav-chevron" />}
              </button>
            );
          })}
        </nav>

        <div className="nad-sidebar-bottom">
          <div className="nad-help-card">
            <ShieldCheck size={21} />
            <strong>Trusted connections</strong>
            <p>Seeker contact details stay private until they give permission.</p>
          </div>
          <button className="nad-logout" onClick={onLogout}><LogOut size={18} /> Sign out</button>
          <div className="nad-sidebar-foot">NESTORA · KADUNA, NIGERIA</div>
        </div>
      </aside>

      <main className="nad-main">
        <header className="nad-topbar">
          <button className="nad-menu-button" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={22} /></button>
          <div className="nad-breadcrumb">Agent portal <span>/</span> {navigation.find(item => item.id === section)?.label}</div>
          <div className="nad-notification-wrap">
              <button
                type="button"
                className="nad-notification"
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  const next = !notificationsOpen;
                  setNotificationsOpen(next);
                  if (next) void loadNotifications(true);
                }}
              >
                <Bell size={19} />
                {unreadNotificationCount > 0 && (
                  <span className="nad-bell-count">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="nad-notification-panel" role="dialog" aria-label="Notification history">
                  <div className="nad-notification-heading">
                    <strong>Notifications</strong>
                    {unreadNotificationCount > 0 && (
                      <button type="button" onClick={() => void markAllNotificationsRead()}>
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="nad-browser-alerts">
                    <div className="nad-browser-alerts-copy">
                      <strong>Browser alerts</strong>
                      <span>Matching property requests</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pushEnabled}
                      className={pushEnabled ? 'nad-primary-button' : 'nad-secondary-button'}
                      onClick={() => void togglePushNotifications()}
                      disabled={pushBusy || !approved}
                    >
                      {pushBusy ? 'Saving…' : pushEnabled ? 'On' : 'Off'}
                    </button>
                    {pushMessage && <p className="nad-browser-alerts-message" role="status">{pushMessage}</p>}
                    {!approved && <p className="nad-browser-alerts-message">Available after admin approval.</p>}
                  </div>

                  {notificationsLoading ? (
                    <p className="nad-notification-empty">Loading notifications…</p>
                  ) : notifications.length === 0 ? (
                    <p className="nad-notification-empty">
                      No notifications yet. New requests matching your service areas will appear here.
                    </p>
                  ) : (
                    <div className="nad-notification-list">
                      {notifications.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          className={`nad-notification-item ${item.read_at ? '' : 'unread'}`}
                          onClick={() => void markNotificationRead(item.id)}
                        >
                          <span className="nad-notification-item-title">{item.title}</span>
                          <span className="nad-notification-item-message">{item.message}</span>
                          <time>
                            {new Date(item.created_at).toLocaleString('en-NG', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </time>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          <div className="nad-avatar">{initials || 'A'}</div>
        </header>

        <div className="nad-content">
          <section className="nad-welcome">
            <div>
              <div className="nad-eyebrow">YOUR NESTORA WORKSPACE</div>
              <h1>{section === 'overview' ? `Welcome, ${name.split(' ')[0]}` : navigation.find(item => item.id === section)?.label}</h1>
              <p>{section === 'overview' ? 'Manage your service areas and prepare to connect Kaduna property seekers with suitable homes.' : section === 'requests' ? 'Property requests matching your service areas will appear here.' : section === 'my-requests' ? 'Track your claimed requests and follow-up progress.' : section === 'areas' ? 'Choose the Kaduna areas where you can help property seekers.' : 'Review your agent account information.'}</p>
            </div>
            <div className={`nad-status-pill ${approved ? 'approved' : 'pending'}`}>
              {approved ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
              {approved ? 'Agent approved' : 'Approval pending'}
            </div>
          </section>

          {!approved && (
            <section className="nad-verification-banner">
              <div className="nad-verification-icon"><ShieldCheck size={23} /></div>
              <div className="nad-verification-copy">
                <h3>Awaiting admin approval</h3>
                <p>
                  {!approved
                    ? 'Your agent application must be approved by Nestora before you can access property requests.'
                    : 'Your agent application is approved. Verify your email to unlock property requests.'}
                </p>
                <div className="nad-checklist">
                  <span className={approved ? 'done' : ''}><CheckCircle2 size={15} /> Admin approval</span>
                                  </div>
              </div>
              <LockKeyhole className="nad-lock-icon" size={22} />
            </section>
          )}

          {incomingNotice && (
            <div className="nad-incoming-alert" role="status">
              <Bell size={20} />
              <span>{incomingNotice}</span>
              <button
                type="button"
                onClick={() => navigate('requests')}
              >
                View requests
              </button>
              <button
                type="button"
                className="nad-alert-dismiss"
                aria-label="Dismiss notification"
                onClick={() => setIncomingNotice('')}
              >
                ×
              </button>
            </div>
          )}

          {section === 'overview' && (
            <div className="nad-stat-grid">
              <article className="nad-stat-card">
                <div className="nad-stat-icon"><ClipboardList size={20} /></div>
                <span>Available requests</span>
                <strong>{requests.length}</strong>
                <small>{feedLoading ? 'Refreshing request feed…' : feedError || 'Matching your service areas'}</small>
                <button type="button" className="nad-secondary-button" onClick={() => navigate('requests')}>
                  Open request feed
                </button>
              </article>
              <article className="nad-stat-card">
                <div className="nad-stat-icon"><MapPin size={20} /></div>
                <span>Service areas</span>
                <strong>{selectedAreas.length}</strong>
                <small>Areas selected</small>
                <button type="button" className="nad-secondary-button" onClick={() => navigate('areas')}>
                  Manage areas
                </button>
              </article>
              <article className="nad-stat-card">
                <div className="nad-stat-icon"><ShieldCheck size={20} /></div>
                <span>Account status</span>
                <strong>{approved ? 'Approved' : 'Pending'}</strong>
                <small>{approved ? 'Agent access approved' : 'Waiting for admin approval'}</small>
              </article>
            </div>
          )}

          {section === 'my-requests' && (
            <section className="nad-panel nad-feed-panel">
              <div className="nad-panel-heading">
                <div>
                  <span className="nad-eyebrow">YOUR ASSIGNED REQUESTS</span>
                  <h2>My Requests</h2>
                  <p>Track the property requests you have claimed and update your follow-up progress.</p>
                </div>
                <button className="nad-secondary-button" onClick={() => void loadMyClaims()} disabled={claimsLoading}>
                  {claimsLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {notice && <div className="nad-notice" role="status">{notice}</div>}
              {claimsLoading && <p role="status">Loading your claimed requests…</p>}
              {!claimsLoading && claimsError && (
                <div className="nad-notice" role="alert">
                  {claimsError}
                  <button className="nad-secondary-button" onClick={() => void loadMyClaims()}>Try again</button>
                </div>
              )}

              {!claimsLoading && !claimsError && myClaims.length === 0 && (
                <div className="nad-feed-empty">
                  <div className="nad-empty-icon"><Briefcase size={28} /></div>
                  <h2>No claimed requests yet</h2>
                  <p>Review matching seeker requirements in the request feed. Claim a request only when you can meet those requirements.</p>
                  <button className="nad-primary-button" onClick={() => navigate('requests')}>Browse matching requests</button>
                </div>
              )}

              {!claimsLoading && !claimsError && myClaims.map(request => (
                <article className="nad-request-card" key={request.id}>
                  <div className="nad-request-card-top">
                    <span className="nad-eyebrow">{request.property_type}</span>
                    <span className="nad-request-area"><MapPin size={14} /> {request.area}</span>
                  </div>
                  <h3>{request.area} · {request.property_type}</h3>
                  <p className="nad-request-budget">Budget: ₦{Number(request.budget).toLocaleString('en-NG')}</p>
                  {request.requirements && <p>Seeker requirements: {request.requirements}</p>}
                  <div className="nad-seeker-contact">
                    <strong>Seeker: {request.seeker_name || 'Name unavailable'}</strong>
                    {request.seeker_phone && <p>Phone: <a href={`tel:${request.seeker_phone}`}>{request.seeker_phone}</a></p>}
                    {request.seeker_email && <p>Email: <a href={`mailto:${request.seeker_email}`}>{request.seeker_email}</a></p>}
                    {!request.seeker_phone && !request.seeker_email && <p>No contact details were provided.</p>}
                  </div>
                  {request.claimed_at && <small>Claimed {new Date(request.claimed_at).toLocaleString('en-NG')}</small>}
                  <p><strong>Progress: </strong>{({
                    claimed: 'Claimed — follow-up needed',
                    in_progress: 'In Progress',
                    completed: 'Completed'
                  } as Record<string, string>)[request.progress_status || 'claimed'] || 'Claimed — follow-up needed'}</p>

                  {request.progress_status !== 'completed' && (
                    <div className="nad-save-row">
                      {request.progress_status !== 'in_progress' && (
                        <button
                          className="nad-secondary-button"
                          disabled={progressBusy === request.id}
                          onClick={() => void updateProgress(request.id, 'in_progress')}
                        >
                          {progressBusy === request.id ? 'Updating…' : 'Mark In Progress'}
                        </button>
                      )}
                      <button
                        className="nad-primary-button"
                        disabled={progressBusy === request.id}
                        onClick={() => {
                          if (window.confirm('Mark this request as completed? Confirm that you have finished your follow-up.')) {
                            void updateProgress(request.id, 'completed');
                          }
                        }}
                      >
                        {progressBusy === request.id ? 'Updating…' : 'Mark Completed'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}

          {section === 'areas' && (
            <section className="nad-panel nad-areas-panel">
              <div className="nad-panel-heading">
                <div>
                  <span className="nad-eyebrow">KADUNA STATE ONLY</span>
                  <h2>Where do you operate?</h2>
                  <p>Select every area where you can respond to property seekers.</p>
                  {areasLoading && <small>Loading your saved areas…</small>}
                </div>
                <span className="nad-selection-count">{selectedAreas.length} selected</span>
              </div>
              <div className="nad-area-grid">
                {[...new Set([...areaCatalogue, 'Other Kaduna area'])].map(area => (
                  <button key={area} className={`nad-area-option ${selectedAreas.includes(area) ? 'selected' : ''}`} onClick={() => toggleArea(area)}>
                    <span className="nad-area-checkbox">{selectedAreas.includes(area) && <CheckCircle2 size={16} />}</span>
                    {area}
                  </button>
                ))}
              </div>
              {selectedAreas.includes('Other Kaduna area') && (
                <label className="nad-custom-area-field">
                  Enter your Kaduna service area
                  <input
                    type="text"
                    maxLength={100}
                    value={customServiceArea}
                    onChange={(event) => setCustomServiceArea(event.target.value)}
                    placeholder="e.g. a neighbourhood or street"
                  />
                </label>
              )}
              <div className="nad-save-row">
                <p>Your selection is saved to your Nestora account.</p>
                <button className="nad-primary-button" onClick={saveAreas} disabled={areasLoading || areasSaving}><Save size={17} /> {areasSaving ? "Saving…" : "Save selection"}</button>
              </div>
              {notice && <div className="nad-notice">{notice}</div>}
            </section>
          )}

          {section === 'requests' && (
            <section className="nad-panel nad-feed-panel">
              <div className="nad-panel-heading">
                <div>
                  <span className="nad-eyebrow">MATCHED TO YOUR AREAS</span>
                  <h2>Property requests</h2>
                  <p>Paid requests that match the Kaduna areas you selected.</p>
                </div>
                <button className="nad-secondary-button" onClick={() => void loadFeed()} disabled={feedLoading}>
                  {feedLoading ? 'Refreshing…' : 'Refresh feed'}
                </button>
              </div>

              {feedLoading && <p role="status">Loading available requests…</p>}
              {!feedLoading && feedError && (
                <div className="nad-notice" role="alert">
                  {feedError}
                  {feedError.toLowerCase().includes('service areas') && (
                    <button className="nad-secondary-button" onClick={() => navigate('areas')}>Set service areas</button>
                  )}
                  <button className="nad-secondary-button" onClick={() => void loadFeed()}>Try again</button>
                </div>
              )}

              {!feedLoading && !feedError && requests.length === 0 && (
                <div className="nad-feed-empty">
                  <div className="nad-empty-icon"><ClipboardList size={28} /></div>
                  <h2>No matching requests right now</h2>
                  <p>New paid requests for your saved service areas will appear here while they are active.</p>
                  <button className="nad-secondary-button" onClick={() => navigate('areas')}><MapPin size={17} /> Manage service areas</button>
                  <div className="nad-feed-note"><LockKeyhole size={15} /> Only verified, paid and unclaimed requests are shown.</div>
                </div>
              )}

              {!feedLoading && !feedError && requests.map((request) => (
                <article className="nad-request-card" key={request.id}>
                  <div className="nad-request-card-top">
                    <span className="nad-eyebrow">{request.property_type}</span>
                    <span className="nad-request-area"><MapPin size={14} /> {request.area}</span>
                  </div>
                  <h3>{request.area} · {request.property_type}</h3>
                  <p className="nad-request-budget">Budget: ₦{Number(request.budget).toLocaleString('en-NG')}</p>
                  {request.requirements && <p>{request.requirements}</p>}
                  {request.expires_at && (
                    <small>Expires {new Date(request.expires_at).toLocaleString('en-NG')}</small>
                  )}
                  <button
                    className="nad-primary-button"
                    onClick={() => {
                      const details = [
                        `Property: ${request.property_type}`,
                        `Area: ${request.area}`,
                        `Budget: ₦${Number(request.budget).toLocaleString('en-NG')}`,
                        request.requirements ? `Requirements: ${request.requirements}` : '',
                      ].filter(Boolean).join('\n');

                      if (window.confirm(
                        `Accept & Claim Request?\n\n${details}\n\nConfirm only if you can meet the seeker's requirements. Claiming assigns this request to you for follow-up. The seeker's contact details remain private.`
                      )) {
                        void claimRequest(request.id);
                      }
                    }}
                  >
                    Accept &amp; Claim Request
                  </button>
                </article>
              ))}
            </section>
          )}

          {section === 'profile' && (
            <section className="nad-panel nad-profile-panel">
              <div className="nad-profile-heading">
                <div className="nad-profile-avatar">{initials || 'A'}</div>
                <div><h2>{name}</h2><p>Nestora property agent</p></div>
              </div>
              <div className="nad-profile-fields">
                <div><span>Full name</span><strong>{name}</strong></div>
                <div><span>Email address</span><strong>{user.email || 'Not provided'}</strong></div>
                <div><span>Phone number</span><strong>{user.phone || user.phoneNumber || 'Not provided'}</strong></div>
                <div><span>Agent approval</span><strong>{approved ? 'Approved' : 'Pending review'}</strong></div>
                                <div><span>Operating location</span><strong>Kaduna State, Nigeria</strong></div>
              </div>
              <div className="nad-profile-note">Profile editing and verification actions will be connected to the backend next.</div>
            </section>
          )}

          <footer className="nad-footer">
            <span>© {new Date().getFullYear()} Nestora</span>
            <span>Your next home starts here.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
