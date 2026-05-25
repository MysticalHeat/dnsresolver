import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AdminGuard } from 'src/admin/admin.guard';

@Controller('agent')
export class AgentController {
    constructor(private readonly agentService: AgentService) {}

    @Post()
    @UseGuards(AdminGuard)
    createAgent() {
        return this.agentService.createAgent();
    }

    @Get('list')
    getAgentList() {
        return this.agentService.getAgentList();
    }
}
