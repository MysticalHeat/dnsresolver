import { Global, Module } from '@nestjs/common';
import { DrizzleAsyncProvider, DrizzleProvider } from './db.provider';

@Global()
@Module({
    providers: [DrizzleProvider],
    exports: [DrizzleAsyncProvider],
})
export class DbModule {}
