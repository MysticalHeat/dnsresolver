import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './db.schema';

export const DrizzleAsyncProvider = 'DrizzleAsyncProvider';

export const DrizzleProvider: Provider = {
    provide: DrizzleAsyncProvider,
    inject: [ConfigService],
    useFactory: async (configService: ConfigService) => {
        const connectionString = configService.get<string>('DATABASE_URL');
        if (!connectionString) {
            throw new Error('DATABASE_URL is not defined in the configuration');
        }
        return drizzle({
            connection: connectionString,
            casing: 'snake_case',
            schema: schema,
        });
    },
};
