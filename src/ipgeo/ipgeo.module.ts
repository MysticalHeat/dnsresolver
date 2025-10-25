import { Module } from '@nestjs/common';
import { IpgeoService } from './ipgeo.service';

@Module({
    providers: [IpgeoService],
    exports: [IpgeoService],
})
export class IpgeoModule {}
