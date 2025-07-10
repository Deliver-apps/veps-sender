# WhatsApp Session Management

Scripts para manejar sesiones de WhatsApp con DigitalOcean Spaces.

## Scripts Disponibles

### 1. Subir Sesión Local (upload-session.js)

Convierte tu carpeta `session.json` local y la sube al servidor.

```bash
# Subir sesión al servidor local (hace backup automático)
node scripts/upload-session.js

# Subir sesión a servidor específico
node scripts/upload-session.js https://tu-servidor.com

# Subir sin hacer backup de la sesión actual
node scripts/upload-session.js https://tu-servidor.com false
```

### 2. Descargar/Backup Sesión (session-manager.js)

Gestiona sesiones remotas.

```bash
# Descargar la sesión más reciente
node scripts/session-manager.js download

# Descargar sesión específica
node scripts/session-manager.js download http://localhost:3000 "whatsapp-session-2025-01-10.zip"

# Crear backup de la sesión actual
node scripts/session-manager.js backup

# Crear backup en servidor específico
node scripts/session-manager.js backup https://tu-servidor.com
```

## Endpoints de API

### POST /uploadSession

Sube archivos de sesión al almacenamiento en la nube.

**Body:**
```json
{
  "sessionFiles": {
    "creds.json": "base64_content",
    "app-state-sync-key-XXXXX.json": "base64_content",
    "pre-key-XX.json": "base64_content"
  },
  "backupCurrent": true
}
```

**Response:**
```json
{
  "message": "Session uploaded successfully",
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

### POST /downloadSession

Descarga y extrae una sesión desde el almacenamiento.

**Body:**
```json
{
  "sessionFileName": "whatsapp-session-2025-01-10.zip"
}
```

**Response:**
```json
{
  "message": "Session downloaded successfully",
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

### POST /backupSession

Crea un backup de la sesión actual.

**Response:**
```json
{
  "message": "Session backed up successfully",
  "fileName": "whatsapp-session-backup-2025-01-10T12-00-00-000Z.zip",
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

## Flujo de Deploy Recomendado

1. **Pre-deploy**: Subir sesión actual
   ```bash
   node scripts/upload-session.js https://tu-servidor.com
   ```

2. **Durante deploy**: El servidor descarga automáticamente la sesión más reciente

3. **Post-deploy**: Verificar conexión y crear backup
   ```bash
   node scripts/session-manager.js backup https://tu-servidor.com
   ```

## Estructura de Archivos

```
session.json/
├── creds.json                     # Credenciales principales
├── app-state-sync-key-XXXXX.json  # Claves de sincronización
├── pre-key-XX.json               # Claves pre-compartidas
└── sender-key-XXXXX.json         # Claves de envío
```

## Consideraciones de Seguridad

- Los archivos se almacenan comprimidos en DigitalOcean Spaces
- Considera implementar cifrado adicional para datos sensibles
- Usa variables de entorno para credenciales
- Implementa rotación automática de backups

## Troubleshooting

### Error: "No session files found"
Asegúrate de que la carpeta `session.json` existe y contiene archivos.

### Error: "Failed to upload to DigitalOcean"
Verifica las credenciales de DigitalOcean Spaces en tu configuración.

### Error: "Session download failed"
Verifica que el archivo de sesión existe en el almacenamiento remoto.
