import {
    BadRequestException,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { DrizzleAsyncProvider } from 'src/db/db.provider';
import { DB } from 'src/db/db.types';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { admin } from 'src/db/db.schema';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminService {
    constructor(
        @Inject(DrizzleAsyncProvider) private readonly db: DB,
        private readonly jwtService: JwtService,
    ) {}

    async hashPassword(password: string) {
        const hashedPassword = await bcrypt.hash(
            password,
            await bcrypt.genSalt(),
        );
        return {
            hashedPassword,
        };
    }

    async login(login: string, password: string) {
        const existingAdmin = await this.db.query.admin.findFirst({
            where: eq(admin.login, login),
        });

        if (!existingAdmin) {
            throw new BadRequestException('Admin doesnot exist');
        }

        const result = await bcrypt.compare(
            password,
            existingAdmin.passwordHash,
        );

        if (!result) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return this.jwtService.signAsync(
            { login: existingAdmin.login },
            {
                expiresIn: '10h',
            },
        );
    }
}
