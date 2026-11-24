import { lazy, Suspense } from 'react';
import type { TabId } from './types/models.ts';
import { TABS } from './components/layout/tabs.ts';
import { useStore } from './state/store.tsx';
import { goToTab } from './state/nav.ts';
import { useRoute } from './state/router.ts';
import { TopBar } from './components/layout/TopBar.tsx';
import { Loading } from './components/common/bits.tsx';
import { SyncManager } from './components/auth/SyncManager.tsx';
import { CardRepair } from './components/common/CardRepair.tsx';

const DecksTab = lazy(() => import('./components/decks/DecksTab.tsx'));
const CollectionTab = lazy(() => import('./components/collection/CollectionTab.tsx'));
const ExploreTab = lazy(() => import('./components/explore/ExploreTab.tsx'));
const UtilitiesTab = lazy(() => import('./components/utilities/UtilitiesTab.tsx'));
const ProxiesTab = lazy(() => import('./components/proxies/ProxiesTab.tsx'));


export default function App() {
  const { data } = useStore();
  const { tab } = useRoute();

  const proxyCount = data.proxies.reduce((s, p) => s + p.quantity, 0);

  // Clique direto na aba (header/barra inferior): sempre abre a página inicial da aba ("Decks" volta para a lista).
  const onNavClick = (t: TabId) => goToTab(t);

  return (
    <div className="app">
      <TopBar tab={tab} onTab={onNavClick} proxyCount={proxyCount} />
      <main className="main">
        <Suspense fallback={<div className="lazy-fallback"><Loading /></div>}>
          {tab === 'decks' && <DecksTab />}
          {tab === 'collection' && <CollectionTab />}
          {tab === 'explore' && <ExploreTab />}
          {tab === 'utilities' && <UtilitiesTab />}
          {tab === 'proxies' && <ProxiesTab />}
        </Suspense>
      </main>
      <nav className="bottomnav" aria-label="Abas">
        {TABS.map((t) => (
          <button key={t.id} className={`bottomnav-item ${tab === t.id ? 'active' : ''}`} onClick={() => onNavClick(t.id)} aria-current={tab === t.id}>
            <span className="bn-icon">
              <t.icon size={20} />
              {t.id === 'proxies' && proxyCount > 0 && <span className="bn-badge">{proxyCount > 99 ? '99+' : proxyCount}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <SyncManager />
      <CardRepair />
    </div>
  );
}

