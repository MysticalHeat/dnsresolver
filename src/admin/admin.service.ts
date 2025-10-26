import {
    BadRequestException,
    Inject,
    Injectable,
    MessageEvent,
    UnauthorizedException,
} from '@nestjs/common';
import { DrizzleAsyncProvider } from 'src/db/db.provider';
import { DB } from 'src/db/db.types';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { admin } from 'src/db/db.schema';
import { JwtService } from '@nestjs/jwt';
import Ansible from 'node-ansible';
import { AgentService } from 'src/agent/agent.service';
import { Observable, Subject } from 'rxjs';
import { readFile } from 'fs/promises';

@Injectable()
export class AdminService {
    constructor(
        @Inject(DrizzleAsyncProvider) private readonly db: DB,
        private readonly jwtService: JwtService,
        private readonly agentService: AgentService,
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
            throw new BadRequestException('Admin does not exist');
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
    private channels = new Map<string, Subject<MessageEvent>>();

    getChannel(name: string): Observable<MessageEvent> {
        if (!this.channels.has(name)) {
            this.channels.set(name, new Subject<MessageEvent>());
        }
        return this.channels.get(name)!.asObservable();
    }

    sendToChannel(name: string, data: any, type?: string) {
        const subject = this.channels.get(name);
        if (subject) {
            subject.next({ data, type });
        }
    }

    async deployAgent(ip: string, user: string) {
        const agent = await this.agentService.createAgent();

        const command = new Ansible.Playbook()
            .playbook('deploy-agent')
            .variables({
                docker_password: process.env.PAT_TOKEN,
                access_key: agent.accessKey,
                access_secret: agent.accessSecret,
                user,
                rabbitmq_host:
                    process.env.RABBITMQ_EXTERNAL_HOST || 'localhost:5672',
                agent_image: process.env.AGENT_IMAGE || 'resolver/agent:latest',
            });

        command.on('stdout', (data) => {
            console.log(data.toString());
            this.sendToChannel(`deploy-agent:${ip}`, data.toString());
        });

        command.on('stderr', (data) => {
            console.log(data.toString());
            this.sendToChannel(`deploy-agent:${ip}`, data.toString());
        });

        command.inventory(`${ip},`).user(user).exec({
            cwd: './playbooks',
        });
    }

    async getSshKey() {
        const key = await readFile(process.env.SSH_KEY_PATH!, 'utf-8');
        return {
            key,
        };
    }
}
