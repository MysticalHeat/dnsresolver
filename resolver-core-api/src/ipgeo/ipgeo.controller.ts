import { Controller, Get, Query } from '@nestjs/common';
import { IpgeoService } from './ipgeo.service';

@Controller('ipgeo')
export class IpgeoController {
    constructor(private readonly ipgeoService: IpgeoService) {}

    @Get()
    getIpGeo(@Query('host') host: string) {
        return this.ipgeoService.getGeolocation(host);
    }
}
