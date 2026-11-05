import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PatientsService } from './patients.service.js';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  findAll() {
    return this.patients.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ZodValidationPipe(z.uuid())) id: string) {
    return this.patients.findOne(id);
  }
}
