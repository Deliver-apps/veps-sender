import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseService } from '../supabase.service';
import { CreateJobTimeDto } from './dto/create-job-time.dto';
import { UpdateJobTimeDto } from './dto/update-job-time.dto';
import { DigitalOceanAuthGuard } from '../guards/digital-ocean-auth.guard';

@ApiTags('Job Time')
@Controller('job-time')
@UseGuards(DigitalOceanAuthGuard)
@ApiBearerAuth('DigitalOcean-auth')
export class JobTimeController {
  private readonly logger = new Logger(JobTimeController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Crear un nuevo job_time
   */
  @Post()
  @ApiOperation({ 
    summary: 'Crear un nuevo job time',
    description: 'Crea un nuevo job time con usuarios VEP y configuración de ejecución'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Job time creado exitosamente',
    type: CreateJobTimeDto
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - datos de validación inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async create(@Body() createJobTimeDto: CreateJobTimeDto) {
    this.logger.log('Creating new job_time');
    return await this.supabaseService.createJobTime(createJobTimeDto);
  }

  /**
   * Obtener todos los job_times
   */
  @Get()
  async findAll() {
    this.logger.log('Fetching all job_times');
    return await this.supabaseService.getJobTimes();
  }

  /**
   * Obtener job_times con paginación y filtros opcionales
   */
  @Get('paginated')
  async findPaginated(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('search') search?: string,
    @Query('field') field?: 'folder_name' | 'type' | 'status',
    @Query('status') status?: 'PENDING' | 'FINISHED',
    @Query('type') type?: 'autónomo' | 'credencial' | 'monotributo',
  ) {
    this.logger.log(`Fetching job_times - page: ${page}, limit: ${limit}, search: ${search || 'none'}, field: ${field || 'all'}, status: ${status || 'all'}, type: ${type || 'all'}`);
    return await this.supabaseService.getJobTimesPaginated(page, limit, search, field, status, type);
  }

  /**
   * Buscar job_times por término de búsqueda
   */
  @Get('search')
  async search(
    @Query('term') term: string,
    @Query('field') field?: 'folder_name' | 'type' | 'status',
    @Query('status') status?: 'PENDING' | 'FINISHED',
    @Query('type') type?: 'autónomo' | 'credencial' | 'monotributo',
  ) {
    this.logger.log(`Searching job_times with term: ${term}, field: ${field || 'all'}, status: ${status || 'all'}, type: ${type || 'all'}`);
    return await this.supabaseService.searchJobTimes(term, field, status, type);
  }

  /**
   * Obtener un job_time por ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Fetching job_time with ID: ${id}`);
    return await this.supabaseService.getJobTimeById(id);
  }

  /**
   * Actualizar un job_time
   */
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateJobTimeDto: UpdateJobTimeDto,
  ) {
    this.logger.log(`Updating job_time with ID: ${id}`);
    return await this.supabaseService.updateJobTime(id, updateJobTimeDto);
  }

  /**
   * Eliminar un job_time
   */
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Deleting job_time with ID: ${id}`);
    return await this.supabaseService.deleteJobTime(id);
  }
}
