import { createBrowserRouter } from 'react-router-dom';
import { Shell } from './Shell';
import { Resumen } from '../views/Resumen';
import { NotFound, Placeholder } from '../views/Placeholder';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Resumen /> },
      { path: 'personas', element: <Placeholder title="Personas" /> },
      { path: 'personas/:personId', element: <Placeholder title="Detalle de la persona" /> },
      { path: 'dispositivos', element: <Placeholder title="Dispositivos" /> },
      { path: 'dispositivos/:deviceId', element: <Placeholder title="Detalle del dispositivo" /> },
      { path: 'alertas', element: <Placeholder title="Alertas" /> },
      { path: 'configuracion', element: <Placeholder title="Configuración" /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
