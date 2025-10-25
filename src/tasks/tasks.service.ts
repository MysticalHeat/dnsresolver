import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import axios from 'axios';
import ping from 'ping';
import net from 'net';
import dns from 'dns/promises';
import traceroute from 'traceroute';
import amqplib from 'amqplib';

@Injectable()
export class TasksService implements OnApplicationBootstrap {
    async onApplicationBootstrap() {
        const accessKey = process.env.ACCESS_KEY;
        const accessSecret = process.env.ACCESS_SECRET;

        const queue = `tasks:${accessKey || 'default'}`;
        const conn = await amqplib.connect(
            `amqp://${accessKey}:${accessSecret}@${process.env.RABBITMQ_HOST}` ||
                'amqp://localhost',
        );

        const ch = await conn.createChannel();

        const ip = await axios
            .get<string>('https://api.ipify.org')
            .then((res) => res.data)
            .catch(() => 'not resolved');

        ch.sendToQueue(
            'agent-status',
            Buffer.from(
                JSON.stringify({
                    ip,
                    agentId: accessKey,
                    status: 'online',
                }),
            ),
        );

        await ch.assertExchange('tasks', 'fanout', { durable: true });
        await ch.assertQueue(queue, {
            durable: true,
        });
        await ch.bindQueue(queue, 'tasks', '');

        ch.prefetch(5);

        ch.consume(queue, async (msg) => {
            const content: {
                taskId: string;
                type:
                    | 'http-check'
                    | 'ping'
                    | 'tcp-check'
                    | 'dns-lookup'
                    | 'traceroute';
                payload: any;
            } = JSON.parse(msg!.content.toString());

            ch.sendToQueue(
                'results',
                Buffer.from(
                    JSON.stringify({
                        agentId: process.env.ACCESS_KEY,
                        status: 'initialized',
                        taskId: content.taskId,
                    }),
                ),
            );

            let result;
            switch (content.type) {
                case 'http-check':
                    result = await this.httpCheck(content.payload.url);
                    break;
                case 'ping':
                    result = await this.ping(content.payload.host);
                    break;
                case 'tcp-check':
                    result = await this.tcpCheck(
                        content.payload.host,
                        content.payload.port,
                    );
                    break;
                case 'dns-lookup':
                    result = await this.dnsLookup(content.payload.domain);
                    break;
                case 'traceroute':
                    result = await this.traceroute(content.payload.host);
                    break;
            }

            console.log(
                `Processed task ${content.type} with payload ${JSON.stringify(
                    content.payload,
                )}: ${JSON.stringify(result)}`,
            );

            ch.ack(msg!);
            ch.sendToQueue(
                'results',
                Buffer.from(
                    JSON.stringify({
                        agentId: process.env.ACCESS_KEY,
                        result,
                        status: 'completed',
                        taskId: content.taskId,
                    }),
                ),
            );
        });
    }

    async httpCheck(url: string) {
        const time = new Date();
        try {
            const response = await axios.get(url);
            const responseTime = +new Date() - +time;

            return {
                status: response.status + ' ' + response.statusText,
                responseTime: responseTime + 'ms',
                headers: response.headers as Record<string, string | string[]>,
                ip: response.request?.socket?.remoteAddress,
            };
        } catch (err) {
            return {
                status: 'failed',
                body: err instanceof Error ? err.message : String(err),
            };
        }
    }

    async ping(host: string) {
        try {
            const response = await ping.promise.probe(host, {
                timeout: 10,
                extra: ['-c', '5'],
            });

            return {
                result: response,
                ip: response.numeric_host,
            };
        } catch (err) {
            return {
                status: 'failed',
                body: err instanceof Error ? err.message : String(err),
            };
        }
    }

    async tcpCheck(host: string, port: number) {
        const time = new Date();
        try {
            const response = await new Promise<string | undefined>(
                (resolve, reject) => {
                    const client = net.createConnection({ host, port }, () => {
                        client.end();
                        resolve(client.remoteAddress);
                    });

                    client.on('error', (err) => {
                        reject(err);
                    });
                },
            );
            const responseTime = +new Date() - +time;
            return {
                responseTime: responseTime + 'ms',
                status: 'connected',
                ip: response,
            };
        } catch (err) {
            return {
                status: 'failed',
                body: err instanceof Error ? err.message : String(err),
            };
        }
    }

    async dnsLookup(domain: string) {
        const time = new Date();
        try {
            const result = await dns.resolveAny(domain);
            const responseTime = +new Date() - +time;
            return {
                responseTime: responseTime + 'ms',
                result,
            };
        } catch (err) {
            return {
                status: 'failed',
                body: err instanceof Error ? err.message : String(err),
            };
        }
    }

    async traceroute(host: string) {
        const time = new Date();
        try {
            const result = await new Promise((resolve, reject) => {
                traceroute.trace(host, (err, hops) => {
                    if (!err) resolve(hops);
                    else reject(err);
                });
            });

            const responseTime = +new Date() - +time;
            return {
                responseTime: responseTime + 'ms',
                result,
            };
        } catch (err) {
            return {
                status: 'failed',
                body: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
