import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { DbModule } from './db/db.module';
import { AgentModule } from './agent/agent.module';
import { IpgeoModule } from './ipgeo/ipgeo.module';
import { ScheduleModule } from '@nestjs/schedule';
@Module({
    imports: [
        ScheduleModule.forRoot(),
        ConfigModule.forRoot({ isGlobal: true }),
        CoreModule,
        DbModule,
        AgentModule,
        IpgeoModule,
    ],
})
export class AppModule {}
