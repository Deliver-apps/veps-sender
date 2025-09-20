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
   * @param type Tipo de usuario a filtrar (opcional): 'autónomo' o 'credencial'
   * @returns Lista de usuarios encontrados
   */
  async searchVepUsers(
    searchTerm: string,
    field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit',
    type?: 'autónomo' | 'credencial' | 'monotributo'
  ): Promise<Database['public']['Tables']['vep_users']['Row'][]> {
    this.logger.log(`Searching VEP users with term: ${searchTerm}, field: ${field || 'all'}, type: ${type || 'all'}`);
    
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

    // Aplicar filtro por type si se especifica
    if (type && (type === 'autónomo' || type === 'credencial' || type === 'monotributo')) {
      query = query.eq('type', type);
    }

    const { data, error } = await query.order('real_name');

    if (error) {
      this.logger.error('Error searching VEP users:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Found ${data?.length || 0} users matching "${searchTerm}"${type ? ` with type "${type}"` : ''}`);
    return data || [];
  }

  /**
   * Obtiene usuarios VEP con paginación y filtros opcionales
   * @param page Número de página
   * @param limit Límite de resultados por página
   * @param searchTerm Término de búsqueda opcional (coincidencias parciales case-insensitive)
   * @param field Campo específico para buscar (opcional)
   * @param type Tipo de usuario a filtrar (opcional): 'autónomo' o 'credencial'
   * @returns Usuarios paginados
   */
  async getVepUsersPaginated(
    page: number = 1,
    limit: number = 10,
    searchTerm?: string,
    field?: 'real_name' | 'alter_name' | 'mobile_number' | 'cuit',
    type?: 'autónomo' | 'credencial' | 'monotributo'
  ): Promise<{
    data: Database['public']['Tables']['vep_users']['Row'][];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.logger.log(
      `Fetching VEP users - page: ${page}, limit: ${limit}, search: ${searchTerm || 'none'}, field: ${field || 'all'}, type: ${type || 'all'}`
    );
  
    const offset = (page - 1) * limit;
  
    /**
     * 🔧 Helper para construir la query con todos los filtros aplicados
     */
    const buildBaseQuery = () => {
      let query = this.supabase.from('vep_users').select('*');
  
      if (searchTerm) {
        const normalizedSearchTerm = searchTerm.toLowerCase();
  
        if (field) {
          query = query.ilike(field, `%${normalizedSearchTerm}%`);
        } else {
          query = query.or(
            `real_name.ilike.%${normalizedSearchTerm}%,` +
            `alter_name.ilike.%${normalizedSearchTerm}%,` +
            `mobile_number.ilike.%${normalizedSearchTerm}%,` +
            `cuit.ilike.%${normalizedSearchTerm}%`
          );
        }
      }
  
      if (type && (type === 'autónomo' || type === 'credencial' || type === 'monotributo')) {
        query = query.eq('type', type);
      }
  
      return query;
    };
  
    // 📊 Ejecutar queries en paralelo
    const [countResult, dataResult] = await Promise.all([
      buildBaseQuery()
        .select('*').limit(0), // ✅ solo count
    
      buildBaseQuery()
        .select('*')
        .order('real_name')
        .range(offset, offset + limit - 1),
    ]);
    
    if (countResult.error) {
      this.logger.error('Error counting VEP users:', countResult.error);
      throw new BadRequestException(countResult.error.toString());
    }
    
    if (dataResult.error) {
      this.logger.error('Error fetching paginated VEP users:', dataResult.error);
      throw new BadRequestException(dataResult.error.toString());
    }
    
    const total = countResult.count || 0;
    const totalPages = Math.ceil(total / limit);
    
    return {
      data: dataResult.data || [],
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Agrega un usuario asociado a un usuario VEP existente
   * @param userId ID del usuario principal
   * @param joinedUser Usuario a agregar
   * @returns Usuario actualizado
   */
  async addJoinedUser(
    userId: number,
    joinedUser: { name: string; cuit: string }
  ): Promise<Database['public']['Tables']['vep_users']['Row']> {
    this.logger.log(`Adding joined user to VEP user ${userId}: ${joinedUser.name}`);
    
    // Obtener el usuario actual
    const currentUser = await this.getVepUserById(userId);
    
    // Obtener usuarios asociados existentes
    let joinedUsers = currentUser.joined_users || [];
    if (typeof joinedUsers === 'string') {
      try {
        joinedUsers = JSON.parse(joinedUsers);
      } catch {
        joinedUsers = [];
      }
    }
    
    // Agregar el nuevo usuario
    joinedUsers.push(joinedUser);
    
    // Actualizar el usuario
    return await this.updateVepUser(userId, {
      joined_users: joinedUsers,
    });
  }

  /**
   * Elimina un usuario asociado de un usuario VEP
   * @param userId ID del usuario principal
   * @param joinedUserCuit CUIT del usuario a eliminar
   * @returns Usuario actualizado
   */
  async removeJoinedUser(
    userId: number,
    joinedUserCuit: string
  ): Promise<Database['public']['Tables']['vep_users']['Row']> {
    this.logger.log(`Removing joined user from VEP user ${userId}: ${joinedUserCuit}`);
    
    // Obtener el usuario actual
    const currentUser = await this.getVepUserById(userId);
    
    // Obtener usuarios asociados existentes
    let joinedUsers = currentUser.joined_users || [];
    if (typeof joinedUsers === 'string') {
      try {
        joinedUsers = JSON.parse(joinedUsers);
      } catch {
        joinedUsers = [];
      }
    }
    
    // Filtrar el usuario a eliminar
    const filteredUsers = joinedUsers.filter((user: any) => user.cuit !== joinedUserCuit);
    
    // Actualizar el usuario
    return await this.updateVepUser(userId, {
      joined_users: filteredUsers,
    });
  }

  /**
   * Obtiene todos los usuarios asociados de un usuario VEP
   * @param userId ID del usuario principal
   * @returns Lista de usuarios asociados
   */
  async getJoinedUsers(userId: number): Promise<{ name: string; cuit: string }[]> {
    this.logger.log(`Getting joined users for VEP user ${userId}`);
    
    const user = await this.getVepUserById(userId);
    
    if (!user.joined_users) {
      return [];
    }
    
    if (typeof user.joined_users === 'string') {
      try {
        return JSON.parse(user.joined_users);
      } catch {
        return [];
      }
    }
    
    return user.joined_users;
  }

  // ==================== JOB TIME CRUD METHODS ====================

  /**
   * Crea un nuevo job_time
   * @param jobTimeData Datos del job_time
   * @returns Job_time creado
   */
  async createJobTime(jobTimeData: Database['public']['Tables']['job_time']['Insert']): Promise<Database['public']['Tables']['job_time']['Row']> {
    this.logger.log('Creating new job_time');
    
    const { data, error } = await this.supabase
      .from('job_time')
      .insert(jobTimeData)
      .select()
      .single();

    if (error) {
      this.logger.error('Error creating job_time:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Job_time created with ID: ${data.id}`);
    return data;
  }

  /**
   * Obtiene todos los job_times
   * @returns Array de job_times
   */
  async getJobTimes(): Promise<Database['public']['Tables']['job_time']['Row'][]> {
    this.logger.log('Fetching all job_times');
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Error fetching job_times:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Found ${data?.length || 0} job_times`);
    return data || [];
  }

  /**
   * Obtiene un job_time por ID
   * @param id ID del job_time
   * @returns Job_time encontrado
   */
  async getJobTimeById(id: number): Promise<Database['public']['Tables']['job_time']['Row']> {
    this.logger.log(`Fetching job_time with ID: ${id}`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      this.logger.error('Error fetching job_time:', error);
      throw new BadRequestException(error.toString());
    }

    return data;
  }

  /**
   * Actualiza un job_time
   * @param id ID del job_time
   * @param updateData Datos a actualizar
   * @returns Job_time actualizado
   */
  async updateJobTime(id: number, updateData: Database['public']['Tables']['job_time']['Update']): Promise<Database['public']['Tables']['job_time']['Row']> {
    this.logger.log(`Updating job_time with ID: ${id}`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating job_time:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Job_time ${id} updated successfully`);
    return data;
  }

  /**
   * Elimina un job_time
   * @param id ID del job_time
   * @returns True si se eliminó correctamente
   */
  async deleteJobTime(id: number): Promise<boolean> {
    this.logger.log(`Deleting job_time with ID: ${id}`);
    
    const { error } = await this.supabase
      .from('job_time')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error('Error deleting job_time:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Job_time ${id} deleted successfully`);
    return true;
  }

  /**
   * Busca job_times por término de búsqueda
   * @param searchTerm Término de búsqueda
   * @param field Campo específico para buscar (opcional)
   * @param status Filtro por status (opcional)
   * @param type Filtro por type (opcional)
   * @returns Array de job_times encontrados
   */
  async searchJobTimes(
    searchTerm: string,
    field?: 'folder_name' | 'type' | 'status',
    status?: 'PENDING' | 'FINISHED',
    type?: 'autónomo' | 'credencial' | 'monotributo'
  ): Promise<Database['public']['Tables']['job_time']['Row'][]> {
    this.logger.log(`Searching job_times with term: ${searchTerm}, field: ${field || 'all'}, status: ${status || 'all'}, type: ${type || 'all'}`);
    
    let query = this.supabase.from('job_time').select('*');

    // Aplicar filtros de búsqueda si se especifican
    if (searchTerm) {
      const normalizedSearchTerm = searchTerm.toLowerCase();
      
      if (field) {
        // Búsqueda en campo específico con coincidencia parcial case-insensitive
        query = query.ilike(field, `%${normalizedSearchTerm}%`);
      } else {
        // Búsqueda en todos los campos con coincidencia parcial case-insensitive
        query = query.or(
          `folder_name.ilike.%${normalizedSearchTerm}%,` +
          `type.ilike.%${normalizedSearchTerm}%,` +
          `status.ilike.%${normalizedSearchTerm}%`
        );
      }
    }

    // Aplicar filtro por status si se especifica
    if (status && (status === 'PENDING' || status === 'FINISHED')) {
      query = query.eq('status', status);
    }

    // Aplicar filtro por type si se especifica
    if (type && (type === 'autónomo' || type === 'credencial' || type === 'monotributo')) {
      query = query.eq('type', type);
    }

    const { data, error } = await query
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Error searching job_times:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Found ${data?.length || 0} job_times matching search criteria`);
    return data || [];
  }

  /**
   * Obtiene job_times con paginación y filtros opcionales
   * @param page Número de página
   * @param limit Límite de resultados por página
   * @param searchTerm Término de búsqueda opcional
   * @param field Campo específico para buscar (opcional)
   * @param status Filtro por status (opcional)
   * @param type Filtro por type (opcional)
   * @returns Job_times paginados
   */
  async getJobTimesPaginated(
    page: number = 1,
    limit: number = 10,
    searchTerm?: string,
    field?: 'folder_name' | 'type' | 'status',
    status?: 'PENDING' | 'FINISHED',
    type?: 'autónomo' | 'credencial' | 'monotributo'
  ): Promise<{
    data: Database['public']['Tables']['job_time']['Row'][];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.logger.log(
      `Fetching job_times - page: ${page}, limit: ${limit}, search: ${searchTerm || 'none'}, field: ${field || 'all'}, status: ${status || 'all'}, type: ${type || 'all'}`
    );
    
    const offset = (page - 1) * limit;

    /**
     * 🔧 Helper para construir la query con todos los filtros aplicados
     */
    const buildBaseQuery = () => {
      let query = this.supabase.from('job_time').select('*');

      if (searchTerm) {
        const normalizedSearchTerm = searchTerm.toLowerCase();

        if (field) {
          query = query.ilike(field, `%${normalizedSearchTerm}%`);
        } else {
          query = query.or(
            `folder_name.ilike.%${normalizedSearchTerm}%,` +
            `type.ilike.%${normalizedSearchTerm}%,` +
            `status.ilike.%${normalizedSearchTerm}%`
          );
        }
      }

      if (status && (status === 'PENDING' || status === 'FINISHED')) {
        query = query.eq('status', status);
      }

      if (type && (type === 'autónomo' || type === 'credencial' || type === 'monotributo')) {
        query = query.eq('type', type);
      }

      return query;
    };

    // 📊 Ejecutar queries en paralelo
    const [countResult, dataResult] = await Promise.all([
      buildBaseQuery()
        .select('*').limit(0), // ✅ solo count
    
      buildBaseQuery()
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    ]);
    
    if (countResult.error) {
      this.logger.error('Error counting job_times:', countResult.error);
      throw new BadRequestException(countResult.error.toString());
    }
    
    if (dataResult.error) {
      this.logger.error('Error fetching paginated job_times:', dataResult.error);
      throw new BadRequestException(dataResult.error.toString());
    }
    
    const total = countResult.count || 0;
    const totalPages = Math.ceil(total / limit);
    
    return {
      data: dataResult.data || [],
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Obtiene jobs por status específico
   */
  async getJobTimesByStatus(status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR'): Promise<Database['public']['Tables']['job_time']['Row'][]> {
    this.logger.log(`Fetching job_times with status: ${status}`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Error fetching job_times by status:', error);
      throw new BadRequestException(error.toString());
    }

    return data || [];
  }

  /**
   * Obtiene jobs que deben ejecutarse en un rango de tiempo específico
   */
  async getJobTimesForExecution(
    startTime: string,
    endTime: string
  ): Promise<Database['public']['Tables']['job_time']['Row'][]> {
    this.logger.log(`Fetching job_times for execution between ${startTime} and ${endTime}`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('status', 'PENDING')
      .gte('execution_time', startTime)
      .lte('execution_time', endTime)
      .order('execution_time', { ascending: true });

    if (error) {
      this.logger.error('Error fetching job_times for execution:', error);
      throw new BadRequestException(error.toString());
    }

    return data || [];
  }

  /**
   * Actualiza el status de un job
   */
  async updateJobTimeStatus(
    id: number, 
    status: 'PENDING' | 'RUNNING' | 'FINISHED' | 'ERROR'
  ): Promise<Database['public']['Tables']['job_time']['Row']> {
    this.logger.log(`Updating job_time ${id} status to ${status}`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating job_time status:', error);
      throw new BadRequestException(error.toString());
    }

    return data;
  }

  /**
   * Obtiene estadísticas de jobs
   */
  async getJobTimeStats(): Promise<{
    total: number;
    pending: number;
    running: number;
    finished: number;
    error: number;
  }> {
    this.logger.log('Fetching job_time statistics');
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('status');

    if (error) {
      this.logger.error('Error fetching job_time stats:', error);
      throw new BadRequestException(error.toString());
    }

    const stats = {
      total: data?.length || 0,
      pending: data?.filter(job => job.status === 'PENDING').length || 0,
      running: data?.filter(job => job.status === 'RUNNING').length || 0,
      finished: data?.filter(job => job.status === 'FINISHED').length || 0,
      error: data?.filter(job => job.status === 'ERROR').length || 0,
    };

    this.logger.log('Job time statistics:', stats);
    return stats;
  }

  /**
   * Obtiene jobs por tipo de usuario
   */
  async getJobTimesByType(type: 'autónomo' | 'credencial' | 'monotributo'): Promise<Database['public']['Tables']['job_time']['Row'][]> {
    this.logger.log(`Fetching job_times with type: ${type}`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Error fetching job_times by type:', error);
      throw new BadRequestException(error.toString());
    }

    return data || [];
  }

  /**
   * Obtiene jobs que están listos para ejecutarse (PENDING y execution_time <= now)
   */
  async getReadyToExecuteJobs(): Promise<Database['public']['Tables']['job_time']['Row'][]> {
    const now = new Date().toISOString();
    this.logger.log(`Fetching ready to execute jobs (execution_time <= ${now})`);
    
    const { data, error } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('status', 'PENDING')
      .lte('execution_time', now)
      .order('execution_time', { ascending: true });

    if (error) {
      this.logger.error('Error fetching ready to execute jobs:', error);
      throw new BadRequestException(error.toString());
    }

    return data || [];
  }

  /**
   * Actualiza el campo 'sent' de usuarios específicos en un job_time
   */
  async updateJobTimeUserSent(
    jobId: number, 
    userIds: number[], 
    sent: boolean
  ): Promise<Database['public']['Tables']['job_time']['Row']> {
    this.logger.log(`Updating sent status for users ${userIds.join(', ')} in job ${jobId} to ${sent}`);
    
    // Obtener el job actual
    const { data: currentJob, error: fetchError } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError) {
      this.logger.error('Error fetching job:', fetchError);
      throw new BadRequestException(fetchError.toString());
    }

    if (!currentJob || !currentJob.users) {
      throw new BadRequestException('Job not found or has no users');
    }

    // Actualizar el campo 'sent' para los usuarios especificados
    const updatedUsers = currentJob.users.map(user => {
      if (userIds.includes(user.id)) {
        return { ...user, sent };
      }
      return user;
    });

    // Actualizar el job con los usuarios modificados
    const { data, error } = await this.supabase
      .from('job_time')
      .update({ users: updatedUsers })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating job users sent status:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Successfully updated sent status for ${userIds.length} users in job ${jobId}`);
    return data;
  }

  /**
   * Actualiza múltiples campos de usuarios específicos en un job_time
   */
  async updateJobTimeUsers(
    jobId: number, 
    userUpdates: Array<{
      userId: number;
      updates: Partial<{
        sent: boolean;
      }>;
    }>
  ): Promise<Database['public']['Tables']['job_time']['Row']> {
    this.logger.log(`Updating ${userUpdates.length} users in job ${jobId}`);
    
    // Obtener el job actual
    const { data: currentJob, error: fetchError } = await this.supabase
      .from('job_time')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError) {
      this.logger.error('Error fetching job:', fetchError);
      throw new BadRequestException(fetchError.toString());
    }

    if (!currentJob || !currentJob.users) {
      throw new BadRequestException('Job not found or has no users');
    }

    // Actualizar los usuarios especificados
    const updatedUsers = currentJob.users.map(user => {
      const userUpdate = userUpdates.find(update => update.userId === user.id);
      if (userUpdate) {
        return { ...user, ...userUpdate.updates };
      }
      return user;
    });

    // Actualizar el job con los usuarios modificados
    const { data, error } = await this.supabase
      .from('job_time')
      .update({ users: updatedUsers })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      this.logger.error('Error updating job users:', error);
      throw new BadRequestException(error.toString());
    }

    this.logger.log(`Successfully updated ${userUpdates.length} users in job ${jobId}`);
    return data;
  }
}
