import { Controller, Get, Post } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
    constructor(private readonly agentService: AgentService) {}

    @Post()
    createAgent() {
        return this.agentService.createAgent();
    }

    @Get('list')
    getAgentList() {
        return this.agentService.getAgentList();
    }
}
