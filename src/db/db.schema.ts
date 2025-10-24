import { relations, sql } from 'drizzle-orm';
import {
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    uuid,
} from 'drizzle-orm/pg-core';

export const taskTypeEnum = pgEnum('task_type', [
    'http-check',
    'ping',
    'tcp-check',
    'dns-lookup',
    'traceroute',
]);

export const tasks = pgTable('tasks', {
    id: uuid()
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    type: taskTypeEnum().notNull(),
    input: text().notNull(),
});

export const tasksRelations = relations(tasks, ({ many }) => ({
    tasksToAgents: many(tasksToAgents),
}));

export const agents = pgTable('agents', {
    id: uuid()
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    ip: text().notNull(),
    location: text().notNull(),
    webhookUrl: text().notNull().default('http://localhost'),
});

export const agentsRelations = relations(agents, ({ many }) => ({
    tasksToAgents: many(tasksToAgents),
}));

export const tasksStatusEnum = pgEnum('task_status', [
    'pending',
    'in_progress',
    'completed',
    'failed',
]);

export const tasksToAgents = pgTable(
    'tasks_to_agents',
    {
        taskId: uuid()
            .references(() => tasks.id)
            .notNull(),
        agentId: uuid()
            .references(() => agents.id)
            .notNull(),
        status: tasksStatusEnum().notNull().default('pending'),
        result: jsonb(),
    },
    (t) => [primaryKey({ columns: [t.taskId, t.agentId] })],
);

export const tasksToAgentsRelations = relations(tasksToAgents, ({ one }) => ({
    task: one(tasks, {
        fields: [tasksToAgents.taskId],
        references: [tasks.id],
    }),
    agent: one(agents, {
        fields: [tasksToAgents.agentId],
        references: [agents.id],
    }),
}));
