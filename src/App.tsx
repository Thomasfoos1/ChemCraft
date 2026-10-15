import { useEffect } from 'react';
import { GameCanvas } from './scene/GameCanvas';
import { useGame } from './game/store';
import { Hud } from './ui/Hud';
import { InventoryScreen, CraftingScreen } from './ui/Inventory';
import { DialogueBox } from './ui/Dialogue';
import { QuizPanel } from './ui/Quiz';
import { DiscoveryBook } from './ui/Book';
import { FormulaConsole, SortingStation, BalancingStation, ReactorPanel } from './ui/Stations';
import { MainMenu, TeacherSettingsPage, SettingsPanel, HowToPlayPage, PauseMenu, HelpOverlay } from './ui/Menus';
import { ResultsScreen } from './ui/Results';
import { TooltipLayer } from './ui/Slot';
import { audio } from './engine/audio';

export function App() {
  const screen = useGame((s) => s.screen);
  const menuPage = useGame((s) => s.menuPage);
  const overlay = useGame((s) => s.overlay);
  const settings = useGame((s) => s.settings);
  const setMenuPage = useGame((s) => s.setMenuPage);
  const openOverlay = useGame((s) => s.openOverlay);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ui-scale', String(settings.uiScale));
    root.classList.toggle('hc', settings.highContrast);
    root.classList.toggle('readable', settings.readableFont);
    root.classList.toggle('reduced', settings.reducedMotion);
    audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume, settings.muted);
  }, [settings]);

  // Save when the tab is hidden or closed.
  useEffect(() => {
    const save = () => useGame.getState().persist();
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, []);

  return (
    <>
      <GameCanvas />
      {screen === 'menu' && menuPage === 'main' && <MainMenu />}
      {screen === 'menu' && menuPage === 'teacher' && <TeacherSettingsPage />}
      {screen === 'menu' && menuPage === 'settings' && <SettingsPanel onBack={() => setMenuPage('main')} />}
      {screen === 'menu' && menuPage === 'howto' && <HowToPlayPage onBack={() => setMenuPage('main')} />}
      {screen === 'game' && (
        <div className="ui-root">
          <Hud />
        </div>
      )}
      {screen === 'game' && overlay === 'inventory' && <InventoryScreen />}
      {screen === 'game' && overlay === 'crafting' && <CraftingScreen />}
      {screen === 'game' && overlay === 'dialogue' && <DialogueBox />}
      {screen === 'game' && overlay === 'quiz' && <QuizPanel />}
      {screen === 'game' && overlay === 'book' && <DiscoveryBook />}
      {screen === 'game' && overlay === 'console' && <FormulaConsole />}
      {screen === 'game' && overlay === 'sorter' && <SortingStation />}
      {screen === 'game' && overlay === 'balancer' && <BalancingStation />}
      {screen === 'game' && overlay === 'reactor' && <ReactorPanel />}
      {screen === 'game' && overlay === 'pause' && <PauseMenu />}
      {screen === 'game' && overlay === 'help' && <HelpOverlay />}
      {screen === 'game' && overlay === 'settings' && <SettingsPanel onBack={() => openOverlay('pause')} />}
      {screen === 'results' && <ResultsScreen />}
      <TooltipLayer />
    </>
  );
}
