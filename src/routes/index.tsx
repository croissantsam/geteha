import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

const DISTRICTS = [
  {
    id: 'tokyo',
    name: 'Tokyo Tower & Roppongi',
    jp: '東京タワー・六本木',
    desc: 'Lignes droites à haute vitesse, autoroutes suspendues Shuto et vue majestueuse sur la tour illuminée de Tokyo.',
    tag: 'Recommandé',
    color: '#ff0077',
  },
  {
    id: 'shibuya',
    name: 'Shibuya Crossing',
    jp: '渋谷交差点',
    desc: 'Le croisement le plus dense du monde, entouré d\'écrans géants et d\'avenues commerçantes rythmées.',
    tag: 'Urbain',
    color: '#00f0ff',
  },
  {
    id: 'shinjuku',
    name: 'Shinjuku Skyscraper',
    jp: '新宿高層ビル群',
    desc: 'Forêt de gratte-ciels monumentaux, reflets de verre cyberpunk et virages techniques entre les tours.',
    tag: 'Gratte-ciels',
    color: '#8b5cf6',
  },
  {
    id: 'ginza',
    name: 'Ginza Avenue',
    jp: '銀座通り',
    desc: 'Grandes avenues rectilignes de luxe, néons scintillants et asphalte idéal pour pousser les pointes de vitesse.',
    tag: 'Vitesse max',
    color: '#f59e0b',
  },
  {
    id: 'akihabara',
    name: 'Akihabara Electric Town',
    jp: '秋葉原電気街',
    desc: 'Le cœur technologique et anime de la capitale, enseignes rétro-éclairées et carrefours palpitants.',
    tag: 'Néon',
    color: '#10b981',
  },
];

const GAME_MODES = [
  {
    icon: '⚡',
    title: 'Drift & Style',
    desc: 'Glissez dans les carrefours au frein à main et accumulez des points de style avec multiplicateur de combo.',
  },
  {
    icon: '⏱️',
    title: 'Contre-la-Montre',
    desc: 'Franchissez une série de checkpoints néon dans les rues de Tokyo avant la fin du compte à rebours.',
  },
  {
    icon: '🚀',
    title: 'Radar & Vitesse',
    desc: 'Passez devant les radars de police automatisés de la Shuto Expressway à plus de 180 km/h.',
  },
  {
    icon: '🌆',
    title: 'Croisière Libre',
    desc: 'Explorez la mégalopole japonaise sans limite de temps, avec cycle jour/nuit et radio FM procédurale.',
  },
];

function LandingPage() {
  const [selectedArea, setSelectedArea] = useState('tokyo');

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      <div className="cyber-grid" />

      {/* Navigation Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(5, 7, 14, 0.8)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(0, 240, 255, 0.15)',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #00f0ff, #ff0077)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(0, 240, 255, 0.4)',
                fontWeight: 900,
                fontSize: '20px',
              }}
            >
              東
            </div>
            <div>
              <div
                className="font-display"
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  letterSpacing: '1.5px',
                  background: 'linear-gradient(90deg, #fff, #00f0ff)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                TOKYO MIDNIGHT DRIVE
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', letterSpacing: '2px' }}>
                東京ミッドナイトドライブ · 3D SIMULATOR
              </div>
            </div>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a
              href="#districts"
              style={{
                color: '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.95rem',
                fontWeight: 600,
                transition: 'color 0.2s',
              }}
            >
              Quartiers
            </a>
            <a
              href="#features"
              style={{
                color: '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.95rem',
                fontWeight: 600,
                transition: 'color 0.2s',
              }}
            >
              Caractéristiques
            </a>
            <a
              href="#controls"
              style={{
                color: '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.95rem',
                fontWeight: 600,
                transition: 'color 0.2s',
              }}
            >
              Commandes
            </a>
            <Link
              to="/game"
              className="btn-primary"
              style={{ padding: '10px 22px', fontSize: '0.95rem' }}
            >
              JOUER MAINTENANT
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          position: 'relative',
          padding: '80px 24px 70px',
          maxWidth: '1240px',
          margin: '0 auto',
          textAlign: 'center',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 16px',
            borderRadius: '999px',
            background: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            color: '#00f0ff',
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '1.5px',
            marginBottom: '28px',
            boxShadow: '0 0 20px rgba(0, 240, 255, 0.15)',
          }}
        >
          <span style={{ color: '#ff0077' }}>●</span> NOUVEAU · MOTEUR PHYSIQUE & COLLISIONS 3D ACTIVES
        </div>

        <h1
          className="font-display"
          style={{
            fontSize: 'clamp(2.8rem, 6.5vw, 5.5rem)',
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: '20px',
          }}
        >
          Domptez la nuit de <br />
          <span className="text-gradient-neon">TOKYO EN PLEINE VITESSE</span>
        </h1>

        <p
          style={{
            maxWidth: '720px',
            margin: '0 auto 40px',
            fontSize: '1.2rem',
            lineHeight: 1.6,
            color: '#94a3b8',
          }}
        >
          Une simulation de conduite 3D immersive basée sur la géométrie cadastrale réelle de Tokyo
          (PLATEAU, OpenStreetMap & GSI). Slalommez entre les gratte-ciels illuminés avec gestion
          de drift, sons procéduraux et collisions solides.
        </p>

        {/* CTA Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '18px',
            marginBottom: '60px',
          }}
        >
          <Link
            to="/game"
            className="btn-primary"
            style={{ fontSize: '1.25rem' }}
          >
            PILOTER DANS TOKYO ▶
          </Link>
          <a
            href="#districts"
            className="btn-secondary"
            style={{ fontSize: '1.1rem' }}
          >
            CHOISIR UN QUARTIER ⬎
          </a>
        </div>

        {/* Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            maxWidth: '1000px',
            margin: '0 auto',
          }}
        >
          {[
            { value: '1:1', label: 'Échelle Réelle', sub: 'Données cadastrales PLATEAU' },
            { value: '50 000+', label: 'Bâtiments 3D', sub: 'Textures et façades photoréalistes' },
            { value: 'Solides', label: 'Collisions Actives', sub: 'Physique de rebond contre les murs' },
            { value: '100% Web', label: 'Sans Téléchargement', sub: 'Propulsé par Three.js & TanStack' },
          ].map((stat, i) => (
            <div
              key={i}
              className="glass-panel"
              style={{
                padding: '20px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div
                className="font-display"
                style={{
                  fontSize: '2.4rem',
                  fontWeight: 800,
                  color: '#00f0ff',
                  textShadow: '0 0 16px rgba(0, 240, 255, 0.4)',
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc', marginTop: '2px' }}>
                {stat.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                {stat.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Districts Section */}
      <section
        id="districts"
        style={{
          position: 'relative',
          padding: '80px 24px',
          maxWidth: '1240px',
          margin: '0 auto',
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <div
            style={{
              color: '#ff0077',
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Zones Explorables
          </div>
          <h2
            className="font-display"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3.2rem)',
              fontWeight: 800,
              letterSpacing: '1px',
              marginTop: '6px',
            }}
          >
            Sélectionnez votre terrain de jeu
          </h2>
          <p style={{ color: '#94a3b8', maxWidth: '600px', margin: '10px auto 0' }}>
            Chaque quartier propose son propre réseau de voies, ses autoroutes suspendues et ses monuments iconiques.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
          }}
        >
          {DISTRICTS.map((district) => (
            <div
              key={district.id}
              className="glass-panel"
              style={{
                padding: '28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
                borderColor: selectedArea === district.id ? district.color : undefined,
                boxShadow: selectedArea === district.id ? `0 0 25px ${district.color}40` : undefined,
              }}
              onClick={() => setSelectedArea(district.id)}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: `${district.color}25`,
                      color: district.color,
                      border: `1px solid ${district.color}60`,
                    }}
                  >
                    {district.tag}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{district.jp}</span>
                </div>

                <h3
                  className="font-display"
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                    marginBottom: '8px',
                  }}
                >
                  {district.name}
                </h3>

                <p style={{ fontSize: '0.95rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '24px' }}>
                  {district.desc}
                </p>
              </div>

              <Link
                to="/game"
                search={{ area: district.id } as any}
                className="btn-secondary"
                style={{
                  width: '100%',
                  borderColor: district.color,
                  color: '#fff',
                  justifyContent: 'center',
                }}
              >
                Explorer {district.name} ➔
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Game Features Section */}
      <section
        id="features"
        style={{
          position: 'relative',
          padding: '80px 24px',
          background: 'rgba(10, 14, 28, 0.4)',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <div
              style={{
                color: '#00f0ff',
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              Technologies & Mécaniques
            </div>
            <h2
              className="font-display"
              style={{
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                fontWeight: 800,
                letterSpacing: '1px',
                marginTop: '6px',
              }}
            >
              Une expérience arcade moderne
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
            }}
          >
            {GAME_MODES.map((mode, i) => (
              <div
                key={i}
                className="glass-panel"
                style={{
                  padding: '28px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div
                  style={{
                    fontSize: '2.5rem',
                    marginBottom: '16px',
                  }}
                >
                  {mode.icon}
                </div>
                <h3
                  className="font-display"
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    marginBottom: '10px',
                    color: '#f8fafc',
                  }}
                >
                  {mode.title}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.6 }}>
                  {mode.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Controls & Cheatsheet */}
      <section
        id="controls"
        style={{
          position: 'relative',
          padding: '80px 24px',
          maxWidth: '1240px',
          margin: '0 auto',
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <div
            style={{
              color: '#8b5cf6',
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            Tableau de Bord
          </div>
          <h2
            className="font-display"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3.2rem)',
              fontWeight: 800,
              letterSpacing: '1px',
              marginTop: '6px',
            }}
          >
            Commandes de Conduite
          </h2>
        </div>

        <div
          className="glass-panel"
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            padding: '36px',
            border: '1px solid rgba(0, 240, 255, 0.25)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '24px',
            }}
          >
            <div>
              <div
                className="font-display"
                style={{ fontSize: '1.2rem', fontWeight: 700, color: '#00f0ff', marginBottom: '14px' }}
              >
                Conduite Principale
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>Z</kbd> ou <kbd>W</kbd> / <kbd>↑</kbd>
                  <span style={{ color: '#cbd5e1' }}>Accélérateur (Plein régime)</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>S</kbd> / <kbd>↓</kbd>
                  <span style={{ color: '#cbd5e1' }}>Frein & Marche Arrière</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>Q</kbd> ou <kbd>A</kbd> & <kbd>D</kbd>
                  <span style={{ color: '#cbd5e1' }}>Braquage gauche / droite</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>ESPACE</kbd>
                  <span style={{ color: '#ff0077', fontWeight: 600 }}>Frein à main / Déclencheur Drift</span>
                </li>
              </ul>
            </div>

            <div>
              <div
                className="font-display"
                style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ff0077', marginBottom: '14px' }}
              >
                Caméra & Véhicule
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>C</kbd>
                  <span style={{ color: '#cbd5e1' }}>Cycle caméra (Poursuite / FPV / Capot)</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>N</kbd>
                  <span style={{ color: '#cbd5e1' }}>Bascule Jour / Nuit instantanée</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>R</kbd>
                  <span style={{ color: '#cbd5e1' }}>Klaxonner</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <kbd>M</kbd>
                  <span style={{ color: '#cbd5e1' }}>Afficher / Masquer Minimap Radar</span>
                </li>
              </ul>
            </div>
          </div>

          <div
            style={{
              marginTop: '32px',
              paddingTop: '24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
              💡 <em>Astuce : Maintenez Espace dans un virage serré pour déclencher un drift tout en accélérant !</em>
            </div>
            <Link to="/game" className="btn-primary" style={{ padding: '12px 28px' }}>
              DÉMARRER LE MOTEUR ▶
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '40px 24px',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '0.9rem',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
          <p style={{ marginBottom: '8px', color: '#94a3b8' }}>
            Projet Tokyo 3D · Architecture modulaire avec <strong>TanStack Start</strong>,{' '}
            <strong>TanStack Router</strong>, <strong>TypeScript</strong> et <strong>Three.js</strong>.
          </p>
          <p>
            Données urbaines ouvertes : Project PLATEAU (MLIT Japon), OpenStreetMap, Geospatial Information Authority of Japan (GSI).
          </p>
        </div>
      </footer>
    </div>
  );
}
