# Recomendaciones de seguridad

Lista corta y priorizada para el equipo. Describe qué protege hoy el panel, qué
no protege y qué conviene hacer, en orden. No es asesoría legal.

## Qué hay hoy

- Los datos de cuidado (personas, dispositivo asignado, contactos de emergencia,
  alertas atendidas, registro de alertas y ajustes) viven en el backend, en la
  tabla `care_data`, y solo se leen o escriben con la **clave del panel**
  (`Authorization: Bearer <clave>` en `GET` y `PUT /api/v1/care`).
- La clave es `PANEL_TOKEN`. Mientras `PANEL_TOKEN` no exista, el backend acepta
  `DEVICE_INGEST_TOKEN` en su lugar. Si no hay ninguno de los dos, en producción
  la ruta rechaza todo y en desarrollo deja pasar.
- El backend valida el documento y limita su tamaño: cuerpo de hasta 1 MiB, 100
  personas, 10 contactos por persona, 1000 eventos en el registro y 2000 alertas
  atendidas. Las escrituras llevan la versión en la que se basan; si otro panel
  guardó antes, el servidor responde 409 y nada se sobrescribe en silencio.

## Qué protege la clave y qué no

Protege los datos de cuidado frente a quien tenga solo la URL de la API. No
protege lo siguiente:

- Es **un secreto compartido**: no hay cuentas por persona ni roles. Quien tenga
  la clave ve y edita todo, y no queda registro de quién hizo qué.
- Se guarda en el `localStorage` del navegador. Un script malicioso en la página
  (XSS) o alguien con acceso al equipo puede leerla.
- Las lecturas de salud siguen abiertas (ver prioridad 2).
- Cambiar la clave en el servidor la invalida de inmediato: los paneles abiertos
  vuelven a pedirla en su siguiente petición.

## Prioridades

### 1. Rotar el token del dispositivo y poner un `PANEL_TOKEN` propio (ahora)

El `DEVICE_INGEST_TOKEN` se compartió por WhatsApp, así que hay que darlo por
conocido por más gente de la prevista. Hoy es también la clave del panel por el
respaldo. Pasos en DigitalOcean:

1. Generar dos valores distintos y largos, por ejemplo con
   `openssl rand -hex 32` (uno para el panel y otro para el dispositivo).
2. App Platform → la app de SoliCare → componente **backend** → **Settings** →
   **Environment Variables** → **Edit**.
3. Añadir `PANEL_TOKEN` con el primer valor y marcarla como **Encrypt** (secreta).
   Guardar. DigitalOcean vuelve a desplegar el backend.
4. Entregar la clave del panel por un canal que no deje copia permanente (en
   persona, gestor de contraseñas), no por WhatsApp. Cada navegador la pide una
   sola vez.
5. Con `PANEL_TOKEN` puesto, el token del dispositivo **deja de abrir el panel**.
   Esto ya protege los datos de cuidado aunque el token viejo se haya filtrado.
6. Rotar `DEVICE_INGEST_TOKEN` (mismo menú, valor nuevo, **Encrypt**) cuando se
   pueda reconfigurar el dispositivo.

Qué pasa con los dispositivos al rotar `DEVICE_INGEST_TOKEN`: el backend solo
acepta un token de ingesta a la vez. Desde que se despliega el valor nuevo, cada
dispositivo que siga enviando el viejo recibe 401 y **sus lecturas y caídas se
pierden** hasta que se actualice su configuración. Conviene hacerlo con el
dispositivo en mano: cambiar el valor en el firmware o la configuración y, justo
después, en DigitalOcean. Mejora sugerida: aceptar dos tokens de ingesta durante
la transición para no perder datos.

### 2. Exigir la clave del panel en las rutas de lectura abiertas

`GET /api/v1/devices`, `GET /api/v1/devices/:id/telemetry` y
`GET /api/v1/devices/:id/stats` no piden clave: cualquiera con la URL puede leer
SpO2, pulso y caídas de los dispositivos. Es el mayor hueco que queda. Siguiente
paso: protegerlas con la misma clave del panel (el frontend ya la guarda; solo
habría que enviarla también en esas peticiones) y mantener abierta únicamente la
ruta de ingesta, que usa su propio token.

### 3. Clave en `localStorage` y XSS

- Añadir una política de seguridad de contenido (CSP) en `frontend/vercel.json`
  que limite los scripts al propio origen; reduce el riesgo de XSS.
- No incluir scripts de terceros en el panel sin necesidad.
- Más adelante, sesiones de corta duración (token que expira) en lugar de una
  clave fija guardada, algo que llegará de forma natural con las cuentas de
  usuario (prioridad 8).

### 4. Solo HTTPS y CORS estricto

- El frontend y la API deben usarse solo por HTTPS (Vercel y DigitalOcean ya lo
  dan). No poner `http://` en `VITE_API_URL` en producción.
- `CORS_ORIGIN` en el backend debe ser exactamente el dominio de Vercel del panel
  (por ejemplo `https://solicare.vercel.app`), sin comodines ni `localhost`. El
  backend ya permite `PUT` y la cabecera `Authorization` solo para ese origen.

### 5. Límite de peticiones (rate limiting)

No hay límite de peticiones. Sin él, la clave del panel se puede probar por
fuerza bruta y la ingesta se puede inundar. Añadir `@fastify/rate-limit` con
límites bajos en `/api/v1/care` (por ejemplo 60 por minuto por IP, y mucho menos
para los intentos con clave incorrecta) y límites propios en
`/api/v1/telemetry`. Usar una clave larga y aleatoria también cuenta.

### 6. Límites de entrada y registros sin datos personales

- Mantener los límites de tamaño y de cantidad del documento (ya aplicados) y
  validar cualquier ruta nueva igual: tipo, rango y longitud.
- Los registros del backend (`logger: true`) no deben incluir nombres, teléfonos,
  notas ni el cuerpo de las peticiones de `/api/v1/care`, ni la cabecera
  `Authorization`. Si se añade más registro, anotar solo identificadores y
  códigos de estado.

### 7. Base de datos, copias de seguridad y datos de prueba

- La base de datos de DigitalOcean debe aceptar conexiones solo desde la app
  (**Trusted Sources**), con usuario propio para la app y la contraseña solo en
  `DATABASE_URL` como variable cifrada.
- Activar las copias de seguridad automáticas del clúster y probar una
  restauración. La tabla `care_data` guarda todo el documento en una sola fila:
  una escritura equivocada se recupera desde la copia, no desde la aplicación.
- Borrar los datos simulados (dispositivos `mock-%`) cuando ya no hagan falta. En
  la consola SQL de la base de datos:

  ```sql
  BEGIN;
  DELETE FROM telemetry WHERE device_id LIKE 'mock-%';
  DELETE FROM devices   WHERE device_id LIKE 'mock-%';
  COMMIT;
  ```

  Si alguna persona del panel tenía asignado un dispositivo `mock-...`, quitar la
  asignación desde el panel (Personas); esa parte vive en `care_data`.

### 8. Cuentas de usuario con roles y auditoría

El siguiente paso real: inicio de sesión por persona, con roles (familia: ve
solo a su persona; centro de control: ve a todas) y un registro de auditoría de
**quién atendió o resolvió cada alerta** y cuándo. Esto exige pasar el documento
único a tablas normalizadas (personas, contactos, alertas, usuarios) y sustituye
la clave compartida. Hasta entonces, la clave compartida es una protección
básica, no un control de acceso fino.

### 9. Datos personales (Ley 1581 de 2012)

El panel guarda datos personales y, en el caso de los signos vitales y las
caídas, datos de salud, que son datos sensibles. En Colombia aplica la Ley 1581
de 2012 (protección de datos personales) y su Decreto 1377 de 2013. Conviene
revisar con quien corresponda: autorización informada de cada persona o su
representante, finalidad y tiempo de conservación, política de tratamiento y
canal para consultar, corregir o eliminar datos, y el registro de bases de datos
ante la SIC si aplica. Esto es solo una referencia para empezar, no asesoría
legal.
