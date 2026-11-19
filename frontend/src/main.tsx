import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles/tokens.css';
import './styles/app.css';
import './styles/views.css';
import { DEMO_MODE, httpSource, setTelemetrySource, type TelemetrySource } from './data/api';
import { createLocalCareRepository, type CareRepository } from './data/store';
import { DataProvider } from './data/hooks';
import { ToastProvider } from './components/Toast';
import { router } from './app/router';

async function start() {
  let source: TelemetrySource = httpSource;
  let repository: CareRepository;
  if (DEMO_MODE) {
    // Only demo builds load the simulation; demo people live under their own storage key.
    const demo = await import('./data/demo');
    source = demo.demoSource;
    repository = createLocalCareRepository('solicare.demo.care.v1', demo.demoSeed);
  } else {
    repository = createLocalCareRepository('solicare.care.v1');
  }
  setTelemetrySource(source);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DataProvider source={source} repository={repository}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DataProvider>
    </StrictMode>,
  );
}

void start();
