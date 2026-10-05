import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
} from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Tokyo Midnight Drive 3D · Conduire dans Tokyo' },
      { name: 'description', content: 'Jeu de simulation et de course 3D immersif dans la métropole de Tokyo à l\'échelle 1:1, propulsé par Three.js et TanStack.' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap' },
      { rel: 'stylesheet', href: '/src/index.css' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '16px' }}>
      <h1 className="font-display" style={{ fontSize: '3rem', color: '#ff0077' }}>404 · PAGE INTROUVABLE</h1>
      <p style={{ color: '#94a3b8' }}>La voie demandée dans Tokyo n'existe pas ou a été déplacée.</p>
      <Link to="/" className="btn-primary" style={{ marginTop: '12px' }}>
        RETOUR AU MENU PRINCIPAL
      </Link>
    </div>
  ),
});

function RootComponent() {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
