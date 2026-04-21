import { Inject, Injectable } from '@nestjs/common';
import type { IPlatformInboxAdapter } from './adapters/platform-adapter.interface';
import type { InboxPlatform } from './entities/inbox-contact.entity';

@Injectable()
export class InboxService {
  constructor(
    @Inject('INBOX_ADAPTERS')
    private readonly adapters: IPlatformInboxAdapter[],
  ) {}

  /**
   * Resolve the correct adapter by platform string.
   * Adding a new platform = adding one adapter class. Zero changes here.
   */
  getAdapter(platform: InboxPlatform): IPlatformInboxAdapter {
    const adapter = this.adapters.find((a) => a.platform === platform);
    if (!adapter) throw new Error(`No inbox adapter registered for platform: ${platform}`);
    return adapter;
  }
}
