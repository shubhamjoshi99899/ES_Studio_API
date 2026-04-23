import {
  Injectable,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Workspace } from './entities/workspace.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { JwtPayload } from '../auth/auth.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private dataSource: DataSource,
    private jwtService: JwtService,
  ) {}

  async createWorkspaceWithOwner(
    userId: string,
    userEmail: string,
    dto: CreateWorkspaceDto,
  ): Promise<{ workspace: Workspace; accessToken: string; redirectTo: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: validate slug uniqueness (case-insensitive)
      const slugRows: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM workspaces WHERE LOWER(slug) = LOWER($1) LIMIT 1`,
        [dto.slug],
      );
      if (slugRows.length > 0) {
        throw new ConflictException(`Workspace slug "${dto.slug}" is already taken`);
      }

      // Step 2: create workspace
      const workspaceRows: Array<Workspace> = await queryRunner.query(
        `INSERT INTO workspaces (id, name, slug, plan, settings, created_at)
         VALUES (uuid_generate_v4(), $1, $2, 'starter', $3::jsonb, now())
         RETURNING *`,
        [
          dto.orgName,
          dto.slug.toLowerCase(),
          JSON.stringify({
            teamSize: dto.teamSize,
            industry: dto.industry,
            platforms: dto.platforms,
            onboardingCompletedAt: new Date().toISOString(),
          }),
        ],
      );
      const workspace = workspaceRows[0];

      // Step 3: create workspace_users row (owner = admin)
      await queryRunner.query(
        `INSERT INTO workspace_users (id, workspace_id, user_id, role, status, invited_at, accepted_at)
         VALUES (uuid_generate_v4(), $1, $2, 'admin', 'active', now(), now())`,
        [workspace.id, userId],
      );

      // Step 4: create workspace_subscriptions row (Free Starter — no Stripe yet)
      // stripe_customer_id is nullable after migration 010
      await queryRunner.query(
        `INSERT INTO workspace_subscriptions
           (id, workspace_id, stripe_customer_id, plan, status, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, NULL, 'starter', 'active', now(), now())`,
        [workspace.id],
      );

      // Step 5: commit
      await queryRunner.commitTransaction();

      // Step 6: issue new JWT with the real workspaceId
      const payload: JwtPayload = {
        sub: userId,
        email: userEmail,
        workspaceId: workspace.id,
      };
      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      });

      return {
        workspace,
        accessToken,
        redirectTo: '/dashboard',
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
