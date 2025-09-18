import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createClient, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { Database } from './supabase.types';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient<Database>;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('supabase.url');
    const supabaseKey = this.configService.get<string>('supabase.key');

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getVepUsers(): Promise<
    Database['public']['Tables']['vep_users']['Row'][]
  > {
    const { data, error } = await this.supabase.from('vep_users').select('*');
    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
    return data;
  }

  async updateVepUserLastExecution(
    userId: number,
    lastExecution: string,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('vep_users')
      .update({ last_execution: lastExecution })
      .eq('id', userId);

    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }

  async getThisMonthNotSentUsers(): Promise<
    Database['public']['Tables']['vep_users']['Row'][]
  > {
    const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11
    const { data, error } = await this.supabase
      .from('vep_users')
      .select('*')
      .eq('last_execution', null)
      .or(`last_execution.is.null,last_execution.eq.${currentMonth}`);
    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
    return data;
  }

  async verifyToken(token: string): Promise<{
    user: User;
  }> {
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }

    if (data.user === null) {
      throw new BadRequestException('Token no valido');
    }

    return data;
  }

  /**
   * Autentica un usuario usando username y password
   * @param username Nombre de usuario
   * @param password Contraseña
   * @returns Usuario autenticado
   */
  async authenticateUser(
    username: string,
    password: string,
  ): Promise<Session> {
    this.logger.log(`Attempting to authenticate user2: ${username}`);
    this.logger.log(username, password, "Puto");
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: username,
      password: password,
    });
    this.logger.log(data, error, "Puto");
    if (error) {
      this.logger.error(`Authentication error for user ${username}:`, error);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!data) {
      this.logger.warn(`User not found: ${username}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    this.logger.log(`User authenticated successfully: ${username}`);
    return data.session;
  }

  /**
   * Obtiene un usuario por ID
   * @param userId ID del usuario
   * @returns Usuario encontrado
   */
  async getUserById(
    userId: number,
  ): Promise<Database['public']['Tables']['afip_users']['Row']> {
    const { data, error } = await this.supabase
      .from('afip_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      this.logger.error(`Error fetching user by ID ${userId}:`, error);
      throw new BadRequestException(error.toString());
    }

    if (!data) {
      throw new BadRequestException(`Usuario con ID ${userId} no encontrado`);
    }

    return data;
  }

  /**
   * Obtiene todos los usuarios de AFIP
   * @returns Lista de usuarios
   */
  async getAllAfipUsers(): Promise<Database['public']['Tables']['afip_users']['Row'][]> {
    const { data, error } = await this.supabase
      .from('afip_users')
      .select('*')
      .order('username');

    if (error) {
      this.logger.error('Error fetching all AFIP users:', error);
      throw new BadRequestException(error.toString());
    }

    return data || [];
  }

  // ========== VEP USERS CRUD METHODS ==========

  /**
   * Crea un nuevo usuario VEP
   * @param userData Datos del usuario a crear
   * @returns Usuario creado
   */
  async createVepUser(
    userData: Database['public']['Tables']['vep_users']['Insert']
  ): Promise<Database['public']['Tables']['vep_users']['Row']> {
    this.logger.log(`Creating new VEP user: ${userData.real_name}`);
    
    const { data, error } = await this.supabase
      .from('vep_users')
      .insert(userData)
      .select()
      .single();

    if (error) {
      this.logger.error('Error creating VEP user:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`VEP user created successfully with ID: ${data.id}`);
    return data;
  }

  /**
   * Obtiene un usuario VEP por ID
   * @param userId ID del usuario
   * @returns Usuario encontrado
   */
  async getVepUserById(
    userId: number
  ): Promise<Database['public']['Tables']['vep_users']['Row']> {
    this.logger.log(`Fetching VEP user by ID: ${userId}`);
    
    const { data, error } = await this.supabase
      .from('vep_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      this.logger.error(`Error fetching VEP user by ID ${userId}:`, error);
      throw new BadRequestException(error.toString());
    }

    if (!data) {
      throw new BadRequestException(`Usuario VEP con ID ${userId} no encontrado`);
    }

    return data;
  }

  /**
   * Actualiza un usuario VEP
   * @param userId ID del usuario
   * @param userData Datos a actualizar
   * @returns Usuario actualizado
   */
  async updateVepUser(
    userId: number,
    userData: Database['public']['Tables']['vep_users']['Update']
  ): Promise<Database['public']['Tables']['vep_users']['Row']> {
    this.logger.log(`Updating VEP user with ID: ${userId}`);
    
    const { data, error } = await this.supabase
      .from('vep_users')
      .update(userData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      this.logger.error(`Error updating VEP user ${userId}:`, error);
      throw new BadRequestException(error.toString());
    }

    if (!data) {
      throw new BadRequestException(`Usuario VEP con ID ${userId} no encontrado`);
    }

    this.logger.log(`VEP user ${userId} updated successfully`);
    return data;
  }

  /**
   * Elimina un usuario VEP
   * @param userId ID del usuario
   * @returns Confirmación de eliminación
   */
  async deleteVepUser(userId: number): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Deleting VEP user with ID: ${userId}`);
    
    const { error } = await this.supabase
      .from('vep_users')
      .delete()
      .eq('id', userId);

    if (error) {
      this.logger.error(`Error deleting VEP user ${userId}:`, error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`VEP user ${userId} deleted successfully`);
    return {
      success: true,
      message: `Usuario VEP con ID ${userId} eliminado exitosamente`
    };
  }

  /**
   * Busca usuarios VEP por criterios con coincidencias parciales case-insensitive
   * @param searchTerm Término de búsqueda (ej: "CaR" matchea con "carlos", "CarlOS", etc.)
   * @param field Campo específico para buscar (opcional)
   * @returns Lista de usuarios encontrados
   */
  async searchVepUsers(
    searchTerm: string,
    field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit'
  ): Promise<Database['public']['Tables']['vep_users']['Row'][]> {
    this.logger.log(`Searching VEP users with term: ${searchTerm}, field: ${field || 'all'}`);
    
    // Normalizar el término de búsqueda para hacer la búsqueda case-insensitive
    const normalizedSearchTerm = searchTerm.toLowerCase();
    
    let query = this.supabase.from('vep_users').select('*');

    if (field) {
      // Búsqueda en campo específico con coincidencia parcial case-insensitive
      query = query.ilike(field, `%${normalizedSearchTerm}%`);
    } else {
      // Búsqueda en todos los campos con coincidencia parcial case-insensitive
      query = query.or(
        `real_name.ilike.%${normalizedSearchTerm}%,` +
        `alter_name.ilike.%${normalizedSearchTerm}%,` +
        `mobile_number.ilike.%${normalizedSearchTerm}%,` +
        `cuit.ilike.%${normalizedSearchTerm}%`
      );
    }

    const { data, error } = await query.order('real_name');

    if (error) {
      this.logger.error('Error searching VEP users:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Found ${data?.length || 0} users matching "${searchTerm}"`);
    return data || [];
  }

  /**
   * Obtiene usuarios VEP con paginación
   * @param page Número de página
   * @param limit Límite de resultados por página
   * @returns Usuarios paginados
   */
  async getVepUsersPaginated(
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: Database['public']['Tables']['vep_users']['Row'][];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.logger.log(`Fetching VEP users - page: ${page}, limit: ${limit}`);
    
    const offset = (page - 1) * limit;

    // Obtener total de registros
    const { count, error: countError } = await this.supabase
      .from('vep_users')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      this.logger.error('Error counting VEP users:', countError);
      throw new BadRequestException(countError.toString());
    }

    // Obtener datos paginados
    const { data, error } = await this.supabase
      .from('vep_users')
      .select('*')
      .order('real_name')
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error('Error fetching paginated VEP users:', error);
      throw new BadRequestException(error.toString());
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data: data || [],
      total,
      page,
      limit,
      totalPages
    };
  }
}
