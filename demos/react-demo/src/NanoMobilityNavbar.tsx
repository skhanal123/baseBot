const NAV_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'Home', href: '#home', active: true },
  { label: 'Plans', href: '#plans' },
  { label: '5G', href: '#5g' },
] as const;

export interface NanoMobilityNavbarProps {
  /** e.g. Sarah (C1002) — from host session + demo context API */
  signedInLabel: string;
}

function avatarInitials(label: string): string {
  const name = label.split('(')[0]?.trim() ?? label;
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return (name[0] ?? '?').toUpperCase();
}

export function NanoMobilityNavbar({ signedInLabel }: NanoMobilityNavbarProps) {
  const initials = avatarInitials(signedInLabel);

  return (
    <header className="nm-navbar">
      <div className="nm-navbar__inner">
        <a href="#home" className="nm-navbar__brand">
          <span className="nm-navbar__logo" aria-hidden>
            NM
          </span>
          <span className="nm-navbar__brand-name">
            <span className="nm-navbar__brand-title">Nano Mobility</span>
            <span className="nm-navbar__brand-tagline">Wireless</span>
          </span>
        </a>

        <div className="nm-navbar__end">
          <nav className="nm-navbar__nav" aria-label="Primary">
            {NAV_LINKS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={
                  'nm-navbar__link' +
                  ('active' in item && item.active ? ' nm-navbar__link--active' : '')
                }
                onClick={(e) => e.preventDefault()}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="nm-navbar__session">
            <span
              className="nm-navbar__user"
              title="Host app session — this userId is passed to the chat widget"
            >
              <span className="nm-navbar__avatar" aria-hidden>
                {initials}
              </span>
              {signedInLabel}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
