import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * User configuration entity for database storage
 */
@Entity({ name: 'user_configs' })
export class UserConfig {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  username: string;

  @Column({ type: 'simple-json', nullable: true })
  routing?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  additionalConfig?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default UserConfig;
