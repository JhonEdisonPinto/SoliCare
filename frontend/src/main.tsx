import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles/tokens.css';
import './styles/app.css';
import './styles/views.css';
import { httpSource, setTelemetrySource, type TelemetrySource } from './data/api';
import { connectCare, unlockWithKey } from './data/careBackend';
import { DATA_MODE, switchDataMode } from './data/dataMode';
import { createLocalCareRepository, type CareRepository } from './data/store';
import { DataProvider } from './data/hooks';
import { CareErrorToaster } from './components/CareErrorToaster';
import { PanelKeyGate } from './components/PanelKeyGate';
import { ToastProvider } from './components/Toast';
import { router } from './app/router';

async function start() {
  let source: TelemetrySource = httpSource;
  const root = createRoot(document.getElementById('root')!);

  const mount = (repository: CareRepository) => {
    root.render(
      <StrictMode>
        <DataProvider source={source} repository={repository}>
          <ToastProvider>
            <CareErrorToaster />
            <RouterProvider router={router} />
          </ToastProvider>
        </DataProvider>
      </StrictMode>,
    );
  };

  if (DATA_MODE === 'demo') {
    // Only the demo source loads the simulation; demo people live under their own storage key.
    const demo = await import('./data/demo');
    source = demo.demoSource;
    setTelemetrySource(source);
    mount(createLocalCareRepository('solicare.demo.care.v1', demo.demoSeed));
    return;
  }

  setTelemetrySource(source);
  const connection = await connectCare();
  if (connection.kind === 'ready') {
    mount(connection.repository);
    return;
  }
  // The server asks for the panel key: nothing of the panel is shown until it is right.
  const verify = async (key: string) => {
    const result = await unlockWithKey(key);
    if (!result.ok) return result.error;
    mount(result.repository);
    return null;
  };
  root.render(
    <StrictMode>
      <PanelKeyGate verify={verify} onUseDemo={() => switchDataMode('demo')} initialError={connection.hadKey ? 'La clave guardada ya no es válida. Escriba la clave actual del panel.' : undefined} />
    </StrictMode>,
  );
}

void start();
