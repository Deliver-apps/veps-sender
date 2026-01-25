import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  Logger,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { SupabaseService } from '../supabase.service';
import { CreateVepUserDto } from './dto/create-vep-user.dto';
import { UpdateVepUserDto } from './dto/update-vep-user.dto';
import { DigitalOceanAuthGuard } from '../guards/digital-ocean-auth.guard';

@ApiTags('VEP Users')
@Controller('vep-users')
@UseGuards(DigitalOceanAuthGuard)
@ApiBearerAuth('DigitalOcean-auth')
export class VepUsersController {
  private readonly logger = new Logger(VepUsersController.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Crea un nuevo usuario VEP
   * @param createVepUserDto Datos del usuario a crear
   * @returns Usuario creado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Crear un nuevo usuario VEP',
    description: 'Crea un nuevo usuario VEP en el sistema'
  })
  @ApiBody({ 
    type: CreateVepUserDto,
    description: 'Datos del usuario VEP a crear'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Usuario VEP creado exitosamente',
    type: CreateVepUserDto
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - datos de validación inválidos' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async create(@Body() createVepUserDto: CreateVepUserDto) {
    this.logger.log('Creating new VEP user');
    return await this.supabaseService.createVepUser(createVepUserDto);
  }

  /**
   * Obtiene todos los usuarios VEP
   * @returns Lista de todos los usuarios VEP
   */
  @Get()
  @ApiOperation({ 
    summary: 'Obtener todos los usuarios VEP',
    description: 'Retorna una lista completa de todos los usuarios VEP en el sistema'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de usuarios VEP obtenida exitosamente'
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findAll() {
    this.logger.log('Fetching all VEP users');
    return await this.supabaseService.getVepUsers();
  }

  /**
   * Obtiene usuarios VEP con paginación y filtros opcionales
   * @param page Número de página (opcional, por defecto 1)
   * @param limit Límite de resultados por página (opcional, por defecto 10)
   * @param search Término de búsqueda opcional (coincidencias parciales case-insensitive)
   * @param field Campo específico para buscar (opcional)
   * @param type Tipo de usuario a filtrar (opcional): 'autónomo' o 'credencial' o 'monotributo'
   * @returns Usuarios paginados
   */
  @Get('paginated')
  @ApiOperation({ 
    summary: 'Obtener usuarios VEP paginados',
    description: 'Retorna usuarios VEP con paginación y filtros opcionales de búsqueda'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite de resultados por página', example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Término de búsqueda (coincidencias parciales case-insensitive)', example: 'Juan' })
  @ApiQuery({ name: 'field', required: false, enum: ['real_name', 'alter_name', 'mobile_number', 'cuit'], description: 'Campo específico para buscar' })
  @ApiQuery({ name: 'type', required: false, enum: ['autónomo', 'credencial', 'monotributo'], description: 'Tipo de usuario a filtrar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuarios VEP paginados obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/CreateVepUserDto' } },
        total: { type: 'number', example: 100 },
        page: { type: 'number', example: 1 },
        limit: { type: 'number', example: 10 },
        totalPages: { type: 'number', example: 10 }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findPaginated(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('search') search?: string,
    @Query('field') field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit',
    @Query('type') type?: 'autónomo' | 'credencial' | 'monotributo',
  ) {
    this.logger.log(`Fetching VEP users - page: ${page}, limit: ${limit}, search: ${search || 'none'}, field: ${field || 'all'}, type: ${type || 'all'}`);
    return await this.supabaseService.getVepUsersPaginated(page, limit, search, field, type);
  }

  /**
   * Obtiene usuarios VEP con filtros opcionales (sin paginación)
   * @param search Término de búsqueda opcional (coincidencias parciales case-insensitive)
   * @param field Campo específico para buscar (opcional)
   * @param type Tipo de usuario a filtrar (opcional): 'autónomo' o 'credencial' o 'monotributo'
   * @returns Lista completa de usuarios filtrados
   */
  @Get('filtered')
  @ApiOperation({ 
    summary: 'Obtener usuarios VEP filtrados (sin paginación)',
    description: 'Retorna todos los usuarios VEP que coincidan con los filtros aplicados, sin paginación'
  })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Término de búsqueda (coincidencias parciales case-insensitive)', example: 'Juan' })
  @ApiQuery({ name: 'field', required: false, enum: ['real_name', 'alter_name', 'mobile_number', 'cuit'], description: 'Campo específico para buscar' })
  @ApiQuery({ name: 'type', required: false, enum: ['autónomo', 'credencial', 'monotributo'], description: 'Tipo de usuario a filtrar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Lista de usuarios VEP filtrados obtenida exitosamente',
    type: [CreateVepUserDto]
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findFiltered(
    @Query('search') search?: string,
    @Query('field') field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit',
    @Query('type') type?: 'autónomo' | 'credencial' | 'monotributo',
  ) {
    this.logger.log(`Fetching filtered VEP users - search: ${search || 'none'}, field: ${field || 'all'}, type: ${type || 'all'}`);
    return await this.supabaseService.getVepUsersFiltered(search, field, type);
  }

  /**
   * Busca usuarios VEP por criterios
   * @param term Término de búsqueda
   * @param field Campo específico para buscar (opcional)
   * @param type Tipo de usuario a filtrar (opcional): 'autónomo' o 'credencial' o 'monotributo'
   * @returns Lista de usuarios encontrados
   */
  @Get('search')
  @ApiOperation({ 
    summary: 'Buscar usuarios VEP',
    description: 'Busca usuarios VEP por término de búsqueda con filtros opcionales'
  })
  @ApiQuery({ name: 'term', required: true, type: String, description: 'Término de búsqueda', example: 'Juan' })
  @ApiQuery({ name: 'field', required: false, enum: ['real_name', 'alter_name', 'mobile_number', 'cuit'], description: 'Campo específico para buscar' })
  @ApiQuery({ name: 'type', required: false, enum: ['autónomo', 'credencial', 'monotributo'], description: 'Tipo de usuario a filtrar' })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuarios VEP encontrados exitosamente',
    type: [CreateVepUserDto]
  })
  @ApiResponse({ status: 400, description: 'Solicitud incorrecta - término de búsqueda requerido' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async search(
    @Query('term') term: string,
    @Query('field') field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit',
    @Query('type') type?: 'autónomo' | 'credencial' | 'monotributo',
  ) {
    this.logger.log(`Searching VEP users with term: ${term}, field: ${field || 'all'}, type: ${type || 'all'}`);
    return await this.supabaseService.searchVepUsers(term, field, type);
  }

  /**
   * Obtiene un usuario VEP por ID
   * @param id ID del usuario
   * @returns Usuario encontrado
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Obtener usuario VEP por ID',
    description: 'Obtiene un usuario VEP específico por su ID'
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID del usuario VEP', example: 1 })
  @ApiResponse({ 
    status: 200, 
    description: 'Usuario VEP encontrado exitosamente',
    type: CreateVepUserDto
  })
  @ApiResponse({ status: 404, description: 'Usuario VEP no encontrado' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 500, description: 'Error interno del servidor' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Fetching VEP user by ID: ${id}`);
    return await this.supabaseService.getVepUserById(id);
  }

  /**
   * Actualiza un usuario VEP
   * @param id ID del usuario
   * @param updateVepUserDto Datos a actualizar
   * @returns Usuario actualizado
   */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateVepUserDto: UpdateVepUserDto,
  ) {
    this.logger.log(`Updating VEP user with ID: ${id}`);
    return await this.supabaseService.updateVepUser(id, updateVepUserDto);
  }

  /**
   * Elimina un usuario VEP
   * @param id ID del usuario
   * @returns Confirmación de eliminación
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Deleting VEP user with ID: ${id}`);
    return await this.supabaseService.deleteVepUser(id);
  }

  /**
   * Obtiene usuarios VEP que no han sido enviados este mes
   * @returns Lista de usuarios no enviados
   */
  @Get('not-sent/this-month')
  async findNotSentThisMonth() {
    this.logger.log('Fetching VEP users not sent this month');
    return await this.supabaseService.getThisMonthNotSentUsers();
  }

  // ========== ENDPOINTS PARA USUARIOS ASOCIADOS ==========

  /**
   * Obtiene todos los usuarios asociados de un usuario VEP
   * @param id ID del usuario principal
   * @returns Lista de usuarios asociados
   */
  @Get(':id/joined-users')
  async getJoinedUsers(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`Getting joined users for VEP user ${id}`);
    return await this.supabaseService.getJoinedUsers(id);
  }

  /**
   * Agrega un usuario asociado a un usuario VEP
   * @param id ID del usuario principal
   * @param body Datos del usuario a agregar
   * @returns Usuario actualizado
   */
  @Post(':id/joined-users')
  @HttpCode(HttpStatus.OK)
  async addJoinedUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name: string; cuit: string }
  ) {
    this.logger.log(`Adding joined user to VEP user ${id}: ${body.name}`);
    return await this.supabaseService.addJoinedUser(id, body);
  }

  /**
   * Elimina un usuario asociado de un usuario VEP
   * @param id ID del usuario principal
   * @param cuit CUIT del usuario a eliminar
   * @returns Usuario actualizado
   */
  @Delete(':id/joined-users/:cuit')
  @HttpCode(HttpStatus.OK)
  async removeJoinedUser(
    @Param('id', ParseIntPipe) id: number,
    @Param('cuit') cuit: string
  ) {
    this.logger.log(`Removing joined user from VEP user ${id}: ${cuit}`);
    return await this.supabaseService.removeJoinedUser(id, cuit);
  }
}
