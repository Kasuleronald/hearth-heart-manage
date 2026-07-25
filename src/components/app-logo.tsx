// The app's own product mark (distinct from a church's own uploaded logo,
// see src/lib/branding.ts) — light/dark variants switching via CSS `dark:`
// so no client JS/theme-read is needed at render time (see the hydration
// bug this avoided in src/lib/theme.ts's useTheme()).
export function AppLogo({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo-light.png" alt="My Church" className={`${className} dark:hidden`} />
      <img
        src="/logo-dark.png"
        alt="My Church"
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
