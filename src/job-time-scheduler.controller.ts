import { Controller, Get, Post, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JobTimeSchedulerService } from './job-time-scheduler.service';
import { SupabaseService } from './supabase.service';

@Controller('job-scheduler')
@ApiTags('Job Scheduler')
@ApiBearerAuth('JWT-auth')
export class JobTimeSchedulerController {
  private readonly logger = new Logger(JobTimeSchedulerController.name);

  constructor(
    private readonly jobTimeSchedulerService: JobTimeSchedulerService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Ejecutar jobs manualmente',
    description: 'Ejecuta todos los jobs pendientes que están listos para ejecutarse'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Jobs ejecutados exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Jobs ejecutados exitosamente' },
        executedJobs: { type: 'number', example: 3 }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async executeJobsManually() {
    this.logger.log('Ejecutando jobs manualmente...');
    try {
      await this.jobTimeSchedulerService.executeJobsManually();
      return {
        success: true,
        message: 'Jobs ejecutados exitosamente',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error ejecutando jobs manualmente:', error);
      throw error;
    }
  }

  @Get('stats')
  @ApiOperation({ 
    summary: 'Obtener estadísticas de jobs',
    description: 'Retorna estadísticas detalladas de todos los jobs en el sistema'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Estadísticas obtenidas exitosamente',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 25, description: 'Total de jobs' },
        pending: { type: 'number', example: 5, description: 'Jobs pendientes' },
        running: { type: 'number', example: 2, description: 'Jobs en ejecución' },
        finished: { type: 'number', example: 15, description: 'Jobs completados' },
        error: { type: 'number', example: 3, description: 'Jobs con error' }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getJobStats() {
    this.logger.log('Obteniendo estadísticas de jobs...');
    try {
      const stats = await this.jobTimeSchedulerService.getJobStats();
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  @Get('pending')
  @ApiOperation({ 
    summary: 'Obtener jobs pendientes',
    description: 'Retorna todos los jobs con status PENDING'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Jobs pendientes obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              status: { type: 'string', example: 'PENDING' },
              execution_time: { type: 'string', example: '2025-01-20T09:00:00.000Z' },
              folder_name: { type: 'string', example: 'veps_enero_2025' },
              type: { type: 'string', example: 'autónomo' }
            }
          }
        },
        count: { type: 'number', example: 5 }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getPendingJobs() {
    this.logger.log('Obteniendo jobs pendientes...');
    try {
      const pendingJobs = await this.supabaseService.getJobTimesByStatus('PENDING');
      return {
        success: true,
        data: pendingJobs,
        count: pendingJobs.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error obteniendo jobs pendientes:', error);
      throw error;
    }
  }

  @Get('ready-to-execute')
  @ApiOperation({ 
    summary: 'Obtener jobs listos para ejecutar',
    description: 'Retorna jobs que están listos para ejecutarse (PENDING y execution_time <= now)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Jobs listos para ejecutar obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              status: { type: 'string', example: 'PENDING' },
              execution_time: { type: 'string', example: '2025-01-20T09:00:00.000Z' },
              folder_name: { type: 'string', example: 'veps_enero_2025' },
              type: { type: 'string', example: 'autónomo' }
            }
          }
        },
        count: { type: 'number', example: 3 }
      }
    }
  })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getReadyToExecuteJobs() {
    this.logger.log('Obteniendo jobs listos para ejecutar...');
    try {
      const readyJobs = await this.supabaseService.getReadyToExecuteJobs();
      return {
        success: true,
        data: readyJobs,
        count: readyJobs.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error obteniendo jobs listos para ejecutar:', error);
      throw error;
    }
  }

  @Get('status/:status')
  @ApiOperation({ 
    summary: 'Obtener jobs por status',
    description: 'Retorna jobs filtrados por status específico (PENDING, RUNNING, FINISHED, ERROR)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Jobs obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              status: { type: 'string', example: 'RUNNING' },
              execution_time: { type: 'string', example: '2025-01-20T09:00:00.000Z' },
              folder_name: { type: 'string', example: 'veps_enero_2025' },
              type: { type: 'string', example: 'autónomo' }
            }
          }
        },
        count: { type: 'number', example: 2 },
        status: { type: 'string', example: 'RUNNING' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Status inválido' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async getJobsByStatus(status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR') {
    this.logger.log(`Obteniendo jobs con status: ${status}`);
    try {
      const jobs = await this.supabaseService.getJobTimesByStatus(status);
      return {
        success: true,
        data: jobs,
        count: jobs.length,
        status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Error obteniendo jobs con status ${status}:`, error);
      throw error;
    }
  }
}
