# Backend

API de SoliCare construida con Fastify, TypeScript y PostgreSQL.

API de ingestión y servicios de teleasistencia de SoliCare.

## Responsabilidades

- Recibir y validar reportes de los dispositivos.
- Registrar lecturas y eventos con hora UTC del servidor.
- Aplicar las reglas de caída, desconexión y batería baja.
- Notificar a contactos y a la central de control.
- Exponer datos protegidos para el panel web.

## Organización

```text
src/
├── app.ts
├── config/
├── db/
├── routes/
├── services/
└── types/
```

La API debe responder rápidamente al dispositivo. Las notificaciones y tareas
de vigilancia deben ejecutarse de forma asíncrona para no bloquear la respuesta
de ingestión.

## Comandos

```bash
npm install
npm run build
npm start
```

## DigitalOcean App Platform

Configura `backend` como **Source directory**. App Platform detectará este
`package.json` y usará:

```text
Build command: npm run build
Run command: npm start
HTTP port: 8080
Health check path: /health
```

Agrega las variables de `backend/.env.example` en App Platform como secretos.

## Simulación de caídas por Telegram

`POST /api/v1/simulation/fall` con `{ "personId": "..." }` (clave del panel)
envía al grupo de Telegram la secuencia de una caída simulada: aviso, una
«📞 [LLAMADA ENTRANTE]» por cada contacto de emergencia con teléfono (máximo
tres; si no hay, a la central) y el mensaje de cierre a los 25 s. No guarda nada
y atiende una simulación a la vez (`409` mientras otra está en curso). El panel
la lanza con el botón **Simular caída** del Resumen.

Sin `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` la simulación sigue funcionando en
pantalla y no envía mensajes. Para activarla:

1. En Telegram, abre **@BotFather**, envía `/newbot`, elige un nombre y un
   usuario terminado en `bot`. Copia el token que devuelve: es un secreto.
2. Crea un grupo, por ejemplo «SoliCare alertas», y añade al bot como miembro.
   Escribe en el grupo `/start@<usuario_del_bot>`.
3. Abre en el navegador `https://api.telegram.org/bot<TOKEN>/getUpdates` y busca
   `"chat":{"id":-...` con el nombre del grupo. Ese número negativo, con el signo
   `-`, es el chat id.
   Si la respuesta sale vacía, saca al bot del grupo, vuelve a añadirlo y recarga.
4. Local: añade a `backend/.env`

   ```text
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_CHAT_ID=-100...
   ```

   y reinicia el backend.
5. DigitalOcean: en App Platform, componente `backend` → **Settings** →
   **Environment Variables**, añade las dos variables (marca el token como
   **Encrypt**) y guarda; la app se vuelve a desplegar.
6. Prueba: en el panel pulsa **Simular caída**. El aviso dice «revisa el grupo de
   Telegram» si salió bien, o explica qué faltó.

El token solo vive en el servidor: el navegador nunca lo recibe y no aparece en
los registros.
