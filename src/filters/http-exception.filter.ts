import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno del servidor';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = this.translateMessage(exceptionResponse);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as any;
        message = this.translateMessage(responseObj.message || exception.message);
        error = responseObj.error || exception.name;
      } else {
        message = this.translateMessage(exception.message);
      }
    } else if (exception instanceof Error) {
      message = this.translateMessage(exception.message);
      error = exception.name;
    }

    // Log del error
    this.logger.error(
      `Error ${status} en ${request.method} ${request.url}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Respuesta en español
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
      error: error,
    };

    response.status(status).json(errorResponse);
  }

  private translateMessage(message: string | string[]): string {
    if (Array.isArray(message)) {
      return message.map(msg => this.translateMessage(msg)).join(', ');
    }

    const translations: { [key: string]: string } = {
      'Bad Request': 'Solicitud incorrecta',
      'Unauthorized': 'No autorizado',
      'Forbidden': 'Acceso prohibido',
      'Not Found': 'No encontrado',
      'Method Not Allowed': 'Método no permitido',
      'Conflict': 'Conflicto',
      'Unprocessable Entity': 'Entidad no procesable',
      'Internal Server Error': 'Error interno del servidor',
      'Bad Gateway': 'Puerta de enlace incorrecta',
      'Service Unavailable': 'Servicio no disponible',
      'Gateway Timeout': 'Tiempo de espera agotado',
      'Validation failed': 'Validación fallida',
      'Invalid input': 'Entrada inválida',
      'Resource not found': 'Recurso no encontrado',
      'Access denied': 'Acceso denegado',
      'Authentication required': 'Autenticación requerida',
      'Invalid credentials': 'Credenciales inválidas',
      'Token expired': 'Token expirado',
      'User not found': 'Usuario no encontrado',
      'Email already exists': 'El email ya existe',
      'Invalid email format': 'Formato de email inválido',
      'Password too weak': 'Contraseña muy débil',
      'Phone number invalid': 'Número de teléfono inválido',
      'CUIT invalid': 'CUIT inválido',
      'Required field missing': 'Campo requerido faltante',
      'Invalid date format': 'Formato de fecha inválido',
      'File too large': 'Archivo muy grande',
      'Invalid file type': 'Tipo de archivo inválido',
      'Rate limit exceeded': 'Límite de velocidad excedido',
      'Database connection failed': 'Error de conexión a la base de datos',
      'External service unavailable': 'Servicio externo no disponible',
    };

    // Buscar traducción exacta
    if (translations[message]) {
      return translations[message];
    }

    // Buscar traducciones parciales
    for (const [key, translation] of Object.entries(translations)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        return message.replace(new RegExp(key, 'gi'), translation);
      }
    }

    return message;
  }
}
