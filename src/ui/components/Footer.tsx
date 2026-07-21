/**
 * Landing footer: links to the parent site and the legal pages that live on it
 * (privacy/terms render on ponderance.dev per 03-legal), plus the source repo.
 */
export function Footer() {
  return (
    <footer className="footer">
      <nav className="footer__links" aria-label="Site">
        <a className="link" href="https://ponderance.dev">
          ponderance.dev
        </a>
        <a className="link" href="https://ponderance.dev/privacy">
          Privacy
        </a>
        <a className="link" href="https://ponderance.dev/terms">
          Terms
        </a>
        <a className="link" href="https://github.com/AnmolS1/antinode">
          GitHub
        </a>
      </nav>
      <p className="footer__note mono">antinode · a ponderance project</p>
    </footer>
  );
}
