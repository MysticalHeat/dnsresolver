import { Module } from '@nestjs/common';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { IpgeoModule } from 'src/ipgeo/ipgeo.module';

@Module({
    imports: [IpgeoModule],
    controllers: [CoreController],
    providers: [CoreService],
})
export class CoreModule {}
