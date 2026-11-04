import { StrictMode, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/700.css';
import { App } from './App';
import './styles.css';

function ReadyApp() {
  useLayoutEffect(() => { document.documentElement.dataset.appState = 'ready'; }, []);
  return <App />;
}

createRoot(document.getElementById('root')!, {
  onUncaughtError(error) {
    console.error(error);
    document.documentElement.dataset.appState = 'failed';
  },
}).render(
  <StrictMode><ReadyApp /></StrictMode>,
);
