import { Inject, Injectable } from '@nestjs/common';
import { RequestLoggingInterceptor } from '@toka/logger';
import { LOGGER } from './tokens';

@Injectable()
export class RequestLogInterceptor extends RequestLoggingInterceptor {
  constructor(@Inject(LOGGER) logger: ConstructorParameters<typeof RequestLoggingInterceptor>[0]) {
    super(logger);
  }
}
