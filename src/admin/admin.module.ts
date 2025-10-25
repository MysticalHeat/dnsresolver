import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AgentModule } from 'src/agent/agent.module';

@Module({
    imports: [AgentModule],
    providers: [AdminService],
    controllers: [AdminController],
})
export class AdminModule {}
