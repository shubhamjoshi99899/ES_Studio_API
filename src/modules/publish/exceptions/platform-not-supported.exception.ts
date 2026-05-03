import { BadRequestException } from '@nestjs/common';

export class PlatformNotSupportedException extends BadRequestException {
  constructor(platform: string) {
    super(`Platform '${platform}' is not supported for publishing`);
  }
}
