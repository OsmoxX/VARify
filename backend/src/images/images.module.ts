import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller.js';
import { SportApiModule } from '../sport-api/sport-api.module.js';

@Module({ imports: [SportApiModule], controllers: [ImagesController] })
export class ImagesModule {}
