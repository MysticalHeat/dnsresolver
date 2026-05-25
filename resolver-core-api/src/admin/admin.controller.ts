import {
    Body,
    Controller,
    Get,
    MessageEvent,
    Post,
    Query,
    Res,
    Sse,
    UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { Response } from 'express';
import { Observable, share } from 'rxjs';
import { AdminGuard } from './admin.guard';

@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Post('hash-password')
    hashPassword(@Body('password') password: string) {
        return this.adminService.hashPassword(password);
    }

    @Post('login')
    async login(
        @Body('login') login: string,
        @Body('password') password: string,
        @Res({ passthrough: true }) res: Response,
    ) {
        const jwt = await this.adminService.login(login, password);
        res.cookie('jwt', jwt, {
            httpOnly: true,
        });
    }

    @UseGuards(AdminGuard)
    @Post('deploy-agent')
    deployAgent(@Body('ip') ip: string, @Body('user') user: string) {
        return this.adminService.deployAgent(ip, user);
    }

    @UseGuards(AdminGuard)
    @Sse('deploy-agent/stream')
    stream(@Query('ip') ip: string): Observable<MessageEvent> {
        return this.adminService.getChannel(`deploy-agent:${ip}`).pipe(share());
    }

    @UseGuards(AdminGuard)
    @Get('ssh-key')
    getSshKey() {
        return this.adminService.getSshKey();
    }
}
