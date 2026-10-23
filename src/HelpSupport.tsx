import { useState, type FormEvent } from 'react';
import { HelpCircle, X, Send, ChevronDown, LifeBuoy, CheckCircle2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000';

const faqs = [
  {
    category: 'For property seekers',
    items: [
      {
        question: 'How do I find a property?',
        answer: 'Create an account, sign in as a seeker, and submit a property request. Include your preferred area in Kaduna, property type, budget, and other requirements so agents can understand what you need.',
      },
      {
        question: 'How do I contact an agent?',
        answer: 'Open your requests dashboard. When an agent is assigned to your request, their available contact details will appear there.',
      },
      {
        question: 'What if my requirements change?',
        answer: 'Submit a support request describing the change or problem so the support team can guide you.',
      },
    ],
  },
  {
    category: 'For agents',
    items: [
      {
        question: 'How do I find people looking for properties?',
        answer: 'Sign in as an agent and check the request feed for property seekers whose requirements match the services you provide.',
      },
      {
        question: 'How do I contact a seeker?',
        answer: 'After claiming a request, open your dashboard to view the seeker’s available contact details.',
      },
      {
        question: 'What requests should I claim?',
        answer: 'Claim requests you can genuinely help with. Review the requested location, property type, budget, and other requirements first.',
      },
    ],
  },
  {
    category: 'Accounts and support',
    items: [
      {
        question: 'What area does Nestora cover?',
        answer: 'Nestora currently focuses on property requests and connections in Kaduna.',
      },
      {
        question: 'How do I report a problem?',
        answer: 'Open Contact Support, choose a category, explain what happened, and submit the form. Include enough detail for the team to understand the issue.',
      },
      {
        question: 'Does submitting a support request send an email?',
        answer: 'Your message is saved in the support system. Email notifications are not currently configured, so do not assume an email has been sent.',
      },
    ],
  },
];

type Tab = 'help' | 'contact';

export default function HelpSupport() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('help');
  const [expanded, setExpanded] = useState<string | null>('For property seekers-0');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    category: 'Technical issue',
    subject: '',
    message: '',
  });

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Could not submit your request. Please try again.');
      }

      setFeedback({
        type: 'success',
        text: data.message || 'Your support request has been submitted.',
      });
      setForm({
        name: '',
        email: '',
        category: 'Technical issue',
        subject: '',
        message: '',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error
          ? error.message
          : 'Could not connect to support. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="floating-help"
        aria-label="Open Help Centre and Contact Support"
        onClick={() => setOpen(true)}
        type="button"
      >
        <HelpCircle size={21} />
      </button>

      {open && (
        <div className="help-modal-backdrop" onClick={() => setOpen(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="help-modal-close"
              type="button"
              aria-label="Close help"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>

            <div className="help-modal-heading">
              <span className="help-modal-icon"><LifeBuoy size={22} /></span>
              <div>
                <h2 id="help-modal-title">How can we help?</h2>
                <p>Find answers or contact the Nestora support team.</p>
              </div>
            </div>

            <div className="help-tabs" role="tablist" aria-label="Support options">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'help'}
                className={tab === 'help' ? 'active' : ''}
                onClick={() => { setTab('help'); setFeedback(null); }}
              >
                Help Centre
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'contact'}
                className={tab === 'contact' ? 'active' : ''}
                onClick={() => { setTab('contact'); setFeedback(null); }}
              >
                Contact Support
              </button>
            </div>

            {tab === 'help' ? (
              <div className="help-faq-list">
                {faqs.map((group) => (
                  <div className="help-faq-group" key={group.category}>
                    <h3>{group.category}</h3>
                    {group.items.map((item, index) => {
                      const key = `${group.category}-${index}`;
                      const isExpanded = expanded === key;

                      return (
                        <div className="help-faq-item" key={item.question}>
                          <button
                            type="button"
                            className="help-faq-question"
                            aria-expanded={isExpanded}
                            onClick={() => setExpanded(isExpanded ? null : key)}
                          >
                            <span>{item.question}</span>
                            <ChevronDown size={18} className={isExpanded ? 'rotated' : ''} />
                          </button>
                          {isExpanded && <p className="help-faq-answer">{item.answer}</p>}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <button
                  type="button"
                  className="help-contact-cta"
                  onClick={() => { setTab('contact'); setFeedback(null); }}
                >
                  <Send size={16} /> Still need help? Contact support
                </button>
              </div>
            ) : (
              <form className="help-support-form" onSubmit={submitSupport}>
                <p className="help-form-intro">
                  Tell us what happened. Fields marked with * are required.
                </p>

                <div className="help-form-grid">
                  <label>
                    Full name *
                    <input
                      required
                      maxLength={120}
                      autoComplete="name"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="Your name"
                    />
                  </label>
                  <label>
                    Email address *
                    <input
                      required
                      type="email"
                      maxLength={255}
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="you@example.com"
                    />
                  </label>
                </div>

                <label>
                  Category *
                  <select
                    required
                    value={form.category}
                    onChange={(event) => setForm({ ...form, category: event.target.value })}
                  >
                    <option>Account</option>
                    <option>Property request</option>
                    <option>Agent</option>
                    <option>Payment</option>
                    <option>Technical issue</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Subject *
                  <input
                    required
                    maxLength={180}
                    value={form.subject}
                    onChange={(event) => setForm({ ...form, subject: event.target.value })}
                    placeholder="Briefly describe the problem"
                  />
                </label>

                <label>
                  Message *
                  <textarea
                    required
                    maxLength={5000}
                    rows={4}
                    value={form.message}
                    onChange={(event) => setForm({ ...form, message: event.target.value })}
                    placeholder="Describe the issue and what you need help with..."
                  />
                </label>

                {feedback && (
                  <div className={`help-feedback ${feedback.type}`} role="status">
                    {feedback.type === 'success' && <CheckCircle2 size={18} />}
                    <span>{feedback.text}</span>
                  </div>
                )}

                <button className="help-submit-button" type="submit" disabled={loading}>
                  {loading ? 'Submitting…' : 'Submit support request'}
                  {!loading && <Send size={17} />}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
