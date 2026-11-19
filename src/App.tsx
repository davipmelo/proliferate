import { lazy, Suspense, useEffect } from 'react';
import type { TabId } from './types/models.ts';
import { TABS } from './components/layout/tabs.ts';
import { useStore } from './state/store.tsx';
import { TopBar } from './components/layout/TopBar.tsx';
import { Loading } from './components/common/bits.tsx';
import { SyncManager } from './components/auth/SyncManager.tsx';

const DecksTab = lazy(() => import('./components/decks/DecksTab.tsx'));
const CollectionTab = lazy(() => import('./components/collection/CollectionTab.tsx'));
const UtilitiesTab = lazy(() => import('./components/utilities/UtilitiesTab.tsx'));
const ProxiesTab = lazy(() => import('./components/proxies/ProxiesTab.tsx'));


export default function App() {
  const { prefs, setPrefs, data } = useStore();
  const tab = prefs.lastTab;
  const setTab = (t: TabId) => {
    setPrefs({ lastTab: t });
    window.scrollTo({ top: 0 });
  };

  // Permite navegar entre abas a partir de qualquer componente.
  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<TabId>).detail);
    window.addEventListener('proliferate:tab', on);
    return () => window.removeEventListener('proliferate:tab', on);
  });

  const proxyCount = data.proxies.reduce((s, p) => s + p.quantity, 0);

  return (
    <div className="app">
      <TopBar tab={tab} onTab={setTab} proxyCount={proxyCount} />
      <main className="main">
        <Suspense fallback={<div className="lazy-fallback"><Loading /></div>}>
          {tab === 'decks' && <DecksTab />}
          {tab === 'collection' && <CollectionTab />}
          {tab === 'utilities' && <UtilitiesTab />}
          {tab === 'proxies' && <ProxiesTab />}
        </Suspense>
      </main>
      <nav className="bottomnav" aria-label="Abas">
        {TABS.map((t) => (
          <button key={t.id} className={`bottomnav-item ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
            <span className="bn-icon">
              <t.icon size={20} />
              {t.id === 'proxies' && proxyCount > 0 && <span className="bn-badge">{proxyCount > 99 ? '99+' : proxyCount}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <SyncManager />
    </div>
  );
}

