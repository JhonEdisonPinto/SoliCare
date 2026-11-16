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
