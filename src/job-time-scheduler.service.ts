import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import { SupabaseService } from './supabase.service';
import { WhatsappService } from './whatsapp.service';
import { DigitalOceanService } from './digitalOcean.service';
import { ConfigService } from '@nestjs/config';
import { Database } from './supabase.types';

@Injectable()
export class JobTimeSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(JobTimeSchedulerService.name);
  private readonly timezone = 'America/Argentina/Buenos_Aires'; // GMT-3
  // Cache de templates en memoria para evitar consultas repetidas
  private templateCache: Map<
    'autónomo' | 'credencial' | 'monotributo',
    string | null
  > = new Map();

  constructor(
    private supabaseService: SupabaseService,
    private whatsappService: WhatsappService,
    private digitalOceanService: DigitalOceanService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    // Cron job que se ejecuta cada 10 minutos: */10 * * * *
    // Esto significa: minuto 0, 10, 20, 30, 40, 50 de cada hora
    new CronJob(
      '*/5 * * * *', // Cada 10 minutos
      async () => {
        await this.executePendingJobs();
      },
      null, // On complete (optional)
      true, // Start immediately
      this.timezone, // Timezone GMT-3
    );

    this.logger.log(
      `Job Time Scheduler inicializado - ejecutándose cada 10 minutos en zona horaria ${this.timezone}`,
    );
  }

  /**
   * Ejecuta todos los jobs pendientes que deben ejecutarse en este momento
   */
  private async executePendingJobs() {
    try {
      const now = DateTime.now().setZone(this.timezone);
      this.logger.log(
        `🔍 Verificando jobs pendientes a las ${now.toFormat('HH:mm:ss')} (GMT-3)`,
      );

      // Obtener todos los jobs pendientes
      const pendingJobs =
        await this.supabaseService.getJobTimesByStatus('PENDING');

      if (!pendingJobs || pendingJobs.length === 0) {
        this.logger.log('✅ No hay jobs pendientes para ejecutar');
        return;
      }

      this.logger.log(`📋 Encontrados ${pendingJobs.length} jobs pendientes`);

      // Filtrar jobs que deben ejecutarse en este momento (cada 10 minutos)
      const jobsToExecute = this.filterJobsForCurrentTime(pendingJobs, now);

      if (jobsToExecute.length === 0) {
        this.logger.log('⏰ No hay jobs programados para este momento');
        return;
      }

      this.logger.log(`🚀 Ejecutando ${jobsToExecute.length} jobs`);

      // Ejecutar cada job
      for (const job of jobsToExecute) {
        await this.executeJob(job);
      }
    } catch (error) {
      this.logger.error('❌ Error ejecutando jobs pendientes:', error);
    }
  }

  /**
   * Filtra los jobs que deben ejecutarse en el momento actual
   * Considera que los jobs se ejecutan cada 10 minutos (9:00, 9:10, 9:20, etc.)
   * También ejecuta jobs del mismo día que no sean anteriores a más de 1 hora
   */
  private filterJobsForCurrentTime(
    jobs: Database['public']['Tables']['job_time']['Row'][],
    now: DateTime,
  ) {
    return jobs.filter((job) => {
      // Si no tiene execution_time definido, no se ejecuta
      if (!job.execution_time) {
        return false;
      }

      try {
        // Parsear el execution_time del job (viene como timestamp sin zona horaria, interpretarlo como GMT-3)
        const jobTime = DateTime.fromISO(job.execution_time, {
          zone: this.timezone,
        });

        // Log detallado para debugging
        this.logger.log(
          `🕐 Job ${job.id} - Execution time: ${job.execution_time} -> Parsed as: ${jobTime.toISO()} (${jobTime.toFormat('yyyy-MM-dd HH:mm:ss')} GMT-3)`,
        );
        this.logger.log(
          `🕐 Current time: ${now.toISO()} (${now.toFormat('yyyy-MM-dd HH:mm:ss')} GMT-3)`,
        );

        // Verificar si el job debe ejecutarse en este momento
        // Consideramos que un job debe ejecutarse si:
        // 1. La hora y minuto coinciden exactamente (mismo intervalo de 10 minutos)
        // 2. O si el job está programado para un momento anterior del mismo día y no es anterior a más de 1 hora

        const isSameDay = now.day === jobTime.day;
        const isSameMonth = now.month === jobTime.month;
        const isSameYear = now.year === jobTime.year;

        // Si no es el mismo día, mes o año, no ejecutar
        if (!isSameDay || !isSameMonth || !isSameYear) {
          return false;
        }

        // Calcular diferencia de tiempo
        const timeDiff = now.diff(jobTime, 'minutes').minutes;

        // Caso 1: Job programado para el futuro (no ejecutar aún)
        if (timeDiff < 0) {
          return false;
        }

        // Caso 2: Job programado para más de 1 hora atrás (no ejecutar)
        if (timeDiff > 60) {
          this.logger.log(
            `⏰ Job ${job.id} programado para ${jobTime.toFormat('HH:mm')} es muy antiguo (${Math.round(timeDiff)} min atrás), saltando`,
          );
          return false;
        }

        // Caso 3: Job en el mismo intervalo de 10 minutos (ejecutar siempre)
        const currentMinute = now.minute;
        const jobMinute = jobTime.minute;
        const currentInterval = Math.floor(currentMinute / 10) * 10;
        const jobInterval = Math.floor(jobMinute / 10) * 10;
        const isSameInterval = currentInterval === jobInterval;

        if (isSameInterval) {
          this.logger.log(
            `🎯 Job ${job.id} en intervalo actual (${currentInterval}-${currentInterval + 9} min)`,
          );
          return true;
        }

        // Caso 4: Job del mismo día, no muy antiguo, pero fuera del intervalo actual
        // Solo ejecutar si no es muy reciente (para evitar ejecuciones duplicadas)
        if (timeDiff >= 2) {
          // Al menos 10 minutos de diferencia
          this.logger.log(
            `🔄 Job ${job.id} programado para ${jobTime.toFormat('HH:mm')} ejecutándose con retraso (${Math.round(timeDiff)} min atrás)`,
          );
          return true;
        }

        // Caso 5: Job muy reciente (menos de 10 min), no ejecutar para evitar duplicados
        this.logger.log(
          `⏳ Job ${job.id} muy reciente (${Math.round(timeDiff)} min atrás), saltando para evitar duplicados`,
        );
        return false;
      } catch (error) {
        this.logger.warn(
          `⚠️ Error parseando execution_time del job ${job.id}:`,
          error.message,
        );
        return false;
      }
    });
  }

  /**
   * Ejecuta un job específico
   */
  private async executeJob(
    job: Database['public']['Tables']['job_time']['Row'],
  ) {
    const jobId = job.id;
    this.logger.log(
      `🔄 Intentando ejecutar job ${jobId} - ${job.folder_name || 'Sin nombre'}`,
    );

    try {
      // Actualización atómica: solo marcar como RUNNING si está en PENDING
      const updatedJob =
        await this.supabaseService.updateJobTimeToRunningIfPending(jobId);

      if (!updatedJob) {
        this.logger.warn(
          `⏭️ Job ${jobId} ya está ejecutándose o fue completado, saltando ejecución duplicada`,
        );
        return null; // Job ya está siendo procesado por otra instancia
      }

      this.logger.log(
        `✅ Job ${jobId} marcado como RUNNING (actualización atómica exitosa)`,
      );

      // Verificar que WhatsApp esté conectado
      if (!this.whatsappService.isConnected()) {
        throw new Error('WhatsApp no está conectado');
      }

      // Ejecutar el job según su tipo
      const result = await this.processJobExecution(job);

      // Marcar job como FINISHED
      await this.supabaseService.updateJobTime(jobId, {
        status: 'FINISHED',
        executed_at: DateTime.now().setZone(this.timezone).toISO(),
      });

      this.logger.log(`✅ Job ${jobId} ejecutado exitosamente`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Error ejecutando job ${jobId}:`, error.message);

      // Marcar job como ERROR
      await this.supabaseService.updateJobTime(jobId, {
        status: 'ERROR',
        executed_at: DateTime.now().setZone(this.timezone).toISO(),
      });

      throw error;
    }
  }

  /**
   * Procesa la ejecución específica de un job
   */
  private async processJobExecution(
    job: Database['public']['Tables']['job_time']['Row'],
  ) {
    const results = [];

    if (!job.users || job.users.length === 0) {
      this.logger.warn(`⚠️ Job ${job.id} no tiene usuarios asignados`);
      return results;
    }

    // Obtener template una sola vez al inicio del envío masivo
    if (!job.type) {
      this.logger.error(
        `❌ Job ${job.id} no tiene tipo definido, cancelando ejecución`,
      );
      throw new Error('Job no tiene tipo definido');
    }

    const template = await this.getTemplateForJob(job.type);

    if (!template || template.trim() === '') {
      this.logger.error(
        `❌ No se encontró template válido para tipo "${job.type}" o está vacío. Cancelando ejecución del job ${job.id}`,
      );
      throw new Error(
        `Template no encontrado o vacío para tipo "${job.type}". La ejecución ha sido cancelada.`,
      );
    }

    this.logger.log(
      `📤 Enviando mensajes a ${job.users.length} usuarios usando template para tipo "${job.type}"`,
    );

    for (const user of job.users) {
      try {
        const result = await this.sendMessageToUser(user, job, template);
        results.push({
          userId: user.id,
          userName: user.real_name,
          success: true,
          result,
        });

        // Actualizar estado "sent" del usuario en el job inmediatamente después de enviar
        try {
          await this.supabaseService.updateJobTimeUsers(job.id, [
            {
              userId: user.id,
              updates: {
                sent: true,
              },
            },
          ]);
          this.logger.log(
            `✅ Estado "sent" actualizado para usuario ${user.real_name} (ID: ${user.id}) en job ${job.id}`,
          );
        } catch (updateError) {
          this.logger.error(
            `⚠️ Error actualizando estado "sent" para usuario ${user.id} en job ${job.id}:`,
            updateError.message,
          );
          // No fallar el proceso si falla la actualización, solo loguearlo
        }

        // Pequeña pausa entre mensajes para evitar spam
        await this.delay(1500);
      } catch (error) {
        this.logger.error(
          `❌ Error enviando mensaje a usuario ${user.id} (${user.real_name}):`,
          error.message,
        );
        results.push({
          userId: user.id,
          userName: user.real_name,
          success: false,
          error: error.message,
        });

        // Actualizar estado "sent" como false si falló el envío
        try {
          await this.supabaseService.updateJobTimeUsers(job.id, [
            {
              userId: user.id,
              updates: {
                sent: false,
              },
            },
          ]);
          this.logger.log(
            `⚠️ Estado "sent" actualizado a false para usuario ${user.real_name} (ID: ${user.id}) en job ${job.id}`,
          );
        } catch (updateError) {
          this.logger.error(
            `⚠️ Error actualizando estado "sent" para usuario ${user.id} en job ${job.id}:`,
            updateError.message,
          );
        }
      }
    }

    return results;
  }

  /**
   * Envía mensaje a un usuario específico
   */
  private async sendMessageToUser(
    user: Database['public']['Tables']['job_time']['Row']['users'][number],
    job: Database['public']['Tables']['job_time']['Row'],
    template: string,
  ) {
    const message = this.generateMessage(user, job, template);
    const archives = [];
    console.log(JSON.stringify(user, null, 2), 'usuario', user.joined_users);
    try {
      // Obtener archivo principal del usuario por CUIT
      if (user.cuit) {
        try {
          const archive = await this.digitalOceanService.getFileVepsByCuit(
            user.cuit,
            job.folder_name || 'veps_default',
          );
          archives.push(archive);
          this.logger.log(
            `✅ Archivo principal encontrado para CUIT ${user.cuit}`,
          );
        } catch (error) {
          this.logger.warn(
            `⚠️ No se encontró archivo principal para CUIT ${user.cuit}:`,
            error.message,
          );
          // Continuar con archivos anexados si existen
        }
      } else {
        this.logger.warn(
          `⚠️ Usuario ${user.real_name} no tiene CUIT, saltando archivo principal`,
        );
      }

      // Obtener archivos de usuarios asociados (evitando duplicados)
      if (user.joined_users && user.joined_users.length > 0) {
        for (const joinedUser of user.joined_users) {
          // Solo buscar si el CUIT es diferente al del usuario principal
          if (joinedUser.cuit !== user.cuit) {
            try {
              const joinedUserArchive =
                await this.digitalOceanService.getFileVepsByCuit(
                  joinedUser.cuit,
                  job.folder_name || 'veps_default',
                );
              archives.push(joinedUserArchive);
              this.logger.log(
                `✅ Archivo asociado encontrado para CUIT ${joinedUser.cuit}`,
              );
            } catch (error) {
              this.logger.warn(
                `⚠️ No se encontró archivo para CUIT asociado ${joinedUser.cuit}:`,
                error.message,
              );
            }
          } else {
            this.logger.log(
              `⏭️ Saltando usuario asociado con mismo CUIT ${joinedUser.cuit} (ya incluido como principal)`,
            );
          }
        }
      }

      if (archives.length === 0) {
        const cuitList = user.cuit 
          ? [user.cuit, ...(user.joined_users?.map(j => j.cuit).filter(Boolean) || [])].join(', ')
          : user.joined_users?.map(j => j.cuit).filter(Boolean).join(', ') || 'sin-cuit';
        throw new Error(
          `No se encontraron archivos para el usuario ${user.real_name}. Se buscaron archivos para los CUITs: ${cuitList}`,
        );
      }

      // Generar nombre de archivo con timestamp
      const vepFileName = `${user.real_name} [${user.cuit}].pdf`;

      // Enviar mensaje con archivos encontrados
      let sendResult;
      if (archives.length === 1) {
        sendResult = await this.whatsappService.sendMessageVep(
          user.mobile_number,
          message,
          vepFileName,
          archives[0],
          'document',
          user.is_group,
        );
      } else {
        console.log(
          JSON.stringify(user, null, 2),
          'usuarios asociados',
          user.joined_users,
        );
        // Enviar múltiples archivos
        sendResult = await this.whatsappService.sendMultipleDocuments(
          user.mobile_number,
          message,
          archives.map((archive, index) => ({
            archive,
            fileName:
              index === 0
                ? vepFileName
                : `${user.joined_users[index - 1].name} [${user.joined_users[index - 1].cuit}].pdf`,
            mimetype: 'application/pdf',
          })),
          user.is_group,
        );
      }

      // Actualizar last_execution inmediatamente después de enviar el mensaje
      try {
        await this.supabaseService.updateVepUserLastExecution(
          user.id,
          new Date().toISOString(),
        );
        this.logger.log(
          `✅ Mensaje enviado y last_execution actualizado para usuario ${user.real_name} (ID: ${user.id})`,
        );
      } catch (updateError) {
        this.logger.error(
          `⚠️ Error actualizando last_execution para usuario ${user.id}:`,
          updateError.message,
        );
        // No lanzar error, solo loguearlo, ya que el mensaje se envió correctamente
      }

      return sendResult;
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo archivos para usuario ${user.real_name}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Obtiene el template para un job (con cache en memoria)
   * Si no encuentra template o está vacío, lanza error y corta la ejecución
   */
  private async getTemplateForJob(
    type: 'autónomo' | 'credencial' | 'monotributo',
  ): Promise<string> {
    // 1. Verificar cache primero
    if (this.templateCache.has(type)) {
      const cachedTemplate = this.templateCache.get(type);
      if (cachedTemplate && cachedTemplate.trim() !== '') {
        this.logger.debug(`📋 Usando template en cache para tipo "${type}"`);
        return cachedTemplate;
      }
    }

    // 2. Obtener desde BD
    try {
      const templateData = await this.supabaseService.getMessageTemplate(type);
      const template = templateData?.template || null;

      // 3. Si hay template en BD pero está vacío, cortar ejecución
      if (templateData && (!template || template.trim() === '')) {
        throw new Error(
          `Template encontrado en BD para tipo "${type}" pero está vacío. La ejecución ha sido cancelada.`,
        );
      }

      // 4. Si hay template válido en BD, guardarlo en cache y retornarlo
      if (template && template.trim() !== '') {
        this.templateCache.set(type, template);
        this.logger.log(`✅ Template obtenido y cacheado para tipo "${type}"`);
        return template;
      }

      // 5. Si no hay template en BD (null), usar default como fallback
      const defaultTemplate = this.getDefaultTemplate(type);
      if (defaultTemplate && defaultTemplate.trim() !== '') {
        // Guardar default en cache también
        this.templateCache.set(type, defaultTemplate);
        this.logger.warn(
          `⚠️ Usando template por defecto para tipo "${type}" (no encontrado en BD)`,
        );
        return defaultTemplate;
      }

      // 6. Si ni BD ni default tienen template válido, lanzar error
      throw new Error(
        `No se encontró template válido para tipo "${type}". La ejecución ha sido cancelada.`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `❌ Error obteniendo template para tipo "${type}": ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Genera el mensaje personalizado para el usuario
   * Recibe el template ya obtenido (no lo busca)
   */
  private generateMessage(
    user: Database['public']['Tables']['vep_users']['Row'],
    job: Database['public']['Tables']['job_time']['Row'],
    template: string,
  ): string {
    // 1. Validar que incluya el nombre (agregarlo si no está)
    if (!template.includes('{nombre}') && !template.includes('{alter_name}')) {
      template = `Hola {nombre}, ${template}`;
    }

    // 2. Reemplazar variables
    template = this.replaceTemplateVariables(template, user, job);

    // 3. Agregar mensajes adicionales según flags
    template = this.appendAdditionalMessages(template, user);

    return template;
  }

  /**
   * Reemplaza las variables del template con valores reales
   */
  private replaceTemplateVariables(
    template: string,
    user: Database['public']['Tables']['vep_users']['Row'],
    job: Database['public']['Tables']['job_time']['Row'],
  ): string {
    const now = DateTime.now().setZone(this.timezone);
    const nextMonth = now
      .plus({ months: 1 })
      .toFormat('MMMM', { locale: 'es' });
    const currentYear = now.toFormat('yyyy');

    const replacements: Record<string, string> = {
      '{nombre}': user.alter_name || user.real_name || '',
      '{alter_name}': user.alter_name || user.real_name || '',
      '{real_name}': user.real_name || '',
      '{caducate}': job.caducate || nextMonth,
      '{mes}': nextMonth,
      '{año}': currentYear,
      '{mes_siguiente}': `${nextMonth} ${currentYear}`,
      '{tipo}': job.type || '',
    };

    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      // Escapar caracteres especiales en la clave para regex
      const escapedKey = key.replace(/[{}]/g, '\\$&');
      result = result.replace(new RegExp(escapedKey, 'g'), value);
    }

    // Convertir \n literales a saltos de línea reales
    result = result.replace(/\\n/g, '\n');

    return result;
  }

  /**
   * Retorna templates por defecto si no hay template en BD
   */
  private getDefaultTemplate(
    type: 'autónomo' | 'credencial' | 'monotributo' | null,
  ): string {
    const templates: Record<string, string> = {
      autónomo:
        'Hola {nombre}, buenos días, cómo estás? Te paso el vep de autónomo vence {caducate}.\n',
      credencial:
        'Hola {nombre}, buenos días, cómo estás? Te paso la credencial del monotributo de {mes_siguiente}, vence el {caducate}. El mismo ya cuenta con la recategorizacion.\n',
      monotributo:
        'Hola {nombre}, buenos días, cómo estás? Te paso el vep del monotributo del mes de {mes_siguiente}, vence el {caducate}. el mismo ya tiene la recategorizacion realizada.\n',
    };

    return templates[type || ''] || 'Hola {nombre}, buenos días.\n';
  }

  /**
   * Agrega mensajes adicionales según los flags del usuario
   */
  private appendAdditionalMessages(
    message: string,
    user: Database['public']['Tables']['vep_users']['Row'],
  ): string {
    let result = message;

    if (user.need_papers) {
      result +=
        'No te olvides cuando puedas de mandarme los papeles de ventas. Saludos.';
    }

    if (user.need_z) {
      result += 'No te olvides cuando puedas de mandarme el cierre Z. Saludos.';
    }

    if (user.need_compra) {
      result += 'No te olvides cuando puedas de mandarme las compras. Saludos.';
    }

    if (user.need_auditoria) {
      result +=
        'No te olvides cuando puedas de mandarme el cierre de auditoría. Saludos.';
    }

    return result;
  }

  /**
   * Genera el nombre del archivo para el usuario
   */
  private generateFileName(
    user: Database['public']['Tables']['vep_users']['Row'],
  ) {
    return `${user.real_name} [${user.cuit || 'sin-cuit'}].pdf`;
  }

  /**
   * Utilidad para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Método para ejecutar jobs manualmente (para testing)
   */
  async executeJobsManually() {
    this.logger.log('🔧 Ejecutando jobs manualmente...');
    await this.executePendingJobs();
  }

  /**
   * Obtiene estadísticas de jobs
   */
  async getJobStats() {
    try {
      const allJobs = await this.supabaseService.getJobTimes();
      const stats = {
        total: allJobs.length,
        pending: allJobs.filter((job) => job.status === 'PENDING').length,
        running: allJobs.filter((job) => job.status === 'RUNNING').length,
        finished: allJobs.filter((job) => job.status === 'FINISHED').length,
        error: allJobs.filter((job) => job.status === 'ERROR').length,
      };

      this.logger.log('📊 Estadísticas de jobs:', stats);
      return stats;
    } catch (error) {
      this.logger.error('❌ Error obteniendo estadísticas:', error);
      throw error;
    }
  }
}
