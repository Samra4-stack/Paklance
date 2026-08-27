import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

let cachedApp: any = null;

async function bootstrap(): Promise<any> {
  if (cachedApp) return cachedApp;

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Setup Swagger (works in serverless because swagger-ui assets are in node_modules)
  const config = new DocumentBuilder()
    .setTitle('Paklance API')
    .setDescription('Paklance Freelance Marketplace API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.init();
  cachedApp = app.getHttpAdapter().getInstance();
  return cachedApp;
}

// CommonJS export for Vercel serverless runtime
module.exports = async (req: any, res: any) => {
  const expressApp = await bootstrap();
  expressApp(req, res);
};
