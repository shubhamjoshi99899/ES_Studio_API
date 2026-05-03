import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { InboxPlatform } from '../../inbox/entities/inbox-contact.entity';

type SupportedPlatform = InboxPlatform;

type OAuthStatePayload = {
  workspaceId: string;
  platform: string;
  nonce: string;
};

type ConnectionRecord = {
  accessToken: string;
  tokenExpiresAt: Date | null;
  scopes: string[];
  externalProfileId: string;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
};

type ConnectionCandidate = ConnectionRecord;

type CandidateStore = {
  workspaceId: string;
  platform: SupportedPlatform;
  candidates: ConnectionCandidate[];
};

type CallbackResult = {
  workspaceId: string;
  platform: SupportedPlatform;
  candidateToken?: string;
  connected?: number;
};

type ConnectionTableCapabilities = {
  hasAccessToken: boolean;
  hasEncryptedToken: boolean;
  hasScopes: boolean;
  hasDisplayName: boolean;
  hasUsername: boolean;
  hasAvatarUrl: boolean;
};

const META_OAUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const LINKEDIN_OAUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const TIKTOK_OAUTH_URL = 'https://www.tiktok.com/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_API_URL = 'https://open.tiktokapis.com/v2';
const OAUTH_CALLBACK_PATH = '/api/ops/connections/oauth/callback';
const CANDIDATE_TTL_SECONDS = 600;

@Injectable()
export class OpsConnectionsService {
  private _redis: Redis | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  private get redis(): Redis {
    if (!this._redis) {
      this._redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
        lazyConnect: true,
      });
    }
    return this._redis;
  }

  async getConnections(workspaceId: string): Promise<any[]> {
    const capabilities = await this.getConnectionTableCapabilities();

    const rows = await this.dataSource.query(
      `
      SELECT
        id,
        workspace_id,
        platform,
        external_profile_id,
        status,
        token_expires_at,
        last_synced_at,
        created_at,
        updated_at
        ${capabilities.hasScopes ? ', scopes' : ''}
        ${capabilities.hasDisplayName ? ', display_name' : ''}
        ${capabilities.hasUsername ? ', username' : ''}
        ${capabilities.hasAvatarUrl ? ', avatar_url' : ''}
      FROM platform_connections
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      `,
      [workspaceId],
    );

    return rows;
  }

  async disconnect(workspaceId: string, id: string): Promise<void> {
    const result = await this.dataSource.query<Array<{ id: string }>>(
      `
      DELETE FROM platform_connections
      WHERE id = $1 AND workspace_id = $2
      RETURNING id
      `,
      [id, workspaceId],
    );

    if (!result[0]) {
      throw new NotFoundException('Connection not found');
    }
  }

  // TASK 2: preflight env-var checks + TASK 4: signed JWT state
  getOAuthUrl(workspaceId: string, platform: string): { authUrl: string } {
    const supportedPlatform = this.assertSupportedPlatform(platform);
    this.assertOAuthConfig(supportedPlatform);

    const nonce = randomBytes(16).toString('hex');
    const state = this.jwtService.sign(
      { workspaceId, platform: supportedPlatform, nonce } satisfies OAuthStatePayload,
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    switch (supportedPlatform) {
      case 'facebook':
      case 'instagram': {
        return {
          authUrl: this.buildUrl(META_OAUTH_URL, {
            client_id: process.env.META_APP_ID ?? '',
            redirect_uri: this.getCallbackUrl('facebook'),
            scope: [
              'pages_manage_posts',
              'pages_read_engagement',
              'instagram_basic',
              'instagram_manage_messages',
            ].join(','),
            state,
          }),
        };
      }
      case 'linkedin': {
        return {
          authUrl: this.buildUrl(LINKEDIN_OAUTH_URL, {
            client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
            redirect_uri: this.getCallbackUrl('linkedin'),
            scope: ['r_liteprofile', 'r_emailaddress', 'w_member_social'].join(','),
            state,
          }),
        };
      }
      case 'tiktok': {
        return {
          authUrl: this.buildUrl(TIKTOK_OAUTH_URL, {
            client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
            redirect_uri: this.getCallbackUrl('tiktok'),
            scope: ['user.info.basic', 'video.list', 'video.comments'].join(','),
            state,
          }),
        };
      }
    }
  }

  // TASK 3a-c + TASK 4b-c: candidate flow for Meta, immediate connect for others
  async handleCallback(code: string, state: string): Promise<CallbackResult> {
    if (!code || !state) {
      throw new BadRequestException('oauth_state_mismatch');
    }

    const { workspaceId, platform } = this.parseState(state);

    if (platform === 'facebook' || platform === 'instagram') {
      const candidateToken = await this.storeMetaCandidates(code, workspaceId, platform);
      return { workspaceId, platform, candidateToken };
    }

    const connections = await this.exchangeNonMetaToken(code, platform);
    const capabilities = await this.getConnectionTableCapabilities();
    for (const connection of connections) {
      await this.upsertConnection(workspaceId, platform, connection, capabilities);
    }
    return { workspaceId, platform, connected: connections.length };
  }

  // TASK 3d: return candidate list from Redis
  async getCandidates(
    workspaceId: string,
    token: string,
  ): Promise<{ platform: string; candidates: Array<{ id: string; name?: string }> }> {
    const store = await this.loadCandidateStore(token, workspaceId);
    return {
      platform: store.platform,
      candidates: store.candidates.map((c) => ({ id: c.externalProfileId, name: c.displayName ?? undefined })),
    };
  }

  // TASK 3e: connect selected profiles and clear the Redis key
  async confirmCandidates(
    workspaceId: string,
    token: string,
    selectedProfileIds: string[],
  ): Promise<{ connected: number }> {
    const store = await this.loadCandidateStore(token, workspaceId);

    const selected = store.candidates.filter((c) =>
      selectedProfileIds.includes(c.externalProfileId),
    );
    if (selected.length === 0) {
      throw new BadRequestException('No matching candidates for the selected profile IDs');
    }

    const capabilities = await this.getConnectionTableCapabilities();
    for (const candidate of selected) {
      await this.upsertConnection(workspaceId, store.platform, candidate, capabilities);
    }

    await this.redis.del(`candidates:${token}`);
    return { connected: selected.length };
  }

  // TASK 4b: verify signed state JWT; throw oauth_state_mismatch sentinel on any failure
  private parseState(state: string): { workspaceId: string; platform: SupportedPlatform } {
    try {
      const payload = this.jwtService.verify<OAuthStatePayload>(state, {
        secret: process.env.JWT_SECRET,
      });
      return {
        workspaceId: payload.workspaceId,
        platform: this.assertSupportedPlatform(payload.platform),
      };
    } catch {
      throw new BadRequestException('oauth_state_mismatch');
    }
  }

  // TASK 3a-b: exchange Meta code, build candidate list, store in Redis with nonce key
  private async storeMetaCandidates(
    code: string,
    workspaceId: string,
    platform: 'facebook' | 'instagram',
  ): Promise<string> {
    const tokenResponse = await axios.get<{
      access_token: string;
      expires_in?: number;
    }>(META_TOKEN_URL, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: this.getCallbackUrl('facebook'),
        code,
      },
    });

    const scopes = [
      'pages_manage_posts',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_manage_messages',
    ];
    const tokenExpiresAt = this.resolveExpiry(tokenResponse.data.expires_in);

    const pagesResponse = await axios.get<{
      data?: Array<{
        id: string;
        name?: string;
        access_token?: string;
        picture?: { data?: { url?: string } };
        connected_instagram_account?: {
          id?: string;
          name?: string;
          username?: string;
          profile_picture_url?: string;
        };
      }>;
    }>('https://graph.facebook.com/v19.0/me/accounts', {
      params: {
        fields:
          'id,name,picture{url},access_token,' +
          'connected_instagram_account{id,name,username,profile_picture_url}',
        access_token: tokenResponse.data.access_token,
      },
    });

    const pages = pagesResponse.data.data ?? [];

    let candidates: ConnectionCandidate[];
    if (platform === 'facebook') {
      candidates = pages
        .filter((p) => p.id && p.access_token)
        .map((p) => ({
          externalProfileId: p.id,
          displayName: p.name ?? null,
          username: null,
          avatarUrl: p.picture?.data?.url ?? null,
          accessToken: p.access_token as string,
          tokenExpiresAt,
          scopes,
        }));
    } else {
      candidates = pages
        .filter((p) => p.access_token && p.connected_instagram_account?.id)
        .map((p) => ({
          externalProfileId: p.connected_instagram_account!.id as string,
          displayName:
            p.connected_instagram_account!.name ??
            p.connected_instagram_account!.username ??
            null,
          username: p.connected_instagram_account!.username ?? null,
          avatarUrl: p.connected_instagram_account!.profile_picture_url ?? null,
          accessToken: p.access_token as string,
          tokenExpiresAt,
          scopes,
        }));
    }

    if (candidates.length === 0) {
      throw new BadRequestException('token_exchange_failed');
    }

    const nonce = randomBytes(16).toString('hex');
    const store: CandidateStore = { workspaceId, platform, candidates };
    await this.redis.set(
      `candidates:${nonce}`,
      JSON.stringify(store),
      'EX',
      CANDIDATE_TTL_SECONDS,
    );
    return nonce;
  }

  private async loadCandidateStore(token: string, workspaceId: string): Promise<CandidateStore> {
    if (!token) throw new BadRequestException('Missing candidate token');

    const raw = await this.redis.get(`candidates:${token}`);
    if (!raw) throw new NotFoundException('Candidate session not found or expired');

    const store: CandidateStore = JSON.parse(raw);
    if (store.workspaceId !== workspaceId) {
      throw new NotFoundException('Candidate session not found or expired');
    }
    return store;
  }

  // TASK 2: assert all required env vars exist before constructing any provider URL
  private assertOAuthConfig(platform: SupportedPlatform): void {
    const required: Record<SupportedPlatform, string[]> = {
      facebook: ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI'],
      instagram: ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI'],
      linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'],
      tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'],
    };

    for (const envVar of required[platform]) {
      if (!process.env[envVar]) {
        const name = platform.charAt(0).toUpperCase() + platform.slice(1);
        throw new BadRequestException(
          `${name} OAuth is not configured on this server (${envVar} missing)`,
        );
      }
    }
  }

  private async exchangeNonMetaToken(
    code: string,
    platform: 'linkedin' | 'tiktok',
  ): Promise<ConnectionRecord[]> {
    switch (platform) {
      case 'linkedin':
        return this.exchangeLinkedInToken(code);
      case 'tiktok':
        return this.exchangeTikTokToken(code);
    }
  }

  private async exchangeLinkedInToken(code: string): Promise<ConnectionRecord[]> {
    const response = await axios.post<{
      access_token: string;
      expires_in?: number;
      scope?: string;
    }>(
      LINKEDIN_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
        redirect_uri: this.getCallbackUrl('linkedin'),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const profileResponse = await axios.get<{
      id: string;
      localizedFirstName?: string;
      localizedLastName?: string;
      profilePicture?: {
        'displayImage~'?: {
          elements?: Array<{
            identifiers?: Array<{ identifier?: string }>;
          }>;
        };
      };
    }>(
      'https://api.linkedin.com/v2/me' +
        '?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))',
      {
        headers: {
          Authorization: `Bearer ${response.data.access_token}`,
          'X-RestLi-Protocol-Version': '2.0.0',
        },
      },
    );

    const linkedInDisplayName = [
      profileResponse.data.localizedFirstName,
      profileResponse.data.localizedLastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || null;
    const linkedInAvatarUrl =
      profileResponse.data.profilePicture?.['displayImage~']?.elements
        ?.flatMap((element) => element.identifiers ?? [])
        .map((identifier) => identifier.identifier)
        .filter(Boolean)
        .at(-1) ?? null;

    return [{
      accessToken: response.data.access_token,
      tokenExpiresAt: this.resolveExpiry(response.data.expires_in),
      scopes: this.normalizeScopes(
        response.data.scope,
        ['r_liteprofile', 'r_emailaddress', 'w_member_social'],
      ),
      externalProfileId: profileResponse.data.id,
      displayName: linkedInDisplayName,
      username: null,
      avatarUrl: linkedInAvatarUrl,
    }];
  }

  private async exchangeTikTokToken(code: string): Promise<ConnectionRecord[]> {
    const response = await axios.post<{
      access_token: string;
      expires_in?: number;
      scope?: string;
      data?: { scope?: string };
    }>(
      TIKTOK_TOKEN_URL,
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.getCallbackUrl('tiktok'),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const profileResponse = await axios.get<{
      data?: {
        open_id?: string;
        display_name?: string;
        username?: string;
        avatar_url?: string;
      };
    }>(`${TIKTOK_API_URL}/user/info/`, {
      params: { fields: 'open_id,display_name,username,avatar_url' },
      headers: { Authorization: `Bearer ${response.data.access_token}` },
    });

    const openId = profileResponse.data.data?.open_id;
    if (!openId) {
      throw new BadRequestException('TikTok did not return an open_id for this user');
    }

    return [{
      accessToken: response.data.access_token,
      tokenExpiresAt: this.resolveExpiry(response.data.expires_in),
      scopes: this.normalizeScopes(
        response.data.scope ?? response.data.data?.scope,
        ['user.info.basic', 'video.list', 'video.comments'],
      ),
      externalProfileId: openId,
      displayName: profileResponse.data.data?.display_name ?? null,
      username: profileResponse.data.data?.username ?? null,
      avatarUrl: profileResponse.data.data?.avatar_url ?? null,
    }];
  }

  private buildUrl(baseUrl: string, params: Record<string, string>): string {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  // Use provider-specific redirect URI env vars when set; fall back to constructed URL
  private getCallbackUrl(platform: 'facebook' | 'linkedin' | 'tiktok'): string {
    const base = `${process.env.APP_URL ?? 'http://localhost:3000'}${OAUTH_CALLBACK_PATH}`;
    switch (platform) {
      case 'facebook':
        return process.env.META_REDIRECT_URI ?? base;
      case 'linkedin':
        return process.env.LINKEDIN_REDIRECT_URI ?? base;
      case 'tiktok':
        return process.env.TIKTOK_REDIRECT_URI ?? base;
    }
  }

  private assertSupportedPlatform(platform: string): SupportedPlatform {
    if (
      platform !== 'facebook' &&
      platform !== 'instagram' &&
      platform !== 'linkedin' &&
      platform !== 'tiktok'
    ) {
      throw new BadRequestException('Unsupported platform');
    }
    return platform;
  }

  private resolveExpiry(expiresIn?: number): Date | null {
    if (!expiresIn || Number.isNaN(expiresIn)) return null;
    return new Date(Date.now() + expiresIn * 1000);
  }

  private normalizeScopes(scopeValue: string | undefined, fallback: string[]): string[] {
    if (!scopeValue) return fallback;
    return scopeValue
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async getConnectionTableCapabilities(): Promise<ConnectionTableCapabilities> {
    const columns = await this.dataSource.query<Array<{ column_name: string }>>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'platform_connections'
      `,
    );

    const names = new Set(columns.map((c) => c.column_name));
    return {
      hasAccessToken: names.has('access_token'),
      hasEncryptedToken: names.has('encrypted_token'),
      hasScopes: names.has('scopes'),
      hasDisplayName: names.has('display_name'),
      hasUsername: names.has('username'),
      hasAvatarUrl: names.has('avatar_url'),
    };
  }

  private async upsertConnection(
    workspaceId: string,
    platform: SupportedPlatform,
    connection: ConnectionRecord,
    capabilities: ConnectionTableCapabilities,
  ): Promise<void> {
    const columns = ['workspace_id', 'platform', 'external_profile_id', 'status', 'token_expires_at'];
    const values: unknown[] = [
      workspaceId,
      platform,
      connection.externalProfileId,
      'active',
      connection.tokenExpiresAt,
    ];

    if (capabilities.hasEncryptedToken) {
      columns.push('encrypted_token');
      values.push(connection.accessToken);
    } else if (capabilities.hasAccessToken) {
      columns.push('access_token');
      values.push(connection.accessToken);
    } else {
      throw new BadRequestException('platform_connections token column is missing');
    }

    if (capabilities.hasScopes) {
      columns.push('scopes');
      values.push(connection.scopes);
    }
    if (capabilities.hasDisplayName) {
      columns.push('display_name');
      values.push(connection.displayName ?? null);
    }
    if (capabilities.hasUsername) {
      columns.push('username');
      values.push(connection.username ?? null);
    }
    if (capabilities.hasAvatarUrl) {
      columns.push('avatar_url');
      values.push(connection.avatarUrl ?? null);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const tokenCol = capabilities.hasEncryptedToken ? 'encrypted_token' : 'access_token';
    const updates = [
      `${tokenCol} = EXCLUDED.${tokenCol}`,
      'status = EXCLUDED.status',
      'token_expires_at = EXCLUDED.token_expires_at',
      'updated_at = now()',
    ];
    if (capabilities.hasScopes) updates.push('scopes = EXCLUDED.scopes');
    if (capabilities.hasDisplayName) updates.push('display_name = EXCLUDED.display_name');
    if (capabilities.hasUsername) updates.push('username = EXCLUDED.username');
    if (capabilities.hasAvatarUrl) updates.push('avatar_url = EXCLUDED.avatar_url');

    await this.dataSource.query(
      `
      INSERT INTO platform_connections (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (workspace_id, platform, external_profile_id)
      DO UPDATE SET ${updates.join(', ')}
      `,
      values,
    );
  }
}
