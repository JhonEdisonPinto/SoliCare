# Backend

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

