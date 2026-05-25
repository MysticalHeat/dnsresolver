import { Module } from '@nestjs/common';
import { IpgeoService } from './ipgeo.service';
import { IpgeoController } from './ipgeo.controller';

@Module({
    providers: [IpgeoService],
    exports: [IpgeoService],
    controllers: [IpgeoController],
})
export class IpgeoModule {}
