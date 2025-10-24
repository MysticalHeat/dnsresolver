import { Body, Controller, Post } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
    constructor(private readonly tasksService: TasksService) {}

    @Post('http-check')
    httpCheck(@Body('url') url: string) {
        return this.tasksService.httpCheck(url);
    }

    @Post('ping')
    ping(@Body('url') url: string) {
        return this.tasksService.ping(url);
    }

    @Post('tcp-check')
    tcpCheck(@Body('host') host: string, @Body('port') port: number) {
        return this.tasksService.tcpCheck(host, port);
    }

    @Post('dns-lookup')
    dnsLookup(@Body('domain') domain: string) {
        return this.tasksService.dnsLookup(domain);
    }

    @Post('traceroute')
    traceroute(@Body('host') host: string) {
        return this.tasksService.traceroute(host);
    }
}
