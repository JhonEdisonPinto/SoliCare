# Frontend

Panel web de SoliCare construido con React, Vite y TypeScript.
La interfaz sigue el diseño original de SoliCare: barra lateral, barra superior,
tarjetas blancas sobre fondo claro, paleta verde, DM Sans y Manrope (incluidas
con el paquete, sin pedirlas a un servicio externo) e iconos de `lucide-react`.
Está pensada para escritorio, tablet y celular (desde 360 px, sin desplazamiento
horizontal); en pantallas estrechas la barra lateral es un menú desplegable.

Panel web para familiares, cuidadores y personal de la central de control.

## Vistas

| Ruta | Qué muestra |
| --- | --- |
| `/` | Resumen: saludo, aviso de la alerta abierta más urgente, cuatro indicadores, signos vitales con gráfico, red de personas, detección de caídas, actividad reciente y dispositivos sin persona asignada. Todo sale de datos reales; lo que no existe dice "Sin datos". |
| `/personas` | Tabla de personas con estado, dispositivo, últimas lecturas válidas y alertas abiertas. Permite agregar personas. |
| `/personas/:personId` | Detalle: datos de la persona (editar y eliminar), dispositivo asignado (asignar, cambiar o quitar), historial de pulso y SpO2, contactos de emergencia ("Contactos que serán notificados") e historial de alertas. |
| `/dispositivos` | Todos los dispositivos que conoce el servidor más los asignados que todavía no han reportado. |
| `/dispositivos/:deviceId` | Detalle: estado, último reporte, persona asignada, historial de pulso y SpO2, lecturas recientes y caídas. |
| `/alertas` | Diario de alertas con filtros por estado y tipo. Se pueden marcar como atendidas (con nota opcional) y como resueltas. |
| `/configuracion` | Ventana sin reporte, frecuencia de actualización, origen de los datos y borrado de datos locales. |

Pulso y SpO2 se presentan como señales de seguimiento, no como un diagnóstico.
Una lectura de `0` significa "sin lectura válida": nunca se dibuja ni se muestra
como valor. Por ahora el panel no avisa a nadie de una caída real.

Los botones **Simular caída** y **Simular ausencia** del Resumen eligen al azar a
una persona en verde (dispositivo en línea y sin alertas abiertas) o, si no hay
ninguna, a cualquier persona con dispositivo. Le muestran una alerta marcada como
simulación mientras dura el caso, hasta unos 90 s; después vuelve a su estado
anterior. Mientras tanto el backend reproduce en el grupo de Telegram un caso
con guion del agente simulado Soliker Bot: de caída (C01 a C09) o de desconexión e
inactividad (C10 a C12). La simulación no se guarda en ningún lado. En modo
demostración, o si el backend no tiene Telegram configurado, solo se ve en el panel
durante unos 25 s. Configuración del bot: `backend/README.md`.

La persona mayor no necesita operar este panel ni usar una aplicación para que
el dispositivo funcione.

## Datos: API y almacén local

Los datos del panel vienen de dos lugares.

**Del servidor (API de SoliCare, solo lectura):**

- `GET /api/v1/devices`: dispositivos, último reporte y últimos valores.
- `GET /api/v1/devices/:id/telemetry?limit=N`: lecturas de un dispositivo
  (el servidor permite hasta 500 por petición).
- `GET /api/v1/devices/:id/stats`: caídas del mes en curso (UTC), lecturas de
  las últimas 24 h y última caída; el movimiento llega como `null`. Si la
  petición falla, el panel muestra "Sin datos".

De ahí salen el estado de cada dispositivo (en línea, sin reporte reciente, sin
datos todavía), las lecturas y las caídas. El panel consulta al servidor cada
15 s por defecto y se detiene mientras la pestaña está oculta.

**Del almacén local (el navegador), porque el backend todavía no lo tiene:**

- personas, su relación y el dispositivo asignado;
- contactos de emergencia;
- el estado de las alertas (atendida, resuelta, notas) y un diario de las
  alertas observadas, para que el historial no se pierda cuando las lecturas
  salen de la ventana de la API;
- los ajustes: minutos sin reporte antes de avisar (30 por defecto) y segundos
  entre actualizaciones (15 por defecto).

Las alertas se derivan en el cliente: una lectura `caida` es una alerta de
caída, y un dispositivo sin reportes durante más de la ventana configurada es
una alerta de conexión. Esa lógica es una función pura (`src/data/alerts.ts`).

### Una sola interfaz para cambiar el almacén

Las vistas no leen `localStorage` ni llaman a `fetch`. Solo usan los hooks de
`src/data/hooks.tsx`, que se apoyan en dos interfaces:

- `TelemetrySource` (`src/data/api.ts`): `listDevices` y `listTelemetry`. La
  implementan el cliente HTTP y la simulación del modo demostración.
- `CareRepository` (`src/data/store.ts`): lectura sincrónica del estado
  (`getSnapshot`, `subscribe`) y escrituras asíncronas (personas, contactos,
  alertas, ajustes, `reset`). Las validaciones lanzan `StoreValidationError`
  con un mensaje en español y el campo al que pertenece.

Cuando el backend ofrezca personas, contactos y alertas, basta con escribir otra
implementación de `CareRepository` (por ejemplo, una que llame a la API) y
pasarla a `DataProvider` en `src/main.tsx`. Las vistas no cambian.

Otros módulos: `src/data/summary.ts` (personas y dispositivos ordenados por
urgencia), `src/data/polling.ts` (consulta periódica que se pausa con la pestaña
oculta) y `src/lib/` (funciones puras de tiempo, estado, lecturas y gráficos).

### Modo demostración

Con `VITE_DEMO_MODE=true` el panel usa datos simulados y deterministas, con la
misma forma que los de la API, en lugar del servidor. La interfaz lo indica con
la marca "Modo demostración" en la barra superior. Incluye personas, contactos,
una caída reciente, un dispositivo sin reporte y uno que nunca ha reportado.
Sin esa variable, la aplicación nunca muestra datos inventados.

No lo active en producción.

### Claves de `localStorage`

| Clave | Contenido |
| --- | --- |
| `solicare.care.v1` | Almacén local real (personas, contactos, alertas, diario, ajustes). |
| `solicare.demo.care.v1` | Lo mismo en modo demostración, separado para que las personas simuladas nunca se mezclen con las reales. |
| `solicare.demo.start` | Solo en modo demostración: instante de inicio de la simulación, para que recargar la página no cree una caída nueva cada vez. Se renueva pasadas 2 h. |
| `solicare.care.v1.corrupt-<marca de tiempo>` (y su equivalente demo) | Copia de un valor ilegible, que se conserva en vez de sobrescribirlo. |

Los datos locales solo existen en ese navegador. En Configuración, "Borrar datos
locales" los elimina (en modo demostración, vuelve a los datos de ejemplo); no
borra nada del servidor.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `VITE_API_URL` | URL pública del backend, sin barra final. Por defecto `http://localhost:8080`. |
| `VITE_DEMO_MODE` | `true` activa el modo demostración. Por defecto `false`. |

Hay un ejemplo en `.env.example`. `vercel.json` redirige todas las rutas a
`index.html`, de modo que los enlaces profundos (por ejemplo `/personas/abc`)
sobreviven a una recarga.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run test:e2e
```

Para probar sin backend: `VITE_DEMO_MODE=true npm run dev`.

## Pruebas

`npm run test:e2e` ejecuta Playwright (solo Chromium). Tiene tres proyectos:

- `unit`: funciones puras y el almacén local (`deriveAlerts`, `alertReferenceTime`, `parseCareData`, `assignDevice`, `timeAgo`, `deviceStatus`, `validVital`) como pruebas de Node, sin navegador (`e2e/unit/`).
- `demo`: recorre el panel en modo demostración (`e2e/demo/`): todas las rutas a 1280 px, 375 px y 360 px sin desplazamiento horizontal ni errores de consola, alta, edición y borrado de personas y contactos, atender una alerta con nota, cambiar un ajuste, recarga de enlaces profundos, teclado y foco, `prefers-reduced-motion` y `axe-core` en cada ruta.
- `unreachable`: el panel sin modo demostración y sin servidor, para comprobar el estado explícito de "no se pudo conectar" y que la consulta periódica se detiene con la pestaña oculta (`e2e/unreachable/`, el único proyecto cuyos datos viajan por HTTP y se pueden contar).

La configuración (`playwright.config.ts`) levanta sola dos servidores de Vite, en los puertos 5199 (demostración) y 5198 (sin servidor), y reutiliza uno que ya esté corriendo salvo en CI (`CI=true`).

La primera vez hay que descargar Chromium y tener sus librerías del sistema:

```bash
npx playwright install --with-deps chromium
```

`--with-deps` usa `apt` y necesita permisos de administrador. Si no los tiene, instale los paquetes de su distribución (en Debian o Ubuntu, por ejemplo, `libnss3` y `libnspr4`, además de los que pida `npx playwright install-deps chromium --dry-run`) y ejecute solo `npx playwright install chromium`.

Los informes y las trazas quedan en `test-results/` y `playwright-report/`, que Git ignora.
