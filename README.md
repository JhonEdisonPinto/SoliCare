# SoliCare

SoliCare es una plataforma de teleasistencia IoT para adultos mayores que viven
solos o pasan parte del día sin acompañamiento. El sistema recibe señales del
dispositivo, registra el historial y avisa a la red de contactos cuando detecta
una caída u otro evento de riesgo.

> **Alcance:** el prototipo usa pulso y SpO2 como señales de seguimiento, no como
> mediciones diagnósticas. No reemplaza la atención médica ni la línea de
> emergencias.

## Arquitectura inicial

```text
Dispositivo ESP32
       |
       | HTTPS POST /api/v1/telemetry
       v
Backend API (DigitalOcean)
       |
       +--> PostgreSQL: dispositivos, lecturas, eventos y contactos
       +--> Servicio de notificaciones: SMS y central de control
       |
       v
Frontend web (Vercel)
       |
       +--> Estado del dispositivo e historial
       +--> Alertas y contactos de emergencia
```

La primera integración será por HTTP/HTTPS porque es el formato que ya entrega
el dispositivo. MQTT puede incorporarse después como adaptador de ingestión sin
modificar el modelo de datos ni el panel.

## Estructura del repositorio

```text
.
├── backend/              # API, reglas de alertas y persistencia
│   ├── src/
│   │   ├── config/       # Configuración validada por ambiente
│   │   ├── routes/       # Endpoints HTTP
│   │   ├── services/     # Ingestión, alertas y notificaciones
│   │   ├── db/           # Cliente y migraciones de base de datos
│   │   └── app.ts
│   └── README.md
├── frontend/             # Panel web para familiares y central
│   ├── src/
│   │   ├── app/          # Rutas y pantallas
│   │   ├── components/   # Componentes reutilizables
│   │   ├── lib/          # Cliente de API y utilidades
│   │   └── types/        # Tipos compartidos del frontend
│   └── README.md
├── docs/                 # Decisiones y documentación técnica
└── README.md
```

## Contrato de ingestión del dispositivo

El dispositivo envía un `POST` con `Content-Type: application/json` a la URL
pública configurada para la instalación:

```http
POST /api/v1/telemetry
Content-Type: application/json
Authorization: Bearer <DEVICE_INGEST_TOKEN>
```

```json
{
  "device_id": "proto-01",
  "tipo": "lectura",
  "spo2": 97,
  "pulso": 74
}
```

`tipo` puede ser:

- `lectura`: reporte periódico, previsto cada 30 segundos en la integración
  actual.
- `caida`: evento inmediato de caída.

Cuando no exista una lectura válida, `spo2` o `pulso` deben enviarse como `0`.
El dispositivo no envía la hora: el backend debe guardar la hora de recepción
en UTC. La respuesta debe ser `2xx` en menos de cinco segundos. Para evitar
reintentos ambiguos, la API deberá ser idempotente cuando se incorpore un
identificador de mensaje.

## Reglas funcionales

1. Guardar cada mensaje recibido con su hora de recepción y dispositivo.
2. Crear una alerta cuando `tipo` sea `caida` y notificar a los contactos
   registrados.
3. Detectar la ausencia de reportes de un dispositivo y avisar al cuidador
   según la política configurada (referencia inicial: 30 minutos).
4. Avisar por batería baja cuando el firmware incluya ese dato.
5. Mantener el historial disponible para el panel web.
6. Proteger los datos personales y limitar el acceso por usuario, cuidador y
   rol de central.

## Desarrollo local

Los comandos ejecutables se definirán en cada aplicación cuando se agreguen sus
dependencias. La configuración local debe partir de los archivos
`backend/.env.example` y `frontend/.env.example`; los archivos `.env` reales
no se versionan.

Para probar la integración se puede usar Postman o `curl` contra una URL pública
de desarrollo. `localhost` no es accesible desde el dispositivo fuera de la
red local.

## Despliegue previsto

- **Backend:** servicio web en DigitalOcean, con PostgreSQL administrado,
  variables de entorno y HTTPS.
- **Frontend:** aplicación web en Vercel, configurada con la URL pública del
  backend.
- **Notificaciones:** proveedor SMS configurable por variables de entorno; el
  informe técnico menciona Hablame como referencia, pero no se fija el
  proveedor en esta etapa.

Antes del piloto se deben definir la URL final, el esquema de autenticación del
dispositivo, el proveedor SMS, las migraciones de base de datos y la política
de retención de datos.

## Contexto del proyecto

El documento de referencia del proyecto es `Informe_E1.docx`. El hardware
descrito usa ESP32-C3, MPU6050 y MAX30102; también contempla una pre-alerta
local con vibración y botón para cancelar falsas alarmas. La plataforma no usa
cámaras ni rastrea la ubicación.

