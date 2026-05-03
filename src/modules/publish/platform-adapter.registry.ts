import { Injectable } from '@nestjs/common';
import type { IPlatformPublishAdapter } from './adapters/publish-adapter.interface';
import { MetaPublishAdapter } from './adapters/meta-publish.adapter';
import { PlatformNotSupportedException } from './exceptions/platform-not-supported.exception';

@Injectable()
export class PlatformAdapterRegistry {
  private readonly map: Map<string, IPlatformPublishAdapter>;

  constructor(private readonly metaAdapter: MetaPublishAdapter) {
    this.map = new Map<string, IPlatformPublishAdapter>([
      ['facebook', metaAdapter],
      ['instagram', metaAdapter],
    ]);
  }

  getAdapter(platform: string): IPlatformPublishAdapter {
    const adapter = this.map.get(platform);
    if (!adapter) {
      throw new PlatformNotSupportedException(platform);
    }
    return adapter;
  }
}
