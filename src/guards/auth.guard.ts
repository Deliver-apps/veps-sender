import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SupabaseService } from 'src/supabase.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers['authorization'];

    // 1. Check if header exists
    if (!authorization) {
      throw new HttpException(
        'Authorization header missing',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 2. Validate the token (example for Bearer token)
    const token = authorization.replace('Bearer ', '');
    if (!token) {
      throw new HttpException('Invalid token format', HttpStatus.UNAUTHORIZED);
    }

    // 3. Add any token verification logic here (JWT, custom check, etc.)
    // if invalid => throw an error
    this.supabaseService.verifyToken(token).catch((error) => {
      throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
    });

    return true; // if valid
  }
}
