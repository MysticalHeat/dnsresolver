import { Injectable } from '@nestjs/common';
import axios from 'axios';
import ping from 'ping';
import net from 'net';
import dns from 'dns/promises';
import traceroute from 'traceroute';

@Injectable()
export class TasksService {
    async httpCheck(url: string) {
        const time = new Date();
        const response = await axios.get(url);
        const responseTime = +new Date() - +time;

        return {
            status: response.status + ' ' + response.statusText,
            responseTime: responseTime + 'ms',
            headers: response.headers as Record<string, string | string[]>,
            ip: response.request?.socket?.remoteAddress,
        };
    }

    async ping(url: string) {
        const time = new Date();
        const response = await ping.promise.probe(url, {
            timeout: 10,
            extra: ['-c', '5'],
        });
        const responseTime = +new Date() - +time;

        return {
            responseTime: responseTime + 'ms',
            result: response,
            ip: response.numeric_host,
        };
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
        try {
            const result = await new Promise((resolve, reject) => {
                traceroute.trace(host, (err, hops) => {
                    if (!err) resolve(hops);
                    else reject(err);
                });
            });
            return result;
        } catch (err) {
            return {
                status: 'failed',
                body: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
