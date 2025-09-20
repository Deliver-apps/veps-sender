import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class SwaggerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Obtener credenciales de variables de entorno
    const swaggerUser = process.env.SWAGGER_USER || 'admin';
    const swaggerPassword = process.env.SWAGGER_PASSWORD || 'admin123';
    
    // Verificar si es local (desarrollo)
    const isLocal = process.env.NODE_ENV === 'development' || 
                   process.env.NODE_ENV === 'local' || 
                   request.hostname === 'localhost' || 
                   request.hostname === '127.0.0.1';
    
    // Si es local, permitir acceso sin autenticación
    if (isLocal) {
      return true;
    }
    
    // Para entornos no locales, verificar autenticación básica
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      this.sendAuthRequired(response);
      return false;
    }
    
    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');
      
      if (username === swaggerUser && password === swaggerPassword) {
        return true;
      }
      
      this.sendAuthRequired(response);
      return false;
    } catch (error) {
      this.sendAuthRequired(response);
      return false;
    }
  }
  
  private sendAuthRequired(response: Response): void {
    response.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
    response.status(401).json({
      message: 'Acceso no autorizado. Se requieren credenciales para acceder a la documentación de Swagger.',
      error: 'Unauthorized',
      statusCode: 401
    });
  }
}
