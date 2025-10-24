import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config({
    path: '.env',
});

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/db.schema.ts',
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
    casing: 'snake_case',
});
