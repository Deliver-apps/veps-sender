import { Controller, Get, UseGuards, Req, Res } from '@nestjs/common';
import { SwaggerAuthGuard } from './guards/swagger-auth.guard';
import { Request, Response } from 'express';

@Controller('api/docs')
@UseGuards(SwaggerAuthGuard)
export class SwaggerController {
  @Get()
  getSwagger(@Req() req: Request, @Res() res: Response) {
    // Redirigir a la documentación de Swagger
    res.redirect('/api/docs/');
  }
}
