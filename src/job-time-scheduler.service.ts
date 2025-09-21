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

    this.logger.log(`Job Time Scheduler inicializado - ejecutándose cada 10 minutos en zona horaria ${this.timezone}`);
  }

  /**
   * Ejecuta todos los jobs pendientes que deben ejecutarse en este momento
   */
  private async executePendingJobs() {
    try {
      const now = DateTime.now().setZone(this.timezone);
      this.logger.log(`🔍 Verificando jobs pendientes a las ${now.toFormat('HH:mm:ss')} (GMT-3)`);

      // Obtener todos los jobs pendientes
      const pendingJobs = await this.supabaseService.getJobTimesByStatus('PENDING');
      
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
  private filterJobsForCurrentTime(jobs: Database['public']['Tables']['job_time']['Row'][], now: DateTime) {
    return jobs.filter(job => {
      // Si no tiene execution_time definido, no se ejecuta
      if (!job.execution_time) {
        return false;
      }

      try {
        // Parsear el execution_time del job (viene como timestamp sin zona horaria, interpretarlo como GMT-3)
        const jobTime = DateTime.fromISO(job.execution_time, { zone: this.timezone });
        
        // Log detallado para debugging
        this.logger.log(`🕐 Job ${job.id} - Execution time: ${job.execution_time} -> Parsed as: ${jobTime.toISO()} (${jobTime.toFormat('yyyy-MM-dd HH:mm:ss')} GMT-3)`);
        this.logger.log(`🕐 Current time: ${now.toISO()} (${now.toFormat('yyyy-MM-dd HH:mm:ss')} GMT-3)`);
        
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
          this.logger.log(`⏰ Job ${job.id} programado para ${jobTime.toFormat('HH:mm')} es muy antiguo (${Math.round(timeDiff)} min atrás), saltando`);
          return false;
        }
        
        // Caso 3: Job en el mismo intervalo de 10 minutos (ejecutar siempre)
        const currentMinute = now.minute;
        const jobMinute = jobTime.minute;
        const currentInterval = Math.floor(currentMinute / 10) * 10;
        const jobInterval = Math.floor(jobMinute / 10) * 10;
        const isSameInterval = currentInterval === jobInterval;
        
        if (isSameInterval) {
          this.logger.log(`🎯 Job ${job.id} en intervalo actual (${currentInterval}-${currentInterval + 9} min)`);
          return true;
        }
        
        // Caso 4: Job del mismo día, no muy antiguo, pero fuera del intervalo actual
        // Solo ejecutar si no es muy reciente (para evitar ejecuciones duplicadas)
        if (timeDiff >= 2) { // Al menos 10 minutos de diferencia
          this.logger.log(`🔄 Job ${job.id} programado para ${jobTime.toFormat('HH:mm')} ejecutándose con retraso (${Math.round(timeDiff)} min atrás)`);
          return true;
        }
        
        // Caso 5: Job muy reciente (menos de 10 min), no ejecutar para evitar duplicados
        this.logger.log(`⏳ Job ${job.id} muy reciente (${Math.round(timeDiff)} min atrás), saltando para evitar duplicados`);
        return false;
        
      } catch (error) {
        this.logger.warn(`⚠️ Error parseando execution_time del job ${job.id}:`, error.message);
        return false;
      }
    });
  }

  /**
   * Ejecuta un job específico
   */
  private async executeJob(job: Database['public']['Tables']['job_time']['Row']) {
    const jobId = job.id;
    this.logger.log(`🔄 Ejecutando job ${jobId} - ${job.folder_name || 'Sin nombre'}`);

    try {
      // Marcar job como RUNNING
      await this.supabaseService.updateJobTime(jobId, { status: 'RUNNING' });

      // Verificar que WhatsApp esté conectado
      if (!this.whatsappService.isConnected()) {
        throw new Error('WhatsApp no está conectado');
      }

      // Ejecutar el job según su tipo
      const result = await this.processJobExecution(job);
      
      // Marcar job como FINISHED
      await this.supabaseService.updateJobTime(jobId, { 
        status: 'FINISHED',
        executed_at: DateTime.now().setZone(this.timezone).toISO()
      });

      this.logger.log(`✅ Job ${jobId} ejecutado exitosamente`);
      return result;

    } catch (error) {
      this.logger.error(`❌ Error ejecutando job ${jobId}:`, error.message);
      
      // Marcar job como ERROR
      await this.supabaseService.updateJobTime(jobId, { 
        status: 'ERROR',
        executed_at: DateTime.now().setZone(this.timezone).toISO()
      });
      
      throw error;
    }
  }

  /**
   * Procesa la ejecución específica de un job
   */
  private async processJobExecution(job: Database['public']['Tables']['job_time']['Row']) {
    const results = [];
    
    if (!job.users || job.users.length === 0) {
      this.logger.warn(`⚠️ Job ${job.id} no tiene usuarios asignados`);
      return results;
    }

    this.logger.log(`📤 Enviando mensajes a ${job.users.length} usuarios`);

    for (const user of job.users) {
      try {
        const result = await this.sendMessageToUser(user, job);
        results.push({
          userId: user.id,
          userName: user.real_name,
          success: true,
          result
        });
        
        // Pequeña pausa entre mensajes para evitar spam
        await this.delay(1500);
        
      } catch (error) {
        this.logger.error(`❌ Error enviando mensaje a usuario ${user.id} (${user.real_name}):`, error.message);
        results.push({
          userId: user.id,
          userName: user.real_name,
          success: false,
          error: error.message
        });
      }
    }

    // Actualizar usuarios basado en los resultados
    if (results.length > 0) {
      try {
        const userUpdates = results.map(result => ({
          userId: result.userId,
          updates: {
            sent: result.success
          }
        }));

        await this.supabaseService.updateJobTimeUsers(job.id, userUpdates);
        this.logger.log(`✅ Actualizado estado de ${userUpdates.length} usuarios en job ${job.id}`);
      } catch (error) {
        this.logger.error(`❌ Error actualizando usuarios en job ${job.id}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Envía mensaje a un usuario específico
   */
  private async sendMessageToUser(user: Database['public']['Tables']['job_time']['Row']['users'][number], job: Database['public']['Tables']['job_time']['Row']) {
    const message = this.generateMessage(user, job);
    const archives = [];
    console.log(JSON.stringify(user, null, 2),"usuario", user.joined_users);
    try {
      // Obtener archivo principal del usuario por CUIT
      if (user.cuit) {
        const archive = await this.digitalOceanService.getFileVepsByCuit(
          user.cuit,
          job.folder_name || 'veps_default'
        );
        archives.push(archive);
        this.logger.log(`✅ Archivo principal encontrado para CUIT ${user.cuit}`);
      } else {
        this.logger.warn(`⚠️ Usuario ${user.real_name} no tiene CUIT, saltando archivo principal`);
      }

      // Obtener archivos de usuarios asociados (evitando duplicados)
      if (user.joined_users && user.joined_users.length > 0) {
        for (const joinedUser of user.joined_users) {
          // Solo buscar si el CUIT es diferente al del usuario principal
          if (joinedUser.cuit !== user.cuit) {
            try {
              const joinedUserArchive = await this.digitalOceanService.getFileVepsByCuit(
                joinedUser.cuit,
                job.folder_name || 'veps_default'
              );
              archives.push(joinedUserArchive);
              this.logger.log(`✅ Archivo asociado encontrado para CUIT ${joinedUser.cuit}`);
            } catch (error) {
              this.logger.warn(`⚠️ No se encontró archivo para CUIT asociado ${joinedUser.cuit}:`, error.message);
            }
          } else {
            this.logger.log(`⏭️ Saltando usuario asociado con mismo CUIT ${joinedUser.cuit} (ya incluido como principal)`);
          }
        }
      }

      if (archives.length === 0) {
        throw new Error(`No se encontraron archivos para el usuario ${user.real_name} (CUIT: ${user.cuit || 'sin-cuit'})`);
      }

      // Generar nombre de archivo con timestamp
      const now = DateTime.now().setZone(this.timezone);
      const timestamp = now.toFormat('yyyyMMdd-HHmmss');
      const vepFileName = `vep_${timestamp}.pdf`;

      // Enviar mensaje con archivos encontrados
      if (archives.length === 1) {
        return await this.whatsappService.sendMessageVep(
          user.mobile_number,
          message,
          vepFileName,
          archives[0],
          'document',
          user.is_group
        );
      } else {
        console.log(JSON.stringify(user, null, 2),"usuarios asociados", user.joined_users);
        // Enviar múltiples archivos
        return await this.whatsappService.sendMultipleDocuments(
          user.mobile_number,
          message,
          archives.map((archive, _) => ({
            archive,
            fileName: vepFileName,
            mimetype: 'application/pdf'
          })),
          user.is_group
        );
      }
    } catch (error) {
      this.logger.error(`❌ Error obteniendo archivos para usuario ${user.real_name}:`, error.message);
      throw error;
    }
  }

  /**
   * Genera el mensaje personalizado para el usuario
   */
  private generateMessage(user: Database['public']['Tables']['vep_users']['Row'], job: Database['public']['Tables']['job_time']['Row']) {
    const now = DateTime.now().setZone(this.timezone);
    // const currentMonth = now.toFormat('MMMM', { locale: 'es' });
    const currentYear = now.toFormat('yyyy');
    const nextMonth = now.plus({ months: 1 }).toFormat('MMMM', { locale: 'es' });

    let message = '';

    switch (job.type) {
      case 'autónomo':
        message = `Hola ${user.alter_name}, buenos días, cómo estás?. Te paso el vep de autónomo vence ${job.caducate ?? nextMonth}.\n`;
        break;
      case 'credencial':
        message = `Hola ${user.alter_name}, buenos días, cómo estás?. Te paso la credencial del monotributo de ${nextMonth} ${currentYear}, vence el ${job.caducate ?? nextMonth}.\n`;
        break;
      case 'monotributo':
        message = `Hola ${user.alter_name}, buenos días, cómo estás?. Te paso el vep del monotributo del mes de ${nextMonth} ${currentYear}, vence el ${job.caducate ?? nextMonth}.\n`;
        break;
      default:
        throw new Error('Tipo de job no válido');
    }
    
    
    if (user.need_papers) {
      message += 'No te olvides cuando puedas de mandarme los papeles de ventas. Saludos.';
    }

    if (user.need_z) {
      message += 'No te olvides cuando puedas de mandarme el cierre Z. Saludos.';
    }

    if (user.need_compra) {
      message += 'No te olvides cuando puedas de mandarme la factura de compra. Saludos.';
    }
    

    if (user.need_auditoria) {
      message += 'No te olvides cuando puedas de mandarme el cierre de auditoria. Saludos.';
    }

    return message;
  }

  /**
   * Genera el nombre del archivo para el usuario
   */
  private generateFileName(user: Database['public']['Tables']['vep_users']['Row'], job: Database['public']['Tables']['job_time']['Row']) {
    const now = DateTime.now().setZone(this.timezone);
    return `${user.real_name} [${user.cuit || 'sin-cuit'}].pdf`;
  }

  /**
   * Utilidad para delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        pending: allJobs.filter(job => job.status === 'PENDING').length,
        running: allJobs.filter(job => job.status === 'RUNNING').length,
        finished: allJobs.filter(job => job.status === 'FINISHED').length,
        error: allJobs.filter(job => job.status === 'ERROR').length,
      };
      
      this.logger.log('📊 Estadísticas de jobs:', stats);
      return stats;
    } catch (error) {
      this.logger.error('❌ Error obteniendo estadísticas:', error);
      throw error;
    }
  }
}
