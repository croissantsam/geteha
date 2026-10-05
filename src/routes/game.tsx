import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { TokyoGameInstance } from '../game/tokyoGame.js';
import { subscribeCacheStats, clearLocalCache, type CacheStats } from '../shared/cache.js';

interface GameSearch {
  area?: string;
}

export const Route = createFileRoute('/game')({
  validateSearch: (search: Record<string, unknown>): GameSearch => ({
    area: typeof search.area === 'string' ? search.area : 'tokyo',
  }),
  component: GamePage,
});

function GamePage() {
  const { area = 'tokyo' } = Route.useSearch();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<TokyoGameInstance | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('Démarrage du moteur 3D...');
  const [loadingProgress, setLoadingProgress] = useState(0.05);
  const [showHelp, setShowHelp] = useState(false);
  const [isNight, setIsNight] = useState(true);
  const [fps, setFps] = useState(60);
  const [quality, setQuality] = useState<'fast' | 'balanced' | 'ultra'>('fast');
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    hits: 0,
    misses: 0,
    memoryHits: 0,
    diskHits: 0,
    total: 0,
    hitRatio: 0,
  });

  useEffect(() => {
    return subscribeCacheStats(setCacheStats);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    let active = true;
    setLoading(true);
    setLoadingProgress(0.05);
    setLoadingStep('Initialisation du monde...');

    // Dynamically launch the 3D game
    import('../game/tokyoGame.js')
      .then(({ launchTokyoGame }) => {
        if (!active || !containerRef.current) return;

        return launchTokyoGame(containerRef.current, {
          area,
          quality,
          onFpsUpdate: (currentFps) => {
            if (active) setFps(currentFps);
          },
          onProgress: (fraction, step) => {
            if (!active) return;
            setLoadingProgress(fraction);
            setLoadingStep(step);
          },
          onReady: () => {
            if (!active) return;
            setLoading(false);
          },
          onChangeArea: (newArea) => {
            navigate({ search: { area: newArea } as any });
          },
        });
      })
      .then((instance) => {
        if (!active) {
          instance?.dispose();
          return;
        }
        if (instance) {
          gameRef.current = instance;
        }
      })
      .catch((err) => {
        console.error('Failed to start Tokyo Game:', err);
        setLoadingStep('Erreur lors du chargement : ' + String(err));
      });

    return () => {
      active = false;
      if (gameRef.current) {
        gameRef.current.dispose();
        gameRef.current = null;
      }
    };
  }, [area, navigate]);

  const toggleDayNight = () => {
    if (!gameRef.current) return;
    const nextNight = !isNight;
    setIsNight(nextNight);
    gameRef.current.setTime(nextNight ? 22 : 12);
  };

  const nextCamera = () => {
    if (!gameRef.current) return;
    const mode = gameRef.current.cameraCtrl.nextMode();
    gameRef.current.hud.showNotification(`Caméra : ${mode}`);
  };

  const toggleRadio = () => {
    if (!gameRef.current) return;
    const active = gameRef.current.sound.toggleRadio();
    gameRef.current.hud.showNotification(
      active ? 'Tokyo FM Synthwave : Active 🎵' : 'Radio FM : Éteinte'
    );
  };

  const handleSetQuality = (q: 'fast' | 'balanced' | 'ultra') => {
    setQuality(q);
    if (gameRef.current) {
      gameRef.current.setQualityPreset(q);
      gameRef.current.hud.showNotification(
        q === 'fast'
          ? 'Mode 🚀 60 FPS (Fluide) activé'
          : q === 'balanced'
          ? 'Mode ⚖️ Équilibré activé'
          : 'Mode ✨ Ultra activé'
      );
    }
  };

  return (
    <div className="game-viewport">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
        }}
      />

      {/* Top Floating Control Bar */}
      <div className="game-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Link to="/" className="game-back-link">
            ◀ Accueil
          </Link>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(10, 14, 26, 0.8)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              color: '#00f0ff',
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            Quartier : {area.toUpperCase()}
          </div>

          {/* FPS Counter */}
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(10, 14, 26, 0.85)',
              border: `1px solid ${fps >= 50 ? 'rgba(16, 185, 129, 0.5)' : fps >= 32 ? 'rgba(245, 158, 11, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
              color: fps >= 50 ? '#10b981' : fps >= 32 ? '#f59e0b' : '#ef4444',
              fontFamily: 'var(--font-display)',
              fontSize: '0.88rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Fluidité en temps réel (Images par seconde)"
          >
            <span>{fps >= 50 ? '🟢' : fps >= 32 ? '🟡' : '🔴'}</span>
            <span>{fps} FPS</span>
          </div>

          {/* Graphic Quality Preset Selector */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(10, 14, 26, 0.85)',
              padding: '2px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
            }}
          >
            <button
              onClick={() => handleSetQuality('fast')}
              style={{
                background: quality === 'fast' ? '#00f0ff' : 'transparent',
                color: quality === 'fast' ? '#000' : '#cbd5e1',
                border: 'none',
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
              }}
              title="Mode 60 FPS Garanti (Résolution 1x, ombres et reflets coupés)"
            >
              🚀 60 FPS
            </button>
            <button
              onClick={() => handleSetQuality('balanced')}
              style={{
                background: quality === 'balanced' ? '#00f0ff' : 'transparent',
                color: quality === 'balanced' ? '#000' : '#cbd5e1',
                border: 'none',
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
              }}
              title="Mode Équilibré (Fidélité et fluidité)"
            >
              ⚖️ Équilibré
            </button>
            <button
              onClick={() => handleSetQuality('ultra')}
              style={{
                background: quality === 'ultra' ? '#00f0ff' : 'transparent',
                color: quality === 'ultra' ? '#000' : '#cbd5e1',
                border: 'none',
                padding: '4px 9px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
              }}
              title="Mode Ultra (Graphismes max, ombres et reflets)"
            >
              ✨ Ultra
            </button>
          </div>

          {/* Cache Telemetry Capsule */}
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(10, 14, 26, 0.85)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#10b981',
              fontFamily: 'var(--font-display)',
              fontSize: '0.88rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Appels API servis depuis le cache local (0ms)"
          >
            <span>⚡ CACHE :</span>
            <span style={{ color: '#fff' }}>{cacheStats.hits} Hits</span>
            <span style={{ color: '#64748b' }}>/</span>
            <span style={{ color: '#00f0ff' }}>{cacheStats.total} Req</span>
            <span style={{ color: '#f59e0b' }}>({cacheStats.hitRatio}%)</span>
          </div>
        </div>

        {/* Action Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={toggleDayNight}
            className="hud-btn"
            style={{
              background: 'rgba(10, 14, 26, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
            title="Basculer Jour / Nuit (Touche N)"
          >
            {isNight ? '🌙 Nuit (Tokyo 22h)' : '☀️ Jour (Tokyo 12h)'}
          </button>

          <button
            onClick={nextCamera}
            className="hud-btn"
            style={{
              background: 'rgba(10, 14, 26, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
            title="Changer de vue caméra (Touche C)"
          >
            📷 Vue
          </button>

          <button
            onClick={toggleRadio}
            className="hud-btn"
            style={{
              background: 'rgba(10, 14, 26, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
            title="Activer la musique Tokyo FM"
          >
            🎵 Radio
          </button>

          <button
            onClick={() => setShowHelp(true)}
            className="hud-btn"
            style={{
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid #00f0ff',
              color: '#00f0ff',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            ❓ Aide
          </button>
        </div>
      </div>

      {/* Cyberpunk Loading Screen */}
      {loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            background:
              'radial-gradient(ellipse at 50% 60%, #1a1140 0%, #0a0d1c 55%, #05060c 100%)',
            color: '#f4f8ff',
            fontFamily: 'var(--font-display)',
            transition: 'opacity 0.6s ease',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              letterSpacing: '0.6em',
              color: '#00f0ff',
              textShadow: '0 0 16px #00f0ff',
            }}
          >
            東京ドライブ
          </div>
          <div
            style={{
              fontSize: 'clamp(36px, 6vw, 64px)',
              fontWeight: 800,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              textShadow: '0 0 24px #ff0077, 0 0 48px #ff0077',
            }}
          >
            {area.toUpperCase()}
          </div>

          <div
            style={{
              width: 'min(460px, 80vw)',
              height: '6px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
              boxShadow: '0 0 12px rgba(0, 240, 255, 0.2)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round(loadingProgress * 100)}%`,
                background: 'linear-gradient(90deg, #00f0ff, #ff0077)',
                boxShadow: '0 0 16px #ff0077',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          <div
            style={{
              font: '13px ui-monospace, SFMono-Regular, monospace',
              color: 'rgba(244, 248, 255, 0.75)',
            }}
          >
            {loadingStep}
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div
            className="glass-panel"
            style={{
              maxWidth: '560px',
              width: '100%',
              padding: '32px',
              border: '1px solid #00f0ff',
              boxShadow: '0 0 40px rgba(0, 240, 255, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}
            >
              <h2
                className="font-display"
                style={{ fontSize: '1.8rem', fontWeight: 800, color: '#00f0ff' }}
              >
                Commandes du Véhicule
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Accélération plein gaz</span>
                <div><kbd>Z</kbd> ou <kbd>W</kbd> / <kbd>↑</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Frein / Marche arrière</span>
                <div><kbd>S</kbd> / <kbd>↓</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Direction gauche / droite</span>
                <div><kbd>Q</kbd> / <kbd>D</kbd> ou <kbd>←</kbd> / <kbd>→</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#ff0077', fontWeight: 700 }}>Frein à main (Drift)</span>
                <div><kbd>ESPACE</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Changer la caméra</span>
                <div><kbd>C</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Basculer Jour / Nuit</span>
                <div><kbd>N</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Klaxonner</span>
                <div><kbd>R</kbd></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#cbd5e1' }}>Afficher / Masquer Radar</span>
                <div><kbd>M</kbd></div>
              </div>
            </div>

            {/* Cache Local & Optimisation Status */}
            <div
              style={{
                marginTop: '20px',
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#10b981', fontSize: '0.9rem' }}>
                  ⚡ Optimisation Cache Local (TanStack & Disk)
                </div>
                <button
                  onClick={() => {
                    clearLocalCache();
                  }}
                  style={{
                    background: 'rgba(255, 0, 119, 0.2)',
                    border: '1px solid #ff0077',
                    color: '#ff0077',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Vider le Cache
                </button>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                • <strong>{cacheStats.hits}</strong> requêtes servies depuis le cache local (0 ms de latence).<br />
                • <strong>{cacheStats.memoryHits}</strong> en mémoire RAM · <strong>{cacheStats.diskHits}</strong> sur disque persistant.<br />
                • Taux d'accès au cache : <strong>{cacheStats.hitRatio}%</strong>.
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="btn-primary"
              style={{ width: '100%', marginTop: '24px', padding: '12px' }}
            >
              FERMER ET REPRENDRE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
