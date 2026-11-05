import { FloatingChatShell } from './FloatingChatShell.js';
import { DEMO_HOST_USER_ID, formatSignedInLabel } from './host-session.js';
import { NanoMobilityNavbar } from './NanoMobilityNavbar.js';
import { useDemoContext } from './use-demo-context.js';
import { useThreadTitles } from './use-thread-titles.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/** Host session → framework widget (same pattern as production embed). */
const hostUserId = DEMO_HOST_USER_ID;

const QUICK_ACTIONS = [
  { label: 'Pay bill', desc: 'View balance & due date' },
  { label: 'Add a line', desc: 'Phones, tablets & watches' },
  { label: 'Upgrade device', desc: 'Trade-in offers' },
  { label: 'Coverage map', desc: '5G & LTE by ZIP' },
] as const;

const CHAT_PROMPTS = [
  'What is my current plan?',
  'Show my lines and devices',
  'How do I fix mobile data or MMS?',
] as const;

export function App() {
  const { context, loading } = useDemoContext(apiBaseUrl, hostUserId);
  const { getThreadTitle, onThreadTitle } = useThreadTitles(hostUserId);

  const signedInLabel = loading
    ? 'Loading…'
    : formatSignedInLabel(context?.display_name, context?.customer_id);

  const planLine =
    context?.primary_plan_name != null
      ? context.primary_plan_name
      : 'Your wireless plan';

  const lineSummary =
    context != null && context.line_count > 0
      ? `${String(context.line_count)} active line${context.line_count === 1 ? '' : 's'}`
      : 'Lines on your account';

  const statusLabel = context?.account_status ?? '—';

  return (
    <div className="nm-page">
      <NanoMobilityNavbar signedInLabel={signedInLabel} />

      <main className="nm-main" id="home">
        <section className="nm-hero">
          <span className="nm-hero__badge">5G nationwide</span>
          <h1 className="nm-hero__title">Move faster on our network</h1>
          <p className="nm-hero__text">
            Welcome back{context?.display_name ? `, ${context.display_name.split(' ')[0]}` : ''}.
            Manage your account below or open support chat — answers use your signed-in customer
            record (<code>userId</code> from this app session).
          </p>
        </section>

        <section className="nm-account-bar" aria-label="Account summary">
          <div className="nm-account-bar__item">
            <span className="nm-account-bar__label">Plan</span>
            <span className="nm-account-bar__value">{loading ? '…' : planLine}</span>
          </div>
          <div className="nm-account-bar__item">
            <span className="nm-account-bar__label">Lines</span>
            <span className="nm-account-bar__value">{loading ? '…' : lineSummary}</span>
          </div>
          <div className="nm-account-bar__item">
            <span className="nm-account-bar__label">Account</span>
            <span className="nm-account-bar__value">
              {loading ? '…' : context?.customer_id ?? '—'}
              {!loading && statusLabel !== '—' ? (
                <span className="nm-account-bar__status">{statusLabel}</span>
              ) : null}
            </span>
          </div>
        </section>

        <section className="nm-section" id="plans">
          <h2 className="nm-section__title">Quick actions</h2>
          <div className="nm-actions">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="nm-actions__btn"
                onClick={(e) => e.preventDefault()}
              >
                <span className="nm-actions__label">{action.label}</span>
                <span className="nm-actions__desc">{action.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="nm-columns">
          <section className="nm-section" id="5g">
            <h2 className="nm-section__title">Network &amp; devices</h2>
            <ul className="nm-list">
              <li>
                <strong>5G Ultra</strong> — Available in 2,700+ cities; avg. download 340 Mbps in
                covered areas.
              </li>
              <li>
                <strong>International</strong> — Day Pass active in 210+ destinations; manage in
                Plans.
              </li>
              <li>
                <strong>Device protection</strong> — Screen repair $29 copay on eligible lines.
              </li>
            </ul>
          </section>

          <section className="nm-section nm-section--chat" id="about">
            <h2 className="nm-section__title">Try support chat</h2>
            <p className="nm-section__lead">
              Open the bubble at the bottom-right. The assistant can query your CRM data, search
              the support manual, or look up news when needed.
            </p>
            <ul className="nm-prompts">
              {CHAT_PROMPTS.map((prompt) => (
                <li key={prompt} className="nm-prompts__item">
                  &ldquo;{prompt}&rdquo;
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="nm-section">
          <h2 className="nm-section__title">Recent activity</h2>
          <div className="nm-activity">
            <article className="nm-activity__row">
              <span className="nm-activity__date">Nov 2</span>
              <span className="nm-activity__text">Autopay scheduled — thank you</span>
            </article>
            <article className="nm-activity__row">
              <span className="nm-activity__date">Oct 28</span>
              <span className="nm-activity__text">Premium Plan renewed for next cycle</span>
            </article>
            <article className="nm-activity__row">
              <span className="nm-activity__date">Oct 15</span>
              <span className="nm-activity__text">eSIM activated on line ending ·1002</span>
            </article>
          </div>
        </section>
      </main>

      <FloatingChatShell
        userId={hostUserId}
        apiBaseUrl={apiBaseUrl}
        getThreadTitle={getThreadTitle}
        onThreadTitle={onThreadTitle}
      />
    </div>
  );
}
