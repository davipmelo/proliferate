import { UtilityBrowser } from './UtilityBrowser.tsx';

export default function UtilitiesTab() {
  return (
    <div>
      <div className="page-header">
        <div className="grow">
          <h1>Utilitários</h1>
          <p className="desc">Fichas, emblemas, marcadores, planos, masmorras e mais — busque em tempo real, imprima ou adicione aos seus decks.</p>
        </div>
      </div>
      <UtilityBrowser mode="tab" />
    </div>
  );
}
