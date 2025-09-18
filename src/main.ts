import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  //enable cors to https://veps-frontend-production.up.railway.app
  app.enableCors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    origin: ['https://veps-frontend-production.up.railway.app', 'http://localhost:3001'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
