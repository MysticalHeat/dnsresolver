import {
    BadRequestException,
    Inject,
    Injectable,
    MessageEvent,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { TaskType } from './core.types';
import amqplib from 'amqplib';
import { DrizzleAsyncProvider } from 'src/db/db.provider';
import { DB } from 'src/db/db.types';
import { agents, tasks, tasksToAgents } from 'src/db/db.schema';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import { Observable, Subject } from 'rxjs';
import { IpgeoService } from 'src/ipgeo/ipgeo.service';
import { Cron } from '@nestjs/schedule';
import axios, { AxiosInstance } from 'axios';
import dns from 'dns/promises';

import * as rmqConnectionsJson from './responses/rmq-connections.json';

@Injectable()
export class CoreService implements OnApplicationBootstrap {
    constructor(
        @Inject(DrizzleAsyncProvider) private readonly db: DB,
        private readonly ipgeoService: IpgeoService,
    ) {}

    private rmqChannel: amqplib.Channel;
    private rmqHttp: AxiosInstance;

    async onApplicationBootstrap() {
        this.rmqHttp = axios.create({
            baseURL:
                process.env.RABBITMQ_HTTP_URL || 'http://localhost:15672/api/',
        });

        const queue = `results`;
        const conn = await amqplib.connect(
            process.env.RABBITMQ_URL || 'amqp://localhost',
        );

        this.rmqChannel = await conn.createChannel();
        await this.rmqChannel.assertQueue(queue, {
            durable: true,
        });

        this.rmqChannel.consume(queue, async (msg) => {
            const content: {
                taskId: string;
                agentId: string;
                status: 'initialized' | 'completed' | 'failed';
                result?: any;
                body?: any;
            } = JSON.parse(msg!.content.toString());

            console.log(
                `Received result for task ${content.taskId}: ${JSON.stringify(
                    content.result,
                )}`,
            );

            const task = await this.db.query.tasks.findFirst({
                where: eq(tasks.id, content.taskId),
            });

            if (!task) {
                console.error(`Task ${content.taskId} not found`);
                this.rmqChannel.ack(msg!);
                return;
            }

            switch (content.status) {
                case 'initialized':
                    await this.db
                        .insert(tasksToAgents)
                        .values({
                            agentId: content.agentId,
                            taskId: content.taskId,
                            status: 'in_progress',
                        })
                        .onConflictDoNothing();

                    this.sendToChannel(
                        'main',
                        {
                            taskId: content.taskId,
                            agentId: content.agentId,
                            type: task.type,
                        },
                        'agent-initialized',
                    );

                    break;

                case 'completed':
                    await this.db
                        .update(tasksToAgents)
                        .set({
                            status: 'completed',
                            result: content.result,
                        })
                        .where(
                            and(
                                eq(tasksToAgents.taskId, content.taskId),
                                eq(tasksToAgents.agentId, content.agentId),
                            ),
                        );

                    this.sendToChannel(
                        'main',
                        {
                            taskId: content.taskId,
                            agentId: content.agentId,
                            result: content.result,
                            type: task.type,
                        },
                        'agent-completed',
                    );

                    break;

                case 'failed':
                    await this.db
                        .update(tasksToAgents)
                        .set({
                            status: 'failed',
                            result: content.body,
                        })
                        .where(
                            and(
                                eq(tasksToAgents.taskId, content.taskId),
                                eq(tasksToAgents.agentId, content.agentId),
                            ),
                        );

                    this.sendToChannel(
                        'main',
                        {
                            taskId: content.taskId,
                            agentId: content.agentId,
                            result: content.body,
                            type: task.type,
                        },
                        'agent-failed',
                    );

                    break;
            }

            this.rmqChannel.ack(msg!);
        });

        await this.rmqChannel.assertQueue('agent-status', { durable: true });

        await this.rmqChannel.consume('agent-status', async (msg) => {
            const content: {
                agentId: string;
                status: 'online' | 'offline';
                ip: string;
            } = JSON.parse(msg!.content.toString());

            if (content.ip === 'not resolved') {
                this.rmqChannel.ack(msg!);
                return;
            }

            const geo = await this.ipgeoService.getGeolocation(content.ip);

            await this.db
                .update(agents)
                .set({
                    status: content.status,
                    ip: content.ip,
                    location: `${geo.location.country_name}, ${geo.location.city}`,
                    webhookUrl: `http://${content.ip}:3000`,
                    lastSeenAt: new Date(),
                })
                .where(eq(agents.id, content.agentId));

            this.rmqChannel.ack(msg!);
        });
    }

    @Cron('0/15 * * * * *')
    async heartbeat() {
        const agentList = await this.db.query.agents.findMany();

        const rmqConnections =
            await this.rmqHttp.get<typeof rmqConnectionsJson>(`/connections`);

        for (const agent of agentList) {
            const isOnline = rmqConnections.data.find(
                (conn) => conn.user === agent.id,
            )
                ? true
                : false;

            const existingStatus = agent.status === 'online';

            if (existingStatus === false && isOnline === false) {
                continue;
            }

            await this.db
                .update(agents)
                .set({
                    status: isOnline ? 'online' : 'offline',
                    lastSeenAt: new Date(),
                })
                .where(eq(agents.id, agent.id));
        }
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

    async getTask(id: string) {
        const task = await this.db.query.tasks.findFirst({
            where: eq(tasks.id, id),
            with: {
                tasksToAgents: {
                    with: {
                        agent: true,
                    },
                },
            },
        });

        if (!task) {
            throw new BadRequestException('Task not found');
        }

        return task;
    }

    async createTask(url: string, type: TaskType) {
        if (url.startsWith('http') === false) url = 'https://' + url;
        let newUrl: URL;
        try {
            newUrl = new URL(url);
        } catch (error) {
            throw new BadRequestException('Invalid URL');
        }

        let host = newUrl.hostname;
        let port: string | number = newUrl.port;

        if (type === 'tcp-check' && !port) {
            port = 80;
        }

        if (type === 'http-check') {
            host = url;
        }

        const task = await this.db
            .insert(tasks)
            .values({ type, input: url })
            .returning({ id: tasks.id });

        this.rmqChannel.publish(
            'tasks',
            '',
            Buffer.from(
                JSON.stringify({
                    taskId: task[0].id,
                    type,
                    payload: { host, port, url, domain: host },
                }),
            ),
        );

        return {
            id: task[0].id,
        };
    }

    async geoHost(host: string) {
        if (host.startsWith('http') === false) host = 'https://' + host;
        try {
            new URL(host);
            const resp = await dns.lookup(new URL(host).hostname);
            return await this.ipgeoService.getGeolocation(resp.address);
        } catch (error) {
            throw new BadRequestException('Invalid host');
        }
    }

    async getTasksByAgent(agentId: string) {
        const tasksList = await this.db.query.tasksToAgents.findMany({
            where: eq(tasksToAgents.agentId, agentId),
            with: {
                agent: true,
                task: true,
            },
        });

        return tasksList;
    }

    async getDailyTaskCount(agentId: string) {
        const result = await this.db
            .select({
                count: count(),
            })
            .from(tasksToAgents)
            .where(
                and(
                    eq(tasksToAgents.agentId, agentId),
                    gt(
                        tasksToAgents.createdAt,
                        sql`NOW() - INTERVAL '24 hours'`,
                    ),
                ),
            );

        return {
            count: result[0].count,
        };
    }
}
