import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { DbModule } from './db/db.module';
@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule, DbModule],
})
export class AppModule {}
