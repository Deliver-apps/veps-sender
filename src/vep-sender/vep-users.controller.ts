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
import { SupabaseService } from '../supabase.service';
import { CreateVepUserDto } from './dto/create-vep-user.dto';
import { UpdateVepUserDto } from './dto/update-vep-user.dto';
import { DigitalOceanAuthGuard } from '../guards/digital-ocean-auth.guard';

@Controller('vep-users')
@UseGuards(DigitalOceanAuthGuard)
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
  async create(@Body() createVepUserDto: CreateVepUserDto) {
    this.logger.log('Creating new VEP user');
    return await this.supabaseService.createVepUser(createVepUserDto);
  }

  /**
   * Obtiene todos los usuarios VEP
   * @returns Lista de todos los usuarios VEP
   */
  @Get()
  async findAll() {
    this.logger.log('Fetching all VEP users');
    return await this.supabaseService.getVepUsers();
  }

  /**
   * Obtiene usuarios VEP con paginación
   * @param page Número de página (opcional, por defecto 1)
   * @param limit Límite de resultados por página (opcional, por defecto 10)
   * @returns Usuarios paginados
   */
  @Get('paginated')
  async findPaginated(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    this.logger.log(`Fetching VEP users - page: ${page}, limit: ${limit}`);
    return await this.supabaseService.getVepUsersPaginated(page, limit);
  }

  /**
   * Busca usuarios VEP por criterios
   * @param term Término de búsqueda
   * @param field Campo específico para buscar (opcional)
   * @returns Lista de usuarios encontrados
   */
  @Get('search')
  async search(
    @Query('term') term: string,
    @Query('field') field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit',
  ) {
    this.logger.log(`Searching VEP users with term: ${term}, field: ${field || 'all'}`);
    return await this.supabaseService.searchVepUsers(term, field);
  }

  /**
   * Obtiene un usuario VEP por ID
   * @param id ID del usuario
   * @returns Usuario encontrado
   */
  @Get(':id')
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
}
