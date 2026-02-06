import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import makeWASocket, {
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import {
  DisconnectReason,
  GroupMetadata,
} from '@whiskeysockets/baileys/lib/Types';
import { useMultiFileAuthState } from '@whiskeysockets/baileys/lib/Utils/use-multi-file-auth-state';
import { Boom } from '@hapi/boom';
import { AppService } from './app.service';
import { DigitalOceanService } from './digitalOcean.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { nowBA } from './time.helper';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private socket: ReturnType<typeof makeWASocket>;
  private sessionData: any;
  private SESSION_DIR: string = './session';
  private qrAttempts: number = 0;
  private maxQrAttempts: number = 2;
  private lastBackupTime: number = 0;
  private backupIntervalHours: number = 48;
  private isInitializing: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private downloadAttempts: number = 0;
  private maxDownloadAttempts: number = 3;
  private reconnectionAttempts: number = 0;
  private maxReconnectionAttempts: number = 3;
  // Circuit breaker para prevenir intentos infinitos
  private consecutiveFailures: number = 0;
  private maxFailures: number = 5;
  private circuitOpen: boolean = false;
  private circuitOpenUntil: number | null = null;
  // Rate limiting
  private messageTimestamps: number[] = [];
  private maxMessagesPerMinute: number = 20;
  // Validación de tamaño de archivo
  private readonly MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB para WhatsApp

  constructor(
    private appService: AppService,
    private digitalOceanService: DigitalOceanService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Evitar múltiples inicializaciones concurrentes usando promesa
    if (this.initializationPromise) {
      this.logger.log('⚠️ Ya hay una inicialización en progreso, esperando...');
      return this.initializationPromise;
    }

    // Crear nueva promesa de inicialización
    this.initializationPromise = this.initializeConnection();

    try {
      await this.initializationPromise;
    } catch (error) {
      // Error ya manejado en initializeConnection
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeConnection() {
    // Evitar múltiples inicializaciones concurrentes
    if (this.isInitializing) {
      this.logger.warn(
        '⚠️ Ya hay una inicialización en progreso, omitiendo...',
      );
      return;
    }

    this.isInitializing = true;

    try {
      // Cerrar socket existente si hay uno para evitar conflictos (error 440)
      if (this.socket) {
        this.logger.log(
          '🔄 Cerrando conexión existente antes de reinicializar...',
        );
        try {
          this.socket.end(undefined);
        } catch (e) {
          // Ignorar errores al cerrar
        }
        this.socket = null;
      }

      this.logger.log('🚀 Inicializando WhatsApp Service...');
      this.logger.debug('🔧 Environment:', {
        nodeEnv: process.env.NODE_ENV,
        isProduction:
          this.configService.get<string>('server.node_env') === 'production',
        sessionDir: this.SESSION_DIR,
      });

      // Verificar si ya existe una sesión local válida
      let hasValidLocalSession = false;
      try {
        await fs.access(this.SESSION_DIR);
        const files = await fs.readdir(this.SESSION_DIR);

        // Verificar que existan archivos de sesión válidos
        const hasCredsFile = files.includes('creds.json');
        const hasSessionFiles = files.some((file) =>
          file.startsWith('session-'),
        );

        if (hasCredsFile && hasSessionFiles) {
          console.log(
            '✅ Sesión local válida encontrada, no se descargará de la nube',
          );
          hasValidLocalSession = true;

          // Verificar que creds.json no esté vacío o corrupto
          try {
            const credsPath = path.join(this.SESSION_DIR, 'creds.json');
            const credsContent = await fs.readFile(credsPath, 'utf8');
            const creds = JSON.parse(credsContent);

            if (!creds.noiseKey || !creds.signedIdentityKey) {
              console.log('⚠️ Archivo creds.json incompleto');
              hasValidLocalSession = false;
            } else {
              console.log('✅ Archivo creds.json válido con claves necesarias');
            }
          } catch (error) {
            console.log('⚠️ Error leyendo creds.json:', error.message);
            hasValidLocalSession = false;
          }
        } else {
          console.log(
            '❌ Sesión local incompleta - creds.json:',
            hasCredsFile,
            'session files:',
            hasSessionFiles,
          );
        }
      } catch (error) {
        console.log('❌ No se encontró directorio de sesión local');
      }

      // Solo descargar si no hay sesión local válida y no hemos excedido los intentos
      if (
        !hasValidLocalSession &&
        this.downloadAttempts < this.maxDownloadAttempts
      ) {
        try {
          console.log(
            `📥 Intentando descargar sesión de la nube... (intento ${this.downloadAttempts + 1}/${this.maxDownloadAttempts})`,
          );
          this.downloadAttempts++;
          const downloadSuccess = await this.downloadLatestSession();
          if (downloadSuccess) {
            console.log('✅ Sesión descargada exitosamente de la nube');
            this.downloadAttempts = 0; // Reset contador al éxito
            hasValidLocalSession = true; // Marcar que ahora tenemos sesión válida
          } else {
            console.log(
              `❌ No se encontró sesión en la nube o falló la descarga (intento ${this.downloadAttempts}/${this.maxDownloadAttempts}), iniciando sesión nueva`,
            );
          }
        } catch (error) {
          console.log(
            `❌ Error al descargar sesión de la nube (intento ${this.downloadAttempts}/${this.maxDownloadAttempts}), iniciando sesión nueva`,
          );
        }
      } else if (this.downloadAttempts >= this.maxDownloadAttempts) {
        console.log(
          '❌ Máximo de intentos de descarga alcanzado, iniciando sesión nueva',
        );
      }

      // Si no hay sesión válida (ni local ni de la nube), limpiar completamente el directorio
      if (!hasValidLocalSession) {
        try {
          console.log(
            '🧹 Limpiando directorio de sesión para empezar de cero...',
          );
          await this.deleteSession();
          await fs.mkdir(this.SESSION_DIR, { recursive: true });
          console.log(
            '✅ Directorio de sesión limpiado, listo para generar nuevo QR',
          );
        } catch (error) {
          console.log('⚠️ Error limpiando sesión:', error.message);
        }
      }

      // Obtener versión más reciente de Baileys dinámicamente
      const { version } = await fetchLatestBaileysVersion();
      this.logger.log(`Using Baileys version ${version.join('.')}`);

      const { state, saveCreds } = await useMultiFileAuthState(
        this.SESSION_DIR,
      );

      // Logger personalizado para filtrar logs innecesarios de Baileys
      const customLogger = {
        level: 'silent' as const,
        trace: () => {},
        debug: () => {},
        info: (message: any, ...args: any[]) => {
          // Convertir message a string si no lo es
          const messageStr =
            typeof message === 'string' ? message : String(message || '');
          const importantMessages = [
            'connection',
            'qr',
            'creds',
            'error',
            'close',
            'open',
          ];
          if (
            importantMessages.some((keyword) =>
              messageStr.toLowerCase().includes(keyword),
            )
          ) {
            this.logger.log(`[Baileys] ${messageStr}`, ...args);
          }
        },
        warn: (message: any, ...args: any[]) => {
          // Convertir message a string si no lo es
          const messageStr =
            typeof message === 'string' ? message : String(message || '');
          if (
            !messageStr.includes('Session error') &&
            !messageStr.includes('Over 2000 messages') &&
            !messageStr.includes('No matching sessions')
          ) {
            this.logger.warn(`[Baileys] ${messageStr}`, ...args);
          }
        },
        error: (message: any, ...args: any[]) => {
          // Convertir message a string si no lo es
          const messageStr =
            typeof message === 'string' ? message : String(message || '');
          if (
            !messageStr.includes('Session error') &&
            !messageStr.includes('Over 2000 messages') &&
            !messageStr.includes('No matching sessions') &&
            !messageStr.includes('failed to decrypt') &&
            !messageStr.includes('transaction failed')
          ) {
            this.logger.error(`[Baileys] ${messageStr}`, ...args);
          }
        },
        fatal: (message: string, ...args: any[]) => {
          this.logger.error(`[Baileys FATAL] ${message}`, ...args);
        },
        child: () => customLogger,
      };

      // Configuración de Baileys siguiendo la documentación de referencia
      this.socket = makeWASocket({
        version, // Versión más reciente obtenida dinámicamente
        auth: state, // Estado de autenticación persistente
        printQRInTerminal: false, // QR se muestra en web, no en terminal
        markOnlineOnConnect: false, // No marca como "online" al conectar
        syncFullHistory: false, // No sincroniza historial completo
        shouldSyncHistoryMessage: () => false, // Rechaza sincronizar mensajes antiguos
        browser: ['Estudio Contable', 'Desktop', '1.0.0'], // Identificador del bot
        logger: customLogger, // Logger personalizado para filtrar logs innecesarios
        // Configuraciones adicionales para estabilidad y rendimiento
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 2000,
        qrTimeout: 60000,
        generateHighQualityLinkPreview: false,
        getMessage: async () => {
          // Devolver undefined para evitar queries innecesarias
          return undefined;
        },
      });

      // Gestión de autenticación: guardar credenciales automáticamente
      // Con backup a la nube para este bot específico
      this.socket.ev.on('creds.update', async () => {
        try {
          await fs.mkdir(this.SESSION_DIR, { recursive: true });
          await saveCreds();

          // Auto-backup to cloud (funcionalidad específica de este bot)
          if (
            this.configService.get<string>('server.node_env') === 'production'
          ) {
            try {
              await this.autoBackupToCloud();
            } catch (error) {
              this.logger.warn('Auto-backup failed:', error);
            }
          }
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Error saving credentials: ${err.message}`);
          // Intentar recrear el directorio si no existe
          try {
            await fs.mkdir(this.SESSION_DIR, { recursive: true });
            await saveCreds();
          } catch (retryError) {
            const retryErr = retryError as Error;
            this.logger.error(
              `Failed to save credentials after retry: ${retryErr.message}`,
            );
          }
        }
      });

      // Manejo de eventos de conexión siguiendo la documentación de referencia
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Generar QR code para autenticación
        if (qr) {
          this.appService.setQrCode(qr);
          // Solo incrementar si no hemos alcanzado el máximo
          if (this.qrAttempts < this.maxQrAttempts) {
            this.qrAttempts++;
          }
          this.logger.log(
            `QR code generated (attempt ${this.qrAttempts}/${this.maxQrAttempts})`,
          );
        }

        // Estado: connecting
        if (connection === 'connecting') {
          this.logger.log('Connecting to WhatsApp...');
        }

        // Estado: open - Conexión establecida exitosamente
        if (connection === 'open') {
          this.logger.log('WhatsApp connected successfully');
          this.qrAttempts = 0;
          this.downloadAttempts = 0;
          this.reconnectionAttempts = 0;

          // Marcar como "unavailable" para no aparecer como "en línea"
          // Esto evita que los mensajes no suenen en el celular
          if (this.socket) {
            try {
              await this.socket.sendPresenceUpdate('unavailable');
              this.logger.log(
                'Marked as unavailable to prevent "online" status',
              );
            } catch (error) {
              const err = error as Error;
              this.logger.warn(
                `Could not set presence to unavailable: ${err.message}`,
              );
            }
          }

          this.logger.log('Bot is ready to send messages');

          // Backup session when successfully connected (funcionalidad específica de este bot)
          if (
            this.configService.get<string>('server.node_env') === 'production'
          ) {
            this.autoBackupToCloud().catch((err) => {
              this.logger.warn('Auto-backup failed:', err);
            });
          }
        }

        // Estado: close - Conexión cerrada o perdida
        if (connection === 'close') {
          const error = lastDisconnect?.error as Boom | undefined;
          const statusCode = error?.output?.statusCode;
          const errorMessage = error?.message || '';
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          // Log detallado del error
          this.logger.log(
            `Connection closed - StatusCode: ${statusCode}, Message: ${errorMessage}`,
          );

          // Log específico para errores comunes al escanear QR
          if (statusCode === DisconnectReason.badSession) {
            this.logger.error(
              '❌ Error: Sesión inválida. Por favor, escanea el QR nuevamente o limpia la sesión.',
            );
            this.appService.setQrCode(''); // Limpiar QR actual
          } else if (statusCode === DisconnectReason.connectionClosed) {
            this.logger.warn(
              '⚠️ Conexión cerrada por el servidor. Intentando reconectar...',
            );
          } else if (statusCode === DisconnectReason.connectionLost) {
            this.logger.warn('⚠️ Conexión perdida. Intentando reconectar...');
          } else if (statusCode === DisconnectReason.timedOut) {
            this.logger.warn(
              '⚠️ Timeout de conexión. Intentando reconectar...',
            );
          } else if (statusCode === 440) {
            // Error de conflicto - otra sesión activa
            this.logger.warn(
              '⚠️ Conflicto de sesión (440) - otra instancia está conectada. Esperando antes de reconectar...',
            );
            // En caso de conflicto, esperar más tiempo y verificar si ya hay conexión antes de reconectar
            setTimeout(() => {
              // Si ya hay una conexión activa, no intentar reconectar
              if (this.isConnected()) {
                this.logger.log(
                  '✅ Ya hay una conexión activa, no se requiere reconexión',
                );
                this.reconnectionAttempts = 0; // Resetear contador si hay conexión
                return;
              }
              // Solo reconectar si no hay conexión activa
              if (
                !this.isInitializing &&
                this.reconnectionAttempts < this.maxReconnectionAttempts
              ) {
                this.reconnectionAttempts++;
                this.logger.log(
                  `Reconnecting after conflict... (attempt ${this.reconnectionAttempts}/${this.maxReconnectionAttempts})`,
                );
                this.onModuleInit().catch((err) => {
                  this.logger.error(
                    'Error during reconnection after conflict:',
                    err.message,
                  );
                });
              }
            }, 60000); // Esperar 60 segundos en caso de conflicto
            return; // No continuar con la lógica de reconexión normal
          }

          if (shouldReconnect) {
            // Reconectar automáticamente si no fue logout
            if (this.reconnectionAttempts < this.maxReconnectionAttempts) {
              this.reconnectionAttempts++;
              const delay = 5000; // 5 segundos para reconexiones normales
              this.logger.log(
                `Reconnecting... (attempt ${this.reconnectionAttempts}/${this.maxReconnectionAttempts}) in ${delay / 1000}s`,
              );
              setTimeout(() => {
                if (!this.isInitializing) {
                  this.onModuleInit();
                } else {
                  this.logger.warn(
                    'Initialization already in progress, skipping reconnection...',
                  );
                }
              }, delay);
            } else {
              this.logger.error(
                'Maximum reconnection attempts reached. Manual intervention required.',
              );
            }
          } else {
            this.logger.log(
              'Connection closed (logged out). Manual reconnection required.',
            );
            this.appService.setQrCode(''); // Limpiar QR cuando se hace logout
          }
        }
      });

      // Configurar manejador global para errores de sesión (una sola vez)
      if (
        !process
          .listeners('unhandledRejection')
          .some((listener: any) =>
            listener.toString().includes('Session error'),
          )
      ) {
        process.on('unhandledRejection', (reason, promise) => {
          if (reason && typeof reason === 'object' && 'message' in reason) {
            const errorMessage = String((reason as any).message || '');
            const errorName = String((reason as any).name || '');

            // Ignorar errores de sesión conocidos (son normales del protocolo Signal)
            const sessionErrors = [
              'Over 2000 messages into the future',
              'SessionError',
              'No matching sessions found',
              'Invalid PreKey ID',
              'failed to decrypt message',
              'transaction failed',
            ];

            const isSessionError = sessionErrors.some(
              (err) => errorMessage.includes(err) || errorName.includes(err),
            );

            if (isSessionError) {
              // No loguear estos errores, son normales del protocolo Signal
              return;
            }
          }

          // Para otros errores, dejarlos pasar (se loguearán normalmente)
        });
      }

      // Este bot solo envía mensajes, no procesa mensajes entrantes
      // Por lo tanto, no necesitamos manejar 'messages.upsert'
      // Se mantiene solo para logging/debugging si es necesario

      // Marcar inicialización como completada
      this.isInitializing = false;
      this.logger.log('✅ WhatsApp Service inicializado correctamente');
    } catch (error) {
      this.logger.error(
        '❌ Error durante la inicialización de WhatsApp Service:',
        error,
      );
      this.isInitializing = false; // Reset flag en caso de error
      throw error;
    }
  }

  /**
   * Verifica y actualiza el circuit breaker
   */
  private checkCircuitBreaker(): void {
    if (this.circuitOpen) {
      if (this.circuitOpenUntil && Date.now() < this.circuitOpenUntil) {
        const waitTime = Math.ceil((this.circuitOpenUntil - Date.now()) / 1000);
        throw new Error(
          `Circuit breaker is open. WhatsApp service temporarily unavailable. Retry in ${waitTime}s.`,
        );
      }
      // Tiempo de recuperación pasado, intentar cerrar circuito
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = null;
      this.logger.log('🔄 Circuit breaker closed. Attempting to reconnect...');
    }
  }

  /**
   * Registra un éxito y resetea el circuit breaker
   */
  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.circuitOpen) {
      this.circuitOpen = false;
      this.circuitOpenUntil = null;
      this.logger.log('✅ Circuit breaker closed after successful operation');
    }
  }

  /**
   * Registra un fallo y abre el circuit breaker si es necesario
   */
  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxFailures) {
      this.circuitOpen = true;
      this.circuitOpenUntil = Date.now() + 5 * 60 * 1000; // 5 minutos
      this.logger.error(
        `🔴 Circuit breaker opened after ${this.consecutiveFailures} consecutive failures. Will retry in 5 minutes.`,
      );
    }
  }

  /**
   * Verifica y aplica rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Limpiar timestamps antiguos
    this.messageTimestamps = this.messageTimestamps.filter(
      (ts) => ts > oneMinuteAgo,
    );

    if (this.messageTimestamps.length >= this.maxMessagesPerMinute) {
      const oldestTimestamp = this.messageTimestamps[0];
      const waitTime = 60000 - (now - oldestTimestamp) + 1000; // +1s de margen
      this.logger.warn(
        `⏳ Rate limit alcanzado (${this.messageTimestamps.length}/${this.maxMessagesPerMinute}). Esperando ${Math.ceil(waitTime / 1000)}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      // Limpiar después de esperar
      this.messageTimestamps = this.messageTimestamps.filter((ts) => ts > now);
    }

    this.messageTimestamps.push(now);
  }

  async sendMessageVep(
    jid: string,
    text: string,
    fileName: string,
    archive: Buffer,
    media?: string,
    isGroup?: boolean,
  ) {
    // Convertir \n literales a saltos de línea reales
    text = text.replace(/\\n/g, '\n');

    // Verificar circuit breaker
    this.checkCircuitBreaker();

    // Verificar rate limiting
    await this.checkRateLimit();

    // Validar tamaño de archivo
    if (archive.length > this.MAX_FILE_SIZE) {
      const sizeMB = (archive.length / (1024 * 1024)).toFixed(2);
      const error = new Error(
        `Archivo ${fileName} excede el tamaño máximo permitido (${sizeMB}MB > 16MB). WhatsApp no permite archivos mayores a 16MB.`,
      );
      this.recordFailure();
      throw error;
    }

    // Formatear JID correctamente, evitando duplicados
    let jid_final: string;
    if (jid.includes('@')) {
      // Si ya tiene @, usar tal cual (pero limpiar duplicados si existen)
      jid_final = jid;
      if (jid_final.includes('@s.whatsapp.net@s.whatsapp.net')) {
        jid_final = jid_final.replace(
          '@s.whatsapp.net@s.whatsapp.net',
          '@s.whatsapp.net',
        );
      }
      if (jid_final.includes('@g.us@g.us')) {
        jid_final = jid_final.replace('@g.us@g.us', '@g.us');
      }
    } else {
      // Si no tiene @, agregarlo según el tipo
      jid_final = isGroup ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
    }

    const maxRetries = 3;
    const timeoutMs = 45000; // 45 segundos para archivos (más tiempo que texto)

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verificar conexión antes de cada intento
        if (!this.isConnected()) {
          this.logger.warn(
            `⚠️ WhatsApp no está conectado, esperando reconexión... (attempt ${attempt}/${maxRetries})`,
          );
          // Esperar hasta 30 segundos para que se reconecte
          await this.waitForConnection(30000);
          if (!this.isConnected()) {
            throw new Error('WhatsApp not connected after waiting');
          }
        }

        this.logger.log(
          `📤 Sending ${media || 'text'} message (attempt ${attempt}/${maxRetries}) to ${jid_final}`,
        );

        let sendPromise: Promise<any>;

        switch (media) {
          case 'document':
            sendPromise = this.socket.sendMessage(jid_final, {
              document: archive,
              fileName: fileName ? fileName : 'nuevo_pdf.pdf',
              mimetype: 'application/pdf',
              caption: text,
            });
            break;
          case 'image':
            sendPromise = this.socket.sendMessage(jid_final, {
              image: archive,
              caption: text,
            });
            break;
          case 'video':
            sendPromise = this.socket.sendMessage(jid_final, {
              video: archive,
              caption: text,
            });
            break;
          case 'audio':
            sendPromise = this.socket.sendMessage(jid_final, {
              audio: archive,
              mimetype: 'audio/mpeg',
            });
            break;
          default:
            sendPromise = this.socket.sendMessage(jid_final, { text });
            break;
        }

        // Aplicar timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Message send timeout')),
            timeoutMs,
          );
        });

        await Promise.race([sendPromise, timeoutPromise]);

        this.logger.log(
          `✅ ${media || 'text'} message sent successfully to ${jid_final}`,
        );

        // Registrar éxito en circuit breaker
        this.recordSuccess();

        return; // Éxito, salir del loop
      } catch (error) {
        const err = error as Error;
        const isConnectionError =
          err.message.includes('Connection Closed') ||
          err.message.includes('Connection closed') ||
          err.message.includes('WhatsApp not connected') ||
          err.message.includes('not connected');

        this.logger.error(
          `❌ Error sending ${media || 'text'} message (attempt ${attempt}/${maxRetries}):`,
          err.message,
        );

        // Si es error de conexión, esperar a que se reconecte
        if (isConnectionError && attempt < maxRetries) {
          this.logger.warn(
            '⚠️ Conexión perdida durante el envío, esperando reconexión...',
          );
          await this.waitForConnection(30000);
        }

        // Si es el último intento, registrar fallo y lanzar el error
        if (attempt === maxRetries) {
          this.recordFailure();
          throw new Error(
            `Failed to send ${media || 'text'} message after ${maxRetries} attempts: ${err.message}`,
          );
        }

        // Esperar antes del siguiente intento (backoff exponencial)
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // Max 10 segundos para archivos
        this.logger.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Nuevo método para múltiples archivos
  async sendMultipleFiles(
    jid: string,
    text: string,
    files: Array<{
      archive: Buffer;
      fileName: string;
      media: string;
      mimetype?: string;
    }>,
    isGroup?: boolean,
  ) {
    const jid_final = isGroup ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;

    // Enviar mensaje de texto primero si existe
    if (text) {
      await this.socket.sendMessage(jid_final, { text });
    }

    // Enviar archivos consecutivamente
    for (const file of files) {
      try {
        switch (file.media) {
          case 'document':
            await this.socket.sendMessage(jid_final, {
              document: file.archive,
              fileName: file.fileName || 'archivo.pdf',
              mimetype: file.mimetype || 'application/pdf',
            });
            break;
          case 'image':
            await this.socket.sendMessage(jid_final, {
              image: file.archive,
            });
            break;
          case 'video':
            await this.socket.sendMessage(jid_final, {
              video: file.archive,
              mimetype: file.mimetype || 'video/mp4',
            });
            break;
          case 'audio':
            await this.socket.sendMessage(jid_final, {
              audio: file.archive,
              mimetype: file.mimetype || 'audio/mp3',
            });
            break;
          default:
            console.warn(`Tipo de archivo no soportado: ${file.media}`);
            break;
        }

        // Pequeña pausa entre archivos para evitar spam
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error enviando archivo ${file.fileName}:`, error);
        // Continuar con el siguiente archivo
      }
    }
  }

  // Método para enviar múltiples documentos específicamente
  async sendMultipleDocuments(
    jid: string,
    text: string,
    documents: Array<{
      archive: Buffer;
      fileName: string;
      mimetype?: string;
    }>,
    isGroup?: boolean,
  ) {
    const files = documents.map((doc) => ({
      ...doc,
      media: 'document' as const,
      mimetype: doc.mimetype || 'application/pdf',
    }));

    return this.sendMultipleFiles(jid, text, files, isGroup);
  }

  async uploadSession(sessionFiles: {
    [fileName: string]: string;
  }): Promise<void> {
    try {
      // Crear un ZIP con todos los archivos de sesión
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      // Agregar cada archivo de sesión al ZIP
      for (const [fileName, fileContent] of Object.entries(sessionFiles)) {
        const buffer = Buffer.from(fileContent, 'base64');
        zip.addFile(fileName, buffer);
      }

      const zipBuffer = zip.toBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipFileName = `whatsapp-session-${timestamp}.zip`;

      // Subir el ZIP a DigitalOcean Spaces
      await this.digitalOceanService.uploadFile(zipFileName, zipBuffer);

      console.log(`Session uploaded successfully as ${zipFileName}`);
    } catch (error) {
      console.error('Error uploading session:', error);
      throw error;
    }
  }

  async deleteSession(): Promise<void> {
    try {
      const sessionDirPath = this.SESSION_DIR; // './session'

      // Usar fs.rm con recursive y force para manejar tanto archivos como directorios
      await fs.rm(sessionDirPath, {
        recursive: true, // Elimina directorios recursivamente
        force: true, // No falla si el archivo/directorio no existe
      });

      console.log(`Session ${this.SESSION_DIR} deleted successfully`);
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  /**
   * Limpia sesiones problemáticas que causan desincronización
   * Elimina archivos de sesión específicos pero mantiene creds.json
   */
  async clearProblematicSessions(): Promise<void> {
    try {
      console.log(
        '🧹 Limpiando sesiones problemáticas para eliminar desincronización...',
      );

      const sessionDirPath = this.SESSION_DIR;

      try {
        await fs.access(sessionDirPath);
        const files = await fs.readdir(sessionDirPath);

        // Eliminar solo archivos de sesión (session-*), mantener creds.json
        for (const file of files) {
          if (
            file.startsWith('session-') ||
            file.startsWith('pre-key-') ||
            file.startsWith('sender-key-') ||
            file.startsWith('app-state-sync-key-')
          ) {
            const filePath = path.join(sessionDirPath, file);
            try {
              await fs.unlink(filePath);
              console.log(
                `✅ Eliminado archivo de sesión problemático: ${file}`,
              );
            } catch (error) {
              console.warn(`⚠️ No se pudo eliminar ${file}:`, error.message);
            }
          }
        }

        console.log(
          '✅ Sesiones problemáticas limpiadas. Se mantiene creds.json para reconexión rápida.',
        );
        console.log(
          '💡 La próxima vez que se conecte, se regenerarán las sesiones limpias.',
        );
      } catch (error) {
        console.log(
          '⚠️ No se encontró directorio de sesión, no hay nada que limpiar',
        );
      }
    } catch (error) {
      console.error('❌ Error limpiando sesiones problemáticas:', error);
      throw error;
    }
  }

  /**
   * Limpia completamente la sesión y fuerza nueva autenticación
   */
  async clearSessionAndReconnect(): Promise<void> {
    try {
      console.log('🧹 Limpiando sesión completa y forzando reconexión...');

      // Cerrar socket actual si existe
      if (this.socket) {
        try {
          await this.socket.logout();
        } catch (error) {
          console.warn('⚠️ Error al cerrar socket:', error.message);
        }
      }

      // Eliminar toda la sesión
      await this.deleteSession();

      // Recrear directorio
      await fs.mkdir(this.SESSION_DIR, { recursive: true });

      // Resetear contadores
      this.qrAttempts = 0;
      this.reconnectionAttempts = 0;
      this.downloadAttempts = 0;
      this.isInitializing = false;

      console.log('✅ Sesión limpiada completamente. Reiniciando conexión...');

      // Reinicializar
      await this.onModuleInit();

      console.log(
        '✅ Reconexión iniciada. Usa /qr-code para obtener el nuevo QR.',
      );
    } catch (error) {
      console.error('❌ Error en clearSessionAndReconnect:', error);
      throw error;
    }
  }

  async downloadSession(sessionFileName?: string): Promise<void> {
    try {
      // Si no se especifica un archivo, buscar el más reciente
      if (!sessionFileName) {
        // Aquí deberías implementar lógica para listar archivos y encontrar el más reciente
        sessionFileName = 'whatsapp-session-latest.zip';
      }

      const sessionZip =
        await this.digitalOceanService.getFile(sessionFileName);

      // Extraer ZIP localmente
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(sessionZip);

      // Crear directorio de sesión si no existe
      await fs.mkdir('./session', { recursive: true });

      // Extraer todos los archivos
      zip.extractAllTo('./session/', true);

      console.log('Session downloaded and extracted successfully');
    } catch (error) {
      console.error('Error downloading session:', error);
      throw error;
    }
  }

  async backupCurrentSession(): Promise<string> {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      // Archivos esenciales para restaurar la sesión
      // Las pre-keys se regeneran automáticamente, no es necesario hacer backup
      const essentialFilePatterns = [
        'creds.json', // ESENCIAL: credenciales principales
        'app-state-sync-key-', // Claves de sincronización de estado
        // NO incluir: pre-key-*, sender-key-*, session-* (se regeneran automáticamente)
      ];

      const sessionDir = './session';
      const files = await fs.readdir(sessionDir);
      let addedCount = 0;
      let skippedCount = 0;

      for (const file of files) {
        const filePath = path.join(sessionDir, file);
        const fileStats = await fs.stat(filePath);

        if (fileStats.isFile()) {
          // Solo incluir archivos esenciales
          const isEssential = essentialFilePatterns.some(
            (pattern) => file === pattern || file.startsWith(pattern),
          );

          if (isEssential) {
            const fileContent = await fs.readFile(filePath);
            zip.addFile(file, fileContent);
            addedCount++;
          } else {
            skippedCount++;
            // Las pre-keys, sender-keys y sessions se regeneran automáticamente
          }
        }
      }

      const zipBuffer = zip.toBuffer();
      const zipFileName = 'whatsapp-session-latest.zip';

      await this.digitalOceanService.uploadFile(zipFileName, zipBuffer);

      this.logger.log(
        `✅ Session backed up successfully as ${zipFileName} (${addedCount} archivos esenciales, ${skippedCount} omitidos)`,
      );
      return zipFileName;
    } catch (error) {
      this.logger.error('Error backing up session:', error);
      throw error;
    }
  }

  private async downloadLatestSession(): Promise<boolean> {
    try {
      console.log('🔄 Descargando sesión desde DigitalOcean...');
      // Intentar descargar la sesión más reciente
      await this.downloadSession();
      console.log('✅ Sesión descargada y extraída exitosamente');
      return true;
    } catch (error) {
      console.log('❌ No se encontró sesión en la nube o falló la descarga');
      // Retornar false en lugar de lanzar error para que el llamador pueda decidir
      return false;
    }
  }

  /**
   * Verifica si es necesario hacer backup (cada 4 horas)
   */
  private shouldBackup(): boolean {
    const now = Date.now();
    const timeSinceLastBackup = now - this.lastBackupTime;
    const intervalMs = this.backupIntervalHours * 60 * 60 * 1000; // 48 horas en ms

    return timeSinceLastBackup >= intervalMs;
  }

  private async autoBackupToCloud(): Promise<void> {
    // Solo hacer backup si han pasado 48 horas
    if (!this.shouldBackup()) {
      // No loguear nada para evitar spam en los logs
      return;
    }

    try {
      console.log('🔄 Starting scheduled auto-backup to cloud...');

      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      const sessionDir = './session';

      // Archivos esenciales para restaurar la sesión
      // Las pre-keys se regeneran automáticamente, no es necesario hacer backup
      const essentialFilePatterns = [
        'creds.json', // ESENCIAL: credenciales principales
        'app-state-sync-key-', // Claves de sincronización de estado
        // NO incluir: pre-key-*, sender-key-*, session-* (se regeneran automáticamente)
      ];

      try {
        const files = await fs.readdir(sessionDir);
        let addedCount = 0;
        let skippedCount = 0;

        for (const file of files) {
          const filePath = path.join(sessionDir, file);
          try {
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              // Solo incluir archivos esenciales
              const isEssential = essentialFilePatterns.some(
                (pattern) => file === pattern || file.startsWith(pattern),
              );

              if (isEssential) {
                const fileContent = await fs.readFile(filePath);
                zip.addFile(file, fileContent);
                addedCount++;
                // Solo loguear creds.json para no saturar logs
                if (file === 'creds.json') {
                  this.logger.log(`✅ Added ${file} to backup`);
                }
              } else {
                skippedCount++;
                // Las pre-keys, sender-keys y sessions se regeneran automáticamente
              }
            }
          } catch (error) {
            this.logger.warn(
              `Could not process ${file} for backup:`,
              error.message,
            );
          }
        }

        this.logger.log(
          `📦 Backup: ${addedCount} archivos esenciales, ${skippedCount} archivos omitidos (pre-keys/sessions se regeneran automáticamente)`,
        );
      } catch (error) {
        this.logger.warn('Could not read session directory:', error.message);
        // Fallback: solo creds.json si no se puede leer el directorio
        const credsPath = path.join(sessionDir, 'creds.json');
        try {
          const fileContent = await fs.readFile(credsPath);
          zip.addFile('creds.json', fileContent);
          this.logger.log('✅ Added creds.json to backup (fallback)');
        } catch (error) {
          this.logger.warn(
            'Could not add creds.json to backup:',
            error.message,
          );
        }
      }

      const zipBuffer = zip.toBuffer();

      // Guardar siempre como el mismo archivo en la raíz del bucket
      await this.digitalOceanService.uploadFile(
        'whatsapp-session-latest.zip',
        zipBuffer,
      );

      // Actualizar timestamp del último backup
      this.lastBackupTime = Date.now();

      this.logger.log('✅ Auto-backup to cloud completed successfully');
    } catch (error) {
      this.logger.error('❌ Auto-backup to cloud failed:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Envía un mensaje de texto simple (para pruebas) con retry logic
   */
  async sendSimpleTextMessage(jid: string, text: string): Promise<void> {
    // Convertir \n literales a saltos de línea reales
    text = text.replace(/\\n/g, '\n');

    // Verificar circuit breaker
    this.checkCircuitBreaker();

    // Verificar rate limiting
    await this.checkRateLimit();

    const maxRetries = 3;
    const timeoutMs = 30000; // 30 segundos

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Verificar conexión antes de cada intento
        if (!this.isConnected()) {
          throw new Error('WhatsApp not connected');
        }

        this.logger.log(
          `📤 Sending message (attempt ${attempt}/${maxRetries}) to ${jid}`,
        );

        // Crear promise con timeout
        const sendPromise = this.socket.sendMessage(jid, { text });
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Message send timeout')),
            timeoutMs,
          );
        });

        await Promise.race([sendPromise, timeoutPromise]);

        this.logger.log(`✅ Test message sent successfully to ${jid}: ${text}`);

        // Registrar éxito en circuit breaker
        this.recordSuccess();

        return; // Éxito, salir del loop
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `❌ Error sending test message (attempt ${attempt}/${maxRetries}):`,
          err.message,
        );

        // Si es error de conexión cerrada, no reintentar
        if (
          err.message.includes('Connection Closed') ||
          err.message.includes('WhatsApp not connected')
        ) {
          this.logger.error('🚫 Connection lost, cannot retry message sending');
          this.recordFailure();
          throw new Error(`Connection lost: ${err.message}`);
        }

        // Si es el último intento, registrar fallo y lanzar el error
        if (attempt === maxRetries) {
          this.recordFailure();
          throw new Error(
            `Failed to send message after ${maxRetries} attempts: ${err.message}`,
          );
        }

        // Esperar antes del siguiente intento (backoff exponencial)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 segundos
        this.logger.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Verifica si WhatsApp está conectado
   */
  isConnected(): boolean {
    try {
      const connected =
        this.socket &&
        this.socket.user !== null &&
        this.socket.user !== undefined;

      // Solo loguear detalles en desarrollo
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug('🔍 isConnected detailed check:', {
          hasSocket: !!this.socket,
          hasUser: !!this.socket?.user,
          userId: this.socket?.user?.id,
          socketState: this.socket?.user
            ? 'authenticated'
            : 'not authenticated',
          wsReadyState: (this.socket?.ws as any)?.readyState,
          isInitializing: this.isInitializing,
          qrAttempts: this.qrAttempts,
          maxQrAttempts: this.maxQrAttempts,
          connected,
        });
      }

      return connected;
    } catch (error) {
      const err = error as Error;
      this.logger.error('❌ Error checking connection:', err.message);
      return false;
    }
  }

  /**
   * Obtiene el estado de la conexión
   */
  getConnectionStatus(): { connected: boolean; user?: any } {
    return {
      connected: this.isConnected(),
      user: this.socket?.user || null,
    };
  }

  /**
   * Espera a que la conexión se establezca (hasta un máximo de tiempo)
   */
  private async waitForConnection(maxWaitMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000; // Verificar cada segundo

    while (Date.now() - startTime < maxWaitMs) {
      if (this.isConnected()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    return this.isConnected();
  }

  /**
   * Obtiene la lista de grupos de WhatsApp
   */
  async getGroups(): Promise<
    Array<{ id: string; name: string; participantsCount: number }>
  > {
    try {
      if (!this.isConnected()) {
        throw new Error('WhatsApp not connected');
      }

      console.log('👥 Fetching WhatsApp groups...');

      // Obtener grupos usando Baileys
      const groups = await this.socket.groupFetchAllParticipating();

      // Formatear la respuesta
      const formattedGroups = Object.values(groups).map(
        (group: GroupMetadata) => ({
          id: group.id,
          name: group.subject || 'Sin nombre',
          participantsCount: group.participants ? group.participants.length : 0,
        }),
      );

      console.log(`✅ Found ${formattedGroups.length} groups`);
      return formattedGroups;
    } catch (error) {
      console.error('❌ Error getting groups:', error.message);
      throw new Error(`Failed to get groups: ${error.message}`);
    }
  }

  /**
   * Reinicializa WhatsApp manualmente (para debugging)
   */
  async forceReinitialization(): Promise<void> {
    console.log('🔄 Forzando reinicialización de WhatsApp...');

    try {
      // Resetear flags
      this.isInitializing = false;
      this.qrAttempts = 0;
      this.downloadAttempts = 0;
      this.reconnectionAttempts = 0;

      // Reinicializar
      await this.onModuleInit();

      console.log('✅ Reinicialización forzada completada');
    } catch (error) {
      console.error('❌ Error en reinicialización forzada:', error.message);
      throw error;
    }
  }

  /**
   * Genera QR on-demand (fuerza nueva generación)
   */
  async generateQrOnDemand(force: boolean = false): Promise<string> {
    console.log('generateQrOnDemand', this.isConnected());
    // Si ya está conectado, devolver "hola"
    // if (this.isConnected()) {
    //   return 'hola';
    // }

    // Si no es forzado y ya alcanzamos el máximo de intentos
    if (!force && this.qrAttempts >= this.maxQrAttempts) {
      throw new Error('Máximo de intentos de QR alcanzado');
    }

    console.log(`🔄 Generando QR on-demand ${force ? '(FORZADO)' : ''}...`);

    // Limpiar QR anterior
    this.appService.setQrCode('');

    // Si es forzado, resetear contadores
    if (force) {
      this.qrAttempts = 0;
      this.reconnectionAttempts = 0;
      // Resetear la promesa de inicialización para permitir nueva inicialización
      this.initializationPromise = null;
    }

    // Reinicializar conexión para generar nuevo QR
    await this.onModuleInit();

    // Esperar un poco para que se genere el QR (aumentado a 15 segundos)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const currentQr = this.appService.getQrCode();
        if (currentQr) {
          resolve(currentQr);
        } else {
          reject(
            new Error(
              'Timeout generando QR. La conexión puede estar fallando. Verifica que no haya otra sesión activa.',
            ),
          );
        }
      }, 15000); // Aumentado de 5 a 15 segundos
    });
  }

  /**
   * Obtiene el QR actual o genera uno nuevo
   */
  async getQrCode(forceNew: boolean = false): Promise<string> {
    console.log('getQrCode', this.isConnected());
    // Si ya está conectado, devolver "hola"
    // if (this.isConnected()) {
    //   return 'hola';
    // }

    // Si se fuerza nuevo QR
    if (forceNew) {
      return await this.generateQrOnDemand(true);
    }

    // Si hay un QR actual, devolverlo
    const currentQr = this.appService.getQrCode();
    if (currentQr) {
      return currentQr;
    }

    // Si no hay QR y no hemos alcanzado el límite, generar uno
    if (this.qrAttempts < this.maxQrAttempts) {
      return await this.generateQrOnDemand();
    }

    // Si ya alcanzamos el límite, devolver mensaje
    return 'Máximo de intentos alcanzado. Use force=true para generar nuevo QR.';
  }
}
