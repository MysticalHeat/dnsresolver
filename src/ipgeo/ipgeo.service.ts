import {
    Injectable,
    InternalServerErrorException,
    OnApplicationBootstrap,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as ipgeoResponse from './responses/ipgeo.json';

@Injectable()
export class IpgeoService implements OnApplicationBootstrap {
    private geoApi: AxiosInstance;

    onApplicationBootstrap() {
        this.geoApi = axios.create({
            baseURL: 'https://api.ipgeolocation.io/v2/ipgeo',
            params: {
                apiKey: process.env.IPGEO_API_KEY,
            },
        });
    }

    async getGeolocation(ip: string) {
        const response = await this.geoApi
            .get<typeof ipgeoResponse>('', {
                params: {
                    ip,
                },
            })
            .catch((err) => {
                throw new InternalServerErrorException('Something went wrong');
            });
        return response.data;
    }
}
