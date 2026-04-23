import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  passwordHash: string | null;

  @Column({ unique: true, nullable: true })
  apiKey: string | null;

  @Column({ name: 'google_id', type: 'text', unique: true, nullable: true })
  googleId: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ name: 'verification_token', type: 'text', unique: true, nullable: true })
  verificationToken: string | null;

  @Column({ name: 'verification_token_expires_at', type: 'timestamp', nullable: true })
  verificationTokenExpiresAt: Date | null;

  @Column({ type: 'text', nullable: true })
  name: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
