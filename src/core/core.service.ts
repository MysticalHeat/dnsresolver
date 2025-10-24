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
import { and, eq } from 'drizzle-orm';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class CoreService implements OnApplicationBootstrap {
    constructor(@Inject(DrizzleAsyncProvider) private readonly db: DB) {}

    private rmqChannel: amqplib.Channel;

    async onApplicationBootstrap() {
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
                        content.taskId,
                        { agentId: content.agentId, type: task.type },
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
                        content.taskId,
                        {
                            agentId: content.agentId,
                            result: content.result,
                            type: task.type,
                        },
                        'agent-completed',
                    );

                    break;
            }

            this.rmqChannel.ack(msg!);
        });
    }

    private channels = new Map<string, Subject<MessageEvent>>();

    getChannel(taskId: string): Observable<MessageEvent> {
        if (!this.channels.has(taskId)) {
            this.channels.set(taskId, new Subject<MessageEvent>());
        }
        return this.channels.get(taskId)!.asObservable();
    }

    sendToChannel(taskId: string, data: any, type?: string) {
        const subject = this.channels.get(taskId);
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
}
