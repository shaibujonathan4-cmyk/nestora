import HelpSupport from './HelpSupport';
import SeekerDashboard from './SeekerDashboard';
import AgentDashboard from './AgentDashboard'
import AdminDashboard from './AdminDashboard';
import { useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Heart,
  Home,
  KeyRound,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import AuthModal from './AuthModal'

const areas = [
  'Barnawa',
  'GRA',
  'Kawo',
  'Malali',
  'Ungwan Rimi',
  'Ungwan Sarki',
  'Narayi',
  'Nasarawa',
  'Rigasa',
  'Sabon Tasha',
  'Tudun Wada',
  'Television',
  'Badarawa',
  'Kabala',
  'Kakuri',
  'Kurmin Mashi',
  'Makera',
  'Mando',
  'Gonin Gora',
  'Kudenda',
  'Romi',
  'Hayin Banki',
  'Ungwan Dosa',
  'Birnin Gwari',
  'Chikun',
  'Giwa',
  'Igabi',
  'Ikara',
  'Jaba',
  "Jema'a",
  'Kachia',
  'Kaduna North',
  'Kaduna South',
  'Kagarko',
  'Kajuru',
  'Kaura',
  'Kauru',
  'Kubau',
  'Kudan',
  'Lere',
  'Makarfi',
  'Sabon Gari',
  'Sanga',
  'Soba',
  'Zangon Kataf',
  'Zaria',
  'Other Kaduna area'
]

const propertyTypes = ['Apartment', 'House', 'Self-contain', 'Shop', 'Office', 'Land']

const sampleRequests = [
  {
    type: 'Apartment',
    area: 'Barnawa',
    budget: '₦500k – ₦800k / year',
    detail: 'A comfortable 2-bedroom apartment for a small family.',
    time: '12 min ago',
    initials: 'AM',
  },
  {
    type: 'Self-contain',
    area: 'Malali',
    budget: '₦250k – ₦400k / year',
    detail: 'A neat self-contain with good water supply and easy road access.',
    time: '28 min ago',
    initials: 'YK',
  },
  {
    type: 'Shop',
    area: 'Sabon Tasha',
    budget: '₦300k – ₦600k / year',
    detail: 'A shop in a busy area, suitable for a small retail business.',
    time: '41 min ago',
    initials: 'IB',
  },
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedArea, setSelectedArea] = useState('All Kaduna')
  const [selectedType, setSelectedType] = useState('All properties')
  const [searchTerm, setSearchTerm] = useState('')
  const [notice, setNotice] = useState('')
  const [showSampleInfo, setShowSampleInfo] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [dashboardUser, setDashboardUser] = useState<any>(() => {
    try {
      const token = localStorage.getItem('nestora_token')
      const savedUser = localStorage.getItem('nestora_user')
      return token && savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })

  function handleLogout() {
    localStorage.removeItem('nestora_token')
    localStorage.removeItem('nestora_user')
    setDashboardUser(null)
    setAuthMode('login')
  }


  const filteredRequests = sampleRequests.filter((request) => {
    const matchesArea = selectedArea === 'All Kaduna' || request.area === selectedArea
    const matchesType = selectedType === 'All properties' || request.type === selectedType
    const search = searchTerm.trim().toLowerCase()
    const matchesSearch =
      !search ||
      request.area.toLowerCase().includes(search) ||
      request.type.toLowerCase().includes(search) ||
      request.detail.toLowerCase().includes(search)

    return matchesArea && matchesType && matchesSearch
  })

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  if (dashboardUser) {
    if (dashboardUser.role === 'admin') {
      return <AdminDashboard user={dashboardUser} onLogout={handleLogout} />;
    }
    if (dashboardUser.role === 'agent') {
      return <AgentDashboard user={dashboardUser} onLogout={handleLogout} />;
    }
    return <><SeekerDashboard user={dashboardUser} onLogout={handleLogout} /><HelpSupport /></>;
  }

  return (
    <div className="app-shell">
      <div className="announcement">
        <ShieldCheck size={15} />
        <span>Better property connections start with trust.</span>
        <span className="announcement-divider">·</span>
        <span>Built for Kaduna.</span>
      </div>

      <header className="site-header">
        <a className="brand" href="#home" aria-label="Nestora home">
          <span className="brand-mark"><Home size={23} strokeWidth={2.2} /></span>
          <span className="brand-name">nestora<span>.</span><small>FIND YOUR PLACE</small></span>
        </a>

        <nav className={`main-nav ${menuOpen ? 'nav-open' : ''}`}>
          <a className="nav-link active" href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a className="nav-link" href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a className="nav-link" href="#requests" onClick={() => setMenuOpen(false)}>Property requests</a>
          <a className="nav-link" href="#agents" onClick={() => setMenuOpen(false)}>For agents</a>
          <div className="mobile-nav-actions">
            <button className="button button-outline" onClick={() => { setAuthMode('login');

 setMenuOpen(false) }}>Log in</button>
            <button className="button button-primary" onClick={() => { setAuthMode('register'); setMenuOpen(false) }}>Create account</button>
          </div>
        </nav>

        <div className="header-actions">
          <button className="button button-quiet login-button" onClick={() => setAuthMode('login')}>Log in</button>
          <button className="button button-primary header-cta" onClick={() => { setAuthMode('register'); setMenuOpen(false) }}>Get started <ArrowRight size={16} /></button>
        </div>
        <button
          className="menu-toggle"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </header>

      <main>
        <section className="hero-section" id="home">
          <div className="hero-content">
            <div className="eyebrow"><Sparkles size={15} /> A BETTER WAY TO FIND PROPERTY</div>
            <h1>Your next place<br />starts with <span>the right<br className="mobile-break" /> connection.</span></h1>
            <p className="hero-description">
              Tell us what you’re looking for. Connect directly with a verified local agent who can help you find it.
            </p>

            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => document.getElementById('request-search')?.scrollIntoView({ behavior: 'smooth' })}>
                Find a property <ArrowRight size={17} />
              </button>
              <a className="text-link" href="#how-it-works">See how it works <ArrowRight size={16} /></a>
            </div>

            <div className="trust-row">
              <div className="trust-icon"><ShieldCheck size={18} /></div>
              <div><strong>Trust comes first</strong><span>Verified agents. Your choice. Your privacy.</span></div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-image-wrap">
              <img
                src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1100&q=85"
                alt="Beautiful modern home with a landscaped front garden"
                className="hero-image"
              />
              <div className="image-overlay"></div>
              <div className="image-caption"><MapPin size={16} /><span>Kaduna, Nigeria</span></div>
            </div>
            <div className="floating-card verified-card">
              <span className="floating-icon"><ShieldCheck size={21} /></span>
              <span><strong>Verified connections</strong><small>Confidence at every step</small></span>
              <CheckCircle2 className="verified-check" size={19} />
            </div>
            <div className="floating-card connection-card">
              <div className="connection-avatars"><span>J</span><span>A</span><span>M</span></div>
              <div><strong>People. Places. Possibilities.</strong><small>One connection at a time.</small></div>
            </div>
            <div className="decorative-circle circle-one"></div>
            <div className="decorative-circle circle-two"></div>
          </div>
        </section>

        <section className="benefit-strip" aria-label="Nestora benefits">
          <div className="benefit-item"><span className="benefit-icon"><ShieldCheck size={21} /></span><div><strong>Verified agents</strong><small>More confidence in who you meet</small></div></div>
          <div className="benefit-item"><span className="benefit-icon"><MapPin size={21} /></span><div><strong>Area-specific requests</strong><small>Connect with agents in your area</small></div></div>
          <div className="benefit-item"><span className="benefit-icon"><KeyRound size={21} /></span><div><strong>You stay in control</strong><small>Your contact details, your decision</small></div></div>
        </section>

        <section className="requests-section section-wrap" id="requests">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE RIGHT MATCH STARTS HERE</div>
              <h2>Property needs, <span>real connections.</span></h2>
              <p>Explore sample requests to see how Nestora brings seekers and local agents together.</p>
            </div>
            <span className="preview-badge"><span></span> DESIGN PREVIEW</span>
          </div>

          <div className="search-panel" id="request-search">
            <label className="search-field">
              <Search size={19} />
              <span className="field-content"><small>Search requests</small><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Area, property or keyword" /></span>
            </label>
            <label className="select-field">
              <MapPin size={19} />
              <span className="field-content"><small>Preferred area</small><select value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)}><option>All Kaduna</option>{areas.map((area) => <option key={area}>{area}</option>)}</select></span>
              <ChevronDown className="select-chevron" size={15} />
            </label>
            <label className="select-field">
              <Home size={19} />
              <span className="field-content"><small>Property type</small><select value={selectedType} onChange={(event) => setSelectedType(event.target.value)}><option>All properties</option>{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></span>
              <ChevronDown className="select-chevron" size={15} />
            </label>
            <button className="button button-primary search-button" onClick={() => document.getElementById('request-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Explore requests <ArrowRight size={16} /></button>
          </div>

          <div className="requests-toolbar" id="request-results">
            <div><h3>Recent property needs</h3><p>Example requests shown for design purposes.</p></div>
            <span className="request-count">{filteredRequests.length} sample {filteredRequests.length === 1 ? 'request' : 'requests'}</span>
          </div>

          <div className="request-grid">
            {filteredRequests.map((request) => (
              <article className="request-card" key={`${request.type}-${request.area}`}>
                <div className="request-card-top"><span className="property-tag">{request.type}</span><span className="sample-label">SAMPLE</span><span className="request-time">{request.time}</span></div>
                <div className="request-location"><MapPin size={15} /> {request.area}, Kaduna</div>
                <h4>{request.budget}</h4>
                <p className="request-detail">{request.detail}</p>
                <div className="request-card-bottom"><div className="seeker-avatar">{request.initials}</div><div className="seeker-label"><strong>Property seeker</strong><small>Identity protected</small></div><button className="round-arrow" aria-label="Request details" onClick={() => setShowSampleInfo(true)}><ArrowRight size={18} /></button></div>
              </article>
            ))}
            {filteredRequests.length === 0 && <div className="empty-state"><Search size={26} /><strong>No sample requests found</strong><p>Try a different area, property type or keyword.</p><button className="button button-outline" onClick={() => { setSelectedArea('All Kaduna'); setSelectedType('All properties'); setSearchTerm('') }}>Clear filters</button></div>}
          </div>
          <p className="preview-note"><ShieldCheck size={15} /> These are illustrative examples, not live user requests. Agents will only see requests in their approved service areas.</p>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-wrap">
            <div className="center-heading"><div className="eyebrow section-eyebrow">SIMPLE BY DESIGN</div><h2>A more thoughtful way<br />to find <span>your place.</span></h2><p>No endless searching. Just a clear request and the right local connection.</p></div>
            <div className="steps-grid">
              <article className="step-card"><span className="step-number">01</span><span className="step-icon"><Search size={24} /></span><h3>Tell us what you need</h3><p>Choose your property type, budget, and preferred Kaduna area. Confirm your request before paying ₦500 to submit it.</p></article>
              <article className="step-card"><span className="step-number">02</span><span className="step-icon"><Users size={24} /></span><h3>Meet the right agent</h3><p>A verified agent who covers your chosen area can claim your request and confirm whether they have a suitable property.</p></article>
              <article className="step-card"><span className="step-number">03</span><span className="step-icon"><Heart size={24} /></span><h3>Connect on your terms</h3><p>Get notified when an agent is ready. You decide whether to share your contact details and continue the conversation.</p></article>
            </div>
          </div>
        </section>

        <section className="agent-cta section-wrap" id="agents">
          <div className="agent-cta-icon"><Users size={27} /></div>
          <div className="agent-cta-copy"><span className="eyebrow">FOR KADUNA PROPERTY AGENTS</span><h2>Be the connection someone needs.</h2><p>Join a local network built around genuine property requests. Agent verification is required before accessing requests.</p></div>
          <button className="button button-light" onClick={() => { setAuthMode('register'); setMenuOpen(false) }}>Join as an agent <ArrowRight size={17} /></button>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home"><span className="brand-mark"><Home size={21} /></span><span className="brand-name">nestora<span>.</span><small>FIND YOUR PLACE</small></span></a>
        <p>Built on trust. Rooted in Kaduna.</p>
        <span className="footer-copyright">© 2026 Nestora · A property connection platform</span>
      </footer>

      {authMode && (
        <AuthModal
          mode={authMode}
          initialRole="seeker"
          onClose={() => setAuthMode(null)}
          onModeChange={setAuthMode}
          onSuccess={(message) => {
            setAuthMode(null)
            try {
              const token = localStorage.getItem('nestora_token')
              const savedUser = localStorage.getItem('nestora_user')
              if (token && savedUser) {
                setDashboardUser(JSON.parse(savedUser))
              }
            } catch (error) {
              console.error('Could not load signed-in user', error)
            }
            showNotice(message)
          }}
        />
      )}

      {showSampleInfo && (
        <div className="sample-modal-backdrop" onClick={() => setShowSampleInfo(false)}>
          <section className="sample-modal" role="dialog" aria-modal="true" aria-labelledby="sample-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="sample-modal-close" aria-label="Close" onClick={() => setShowSampleInfo(false)}><X size={20} /></button>
            <span className="sample-modal-badge">SAMPLE REQUEST</span>
            <h2 id="sample-modal-title">This is a sample request</h2>
            <p>You're viewing a demonstration of how property requests appear on Nestora. This isn't a real seeker's request, and any agent responses shown are examples only.</p>
            <p>Ready to find a property that meets your needs?</p>
            <button className="button button-primary sample-modal-cta" onClick={() => { setShowSampleInfo(false); setAuthMode('register') }}>
              Create an account <ArrowRight size={17} />
            </button>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status"><CheckCircle2 size={19} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={17} /></button></div>}

      <HelpSupport />
      <div className="notification-hint" aria-hidden="true"><Bell size={14} /> A better way to connect</div>
    </div>
  )
}

export default App
