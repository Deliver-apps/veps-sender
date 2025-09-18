import { 
  Controller, 
  Logger, 
  Post, 
  Get,
  Body,
  BadRequestException,
  HttpStatus,
  HttpCode,
  UnauthorizedException,
  Param
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { Database } from '../supabase.types';
import { Session, User } from '@supabase/supabase-js';

// Interfaces para las respuestas
interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  session: Session;
  timestamp: string;
}

interface UserProfileResponse {
  user: User;
}

interface UsersListResponse {
  users: User[];
  totalCount: number;
}

interface TokenResponse {
  success: boolean;
  message: string;
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('Auth-Controller');

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Endpoint de login
   * @param loginData Datos de login (username y password)
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginData: LoginRequest): Promise<LoginResponse> {
    this.logger.log(`Login attempt for user: ${loginData.username}`);
    
    if (!loginData.username || !loginData.password) {
      throw new BadRequestException('Username y password son requeridos');
    }

    try {
      const session = await this.supabaseService.authenticateUser(
        loginData.username,
        loginData.password
      );

      return {
        success: true,
        message: 'Login exitoso',
        session,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`Login error for user ${loginData.username}:`, error);
      throw new BadRequestException('Error interno del servidor');
    }
  }

  // /**
  //  * Obtiene el perfil de un usuario por ID
  //  * @param userId ID del usuario
  //  */
  // @Get('profile/:userId')
  // async getUserProfile(@Param('userId') userId: string): Promise<UserProfileResponse> {
  //   this.logger.log(`Getting profile for user ID: ${userId}`);
    
  //   const userIdNum = parseInt(userId, 10);
  //   if (isNaN(userIdNum)) {
  //     throw new BadRequestException('ID de usuario debe ser un número válido');
  //   }

  //   try {
  //     const user = await this.supabaseService.getUserById(userIdNum);

  //     // No devolver la contraseña en la respuesta
  //     return {
  //       user: user
  //     };
  //   } catch (error) {
  //     this.logger.error(`Error getting profile for user ${userId}:`, error);
  //     throw error;
  //   }
  // }

  /**
   * Lista todos los usuarios (sin contraseñas)
   */
  // @Get('users')
  // async getAllUsers(): Promise<UsersListResponse> {
  //   this.logger.log('Getting all users list');
    
  //   try {
  //     const users = await this.supabaseService.getAllAfipUsers();

  //     // Mapear usuarios sin incluir contraseñas
  //     const usersResponse = users.map(user => ({
  //       id: user.id,
  //       username: user.username,
  //       real_name: user.real_name,
  //       is_company: user.is_company,
  //       company_name: user.company_name,
  //       cuit_company: user.cuit_company,
  //       automatic: user.automatic
  //     }));

  //     return {
  //       users: usersResponse,
  //       totalCount: usersResponse.length
  //     };
  //   } catch (error) {
  //     this.logger.error('Error getting users list:', error);
  //     throw error;
  //   }
  // }

  /**
   * Endpoint de validación de credenciales (sin crear sesión)
   * @param loginData Datos de login (username y password)
   */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateCredentials(@Body() loginData: LoginRequest): Promise<{ valid: boolean; message: string }> {
    this.logger.log(`Validating credentials for user: ${loginData.username}`);
    
    if (!loginData.username || !loginData.password) {
      throw new BadRequestException('Username y password son requeridos');
    }

    try {
      await this.supabaseService.authenticateUser(
        loginData.username,
        loginData.password
      );

      return {
        valid: true,
        message: 'Credenciales válidas'
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return {
          valid: false,
          message: 'Credenciales inválidas'
        };
      }
      
      this.logger.error(`Validation error for user ${loginData.username}:`, error);
      throw new BadRequestException('Error interno del servidor');
    }
  }
} 