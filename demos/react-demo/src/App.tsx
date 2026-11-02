import { BaseBotChat } from '@basebot/react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const userId = import.meta.env.VITE_USER_ID ?? 'usr_browser_demo';

export function App() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>baseBot Widget Demo</h1>
        <p style={styles.subtitle}>
          API: {apiBaseUrl} · user: {userId}
        </p>
      </header>
      <main style={styles.main}>
        <BaseBotChat userId={userId} apiBaseUrl={apiBaseUrl} />
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    margin: 0,
    padding: '24px 16px',
    fontFamily: 'system-ui, sans-serif',
    background: '#f8fafc',
    boxSizing: 'border-box' as const,
  },
  header: {
    maxWidth: 480,
    margin: '0 auto 16px',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: '#0f172a',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#64748b',
  },
  main: {
    maxWidth: 480,
    height: 600,
    margin: '0 auto',
  },
};
