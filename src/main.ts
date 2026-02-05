import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Configurar CORS
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    origin: [
      'https://veps-frontend-production.up.railway.app',
      'http://localhost:3001',
      'https://veps-sender-production.up.railway.app', // Para que Swagger UI funcione
      'http://localhost:3000', // Para desarrollo local
    ],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });

  // Configurar validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Configurar filtro de excepciones global
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configurar Swagger
  const config = new DocumentBuilder()
    .setTitle('VEP Sender API')
    .setDescription(
      'API para la gestión de usuarios VEP y job times con integración a Digital Ocean y Supabase',
    )
    .setVersion('1.0.0')
    .addTag('VEP Users', 'Gestión de usuarios VEP')
    .addTag('Job Time', 'Gestión de job times y ejecuciones')
    .addTag('Digital Ocean', 'Integración con Digital Ocean Spaces')
    .addTag('Auth', 'Autenticación y autorización')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Token JWT para autenticación',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key para autenticación con Digital Ocean',
      },
      'DigitalOcean-auth',
    )
    .addServer('http://localhost:3000', 'Servidor de desarrollo')
    .addServer(
      'https://veps-sender-production.up.railway.app',
      'Servidor de producción',
    )
    .build();

  const document = SwaggerModule.createDocument(app as any, config);

  // Configurar Swagger UI con autenticación
  const swaggerOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showRequestHeaders: true,
      tryItOutEnabled: true,
    },
    customSiteTitle: 'VEP Sender API Documentation',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { color: #3b82f6; }
      .swagger-ui .scheme-container { background: #f8fafc; padding: 10px; border-radius: 4px; }
    `,
  };

  SwaggerModule.setup('api/docs', app as any, document, swaggerOptions);

  // Configurar endpoint de salud
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Aplicación ejecutándose en: http://localhost:${port}`);
  console.log(`📚 Documentación Swagger: http://localhost:${port}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${port}/health`);
}
bootstrap();
