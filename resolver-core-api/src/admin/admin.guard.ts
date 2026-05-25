import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const jwt = request.cookies['jwt'] as string;

        if (!jwt) {
            throw new UnauthorizedException('JWT token is missing');
        }

        try {
            const user = await this.jwtService.verifyAsync(jwt);

            request['user'] = user;
        } catch {
            throw new UnauthorizedException('Unsuccessful JWT validating');
        }

        return true;
    }
}
