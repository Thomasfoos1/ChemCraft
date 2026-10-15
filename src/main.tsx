import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/vt323';
import '@fontsource/press-start-2p';
import './styles/mc.css';
import { App } from './App';
import { runtime } from './engine/runtime';
import { useGame } from './game/store';

// Automation / debugging hook, only with ?debug in the URL.
if (new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).chemcraft = { runtime, useGame };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
