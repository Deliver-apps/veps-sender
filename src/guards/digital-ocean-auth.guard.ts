import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase.service';

@Injectable()
export class DigitalOceanAuthGuard implements CanActivate {
  private readonly logger = new Logger('DigitalOcean-Auth-Guard');

  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    try {
      // Obtener el token de autorización del header
      const authHeader = request.headers.authorization;
      
      if (!authHeader) {
        this.logger.warn('No authorization header provided');
        throw new UnauthorizedException('Token de autorización requerido');
      }

      // Verificar formato del header (Bearer token o Basic auth)
      if (authHeader.startsWith('Bearer ')) {
        // Token Bearer (para futuras implementaciones con JWT)
        const token = authHeader.substring(7);
        return await this.validateBearerToken(token);
      } else if (authHeader.startsWith('Basic ')) {
        // Basic Auth (username:password en base64)
        const credentials = authHeader.substring(6);
        return await this.validateBasicAuth(credentials);
      } else {
        this.logger.warn('Invalid authorization header format');
        throw new UnauthorizedException('Formato de autorización inválido');
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error('Authentication error:', error);
      throw new UnauthorizedException('Error de autenticación');
    }
  }

  private async validateBearerToken(token: string): Promise<boolean> {
    try {
      // Usar el método verifyToken del SupabaseService que ya existe
      const result = await this.supabaseService.verifyToken(token);
      
      if (result && result.user) {
        this.logger.log(`Bearer token validated for user: ${result.user.id}`);
        return true;
      }
      
      this.logger.warn('Invalid bearer token - no user found');
      throw new UnauthorizedException('Token inválido');
    } catch (error) {
      this.logger.warn(`Bearer token validation failed: ${error.message}`);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private async validateBasicAuth(credentials: string): Promise<boolean> {
    try {
      // Decodificar credenciales base64
      const decoded = Buffer.from(credentials, 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');

      if (!username || !password) {
        this.logger.warn('Invalid basic auth credentials format');
        throw new UnauthorizedException('Formato de credenciales inválido');
      }

      // Validar credenciales usando SupabaseService
      await this.supabaseService.authenticateUser(username, password);
      
      this.logger.log(`User ${username} authenticated successfully`);
      return true;
    } catch (error) {
      this.logger.warn(`Basic auth failed: ${error.message}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }
  }
} 