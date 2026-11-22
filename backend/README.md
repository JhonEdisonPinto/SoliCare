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

## Simulación del agente Soliker Bot por Telegram

`POST /api/v1/simulation/fall` y `POST /api/v1/simulation/away`, con
`{ "personId": "..." }` (clave del panel), sortean según su peso un caso con guion
y lo reproducen mensaje por mensaje en el grupo de Telegram: `fall` elige entre
C01 y C09, y `away` entre C10 y C12 (desconexión o inactividad). Soliker Bot no es
una IA real y no se contacta a nadie fuera del grupo. Los mensajes salen cada
3,2 s para respetar el límite de Telegram de 20 por minuto en un grupo, así que un
caso dura hasta unos 90 s. No guarda nada y atiende una simulación a la vez (`409`
mientras otra está en curso). El panel las lanza con los botones **Simular caída**
y **Simular ausencia** del Resumen.

Los guiones, los pesos y los datos por defecto (edad, dirección y contactos que
falten) están en `src/services/simulationCases.ts`. El nombre de la persona y sus
tres primeros contactos con teléfono salen del panel.

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
