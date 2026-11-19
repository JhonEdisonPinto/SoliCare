import { createBrowserRouter } from 'react-router-dom';
import { Shell } from './Shell';
import { Alertas } from '../views/Alertas';
import { Configuracion } from '../views/Configuracion';
import { DispositivoDetail } from '../views/DispositivoDetail';
import { Dispositivos } from '../views/Dispositivos';
import { NotFound } from '../views/NotFound';
import { PersonaDetail } from '../views/PersonaDetail';
import { Personas } from '../views/Personas';
import { Resumen } from '../views/Resumen';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Resumen /> },
      { path: 'personas', element: <Personas /> },
      { path: 'personas/:personId', element: <PersonaDetail /> },
      { path: 'dispositivos', element: <Dispositivos /> },
      { path: 'dispositivos/:deviceId', element: <DispositivoDetail /> },
      { path: 'alertas', element: <Alertas /> },
      { path: 'configuracion', element: <Configuracion /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
