import {
    Body,
    Controller,
    Get,
    MessageEvent,
    Param,
    Post,
    Sse,
} from '@nestjs/common';
import { CoreService } from './core.service';
import { Observable, share } from 'rxjs';
import { TaskType } from './core.types';

@Controller('core')
export class CoreController {
    constructor(private readonly coreService: CoreService) {}

    @Sse('task/:id/stream')
    stream(@Param('id') id: string): Observable<MessageEvent> {
        return this.coreService.getChannel(id).pipe(share());
    }

    @Post('task')
    createTask(@Body('url') url: string, @Body('type') type: TaskType) {
        return this.coreService.createTask(url, type);
    }

    @Get('task/:id')
    getTask(@Param('id') id: string) {
        return this.coreService.getTask(id);
    }
}
