import { Body, Controller, Post, Res } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Response } from 'express';

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
}
