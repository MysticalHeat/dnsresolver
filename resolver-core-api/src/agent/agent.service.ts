import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import crypto from 'crypto';
import { DrizzleAsyncProvider } from 'src/db/db.provider';
import { agents } from 'src/db/db.schema';
import { DB } from 'src/db/db.types';

@Injectable()
export class AgentService {
    constructor(@Inject(DrizzleAsyncProvider) private readonly db: DB) {}

    async getAgentList() {
        return await this.db
            .select({
                id: agents.id,
                ip: agents.ip,
                location: agents.location,
                status: agents.status,
                lastSeen: agents.lastSeenAt,
            })
            .from(agents);
    }

    async createAgent() {
        const rmqUrl =
            process.env.RABBITMQ_HTTP_URL || 'http://localhost:15672/api';

        const accessSecret = crypto.randomBytes(16).toString('hex');

        const agent = await this.db
            .insert(agents)
            .values({})
            .returning({ id: agents.id });

        const accessKey = agent[0].id;

        const response = await axios.get<{
            ok: string;
        }>(rmqUrl + '/auth/hash_password/' + accessSecret);

        const passwordHash = response.data.ok;

        const userResponse = await axios.put(rmqUrl + '/users/' + accessKey, {
            password_hash: passwordHash,
            tags: ['none'],
        });

        const permResponse = await axios.put(
            rmqUrl + '/permissions/%2f/' + accessKey,
            {
                configure: '.*',
                write: '.*',
                read: '.*',
            },
        );

        const limitResponse = await axios.put(
            rmqUrl + `/user-limits/${accessKey}/max-connections`,
            {
                value: 1,
            },
        );

        return {
            accessKey,
            accessSecret,
        };
    }
}
