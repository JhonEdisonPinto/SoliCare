# Decisiones iniciales de arquitectura

## Comunicación

La primera versión expone HTTPS para recibir el `POST` que ya produce el
dispositivo. La comunicación debe usar TLS y autenticación específica por
dispositivo. MQTT queda como una evolución posible si el consumo o la
conectividad del prototipo lo requieren.

## Tiempo y datos

El dispositivo no es fuente de tiempo para los registros. El backend asigna
`received_at` en UTC al recibir cada mensaje y conserva el payload validado.
Las lecturas con `spo2: 0` o `pulso: 0` significan que no hubo una lectura
válida y no deben interpretarse como valores clínicos.

## Alertas

Una caída se registra como evento prioritario. La notificación automática a los
contactos aún no existe; para la demostración, el botón «Simular caída» envía una
secuencia de prueba a un grupo de Telegram (ver `backend/README.md`). La falta de reportes se calcula en el backend,
porque el dispositivo puede perder conectividad y no puede notificarse a sí
mismo.

## Despliegue

El backend y la base de datos se alojarán en DigitalOcean. El frontend se
publicará en Vercel y consumirá únicamente la URL HTTPS pública de la API. Las
credenciales, claves de proveedores y tokens no se almacenan en el repositorio.
