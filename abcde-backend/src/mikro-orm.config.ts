import { MikroOrmModuleOptions as Options } from '@mikro-orm/nestjs';

const config: Options = {
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '123',
  dbName: 'abcde',
  entities: ['dist/**/*.entity.js'],
  entitiesTs: ['src/**/*.entity.ts'],
  debug: true,
  migrations: {
    path: 'dist/src/migrations',
    pathTs: 'src/migrations',
  },
};

export default config;
