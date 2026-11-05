/**
 * Stand-in for the parent app's authenticated session.
 * Production: set userId from your auth/BFF after login.
 */
export const DEMO_HOST_USER_ID =
  import.meta.env.VITE_USER_ID?.trim() || 'usr_demo_sarah';

export function formatSignedInLabel(
  displayName: string | null | undefined,
  customerId: string | null | undefined,
): string {
  if (displayName?.trim() && customerId?.trim()) {
    const first = displayName.trim().split(/\s+/)[0] ?? displayName.trim();
    return `${first} (${customerId.trim()})`;
  }
  if (displayName?.trim()) {
    return displayName.trim();
  }
  if (customerId?.trim()) {
    return customerId.trim();
  }
  return 'Signed in';
}
