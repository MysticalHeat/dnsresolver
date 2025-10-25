import {
    Body,
    Controller,
    Get,
    MessageEvent,
    Param,
    Post,
    Query,
    Sse,
} from '@nestjs/common';
import { CoreService } from './core.service';
import { Observable, share } from 'rxjs';
import { TaskType } from './core.types';

@Controller('core')
export class CoreController {
    constructor(private readonly coreService: CoreService) {}

    @Sse('task/stream')
    stream(): Observable<MessageEvent> {
        return this.coreService.getChannel('main').pipe(share());
    }

    @Post('task')
    createTask(@Body('url') url: string, @Body('type') type: TaskType) {
        return this.coreService.createTask(url, type);
    }

    @Get('task/list')
    getTasksByAgent(@Query('agentId') agentId: string) {
        return this.coreService.getTasksByAgent(agentId);
    }

    @Get('task/daily-stats')
    getDailyStats(@Query('agentId') agentId: string) {
        return this.coreService.getDailyTaskCount(agentId);
    }

    @Get('task/:id')
    getTask(@Param('id') id: string) {
        return this.coreService.getTask(id);
    }

    @Get('heartbeat')
    heartbeat() {
        return this.coreService.heartbeat();
    }

    @Get('host-geo')
    getHostGeo(@Query('host') host: string) {
        return this.coreService.geoHost(host);
    }
}
