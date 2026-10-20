import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const interviews = sqliteTable('interviews', {
  userId: text('user_id').notNull(), id: text('id').notNull(),
  payload: text('payload').notNull(), revision: integer('revision').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.id]}), index('interviews_expiry').on(t.expiresAt)]);
export const recruitmentJobs=sqliteTable('recruitment_jobs',{
 userId:text('user_id').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),
 revision:integer('revision').notNull(),legacyKey:text('legacy_key'),updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]}),uniqueIndex('jobs_legacy_import').on(t.userId,t.legacyKey)]);
export const recruitmentAppointments=sqliteTable('recruitment_appointments',{
 userId:text('user_id').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]}),index('appointments_expiry').on(t.expiresAt)]);

export const recruitmentApplications=sqliteTable('recruitment_applications',{
 userId:text('user_id').notNull(),id:text('id').notNull(),jobId:text('job_id').notNull(),payload:text('payload').notNull(),revision:integer('revision').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]}),index('applications_expiry').on(t.expiresAt)]);
export const applicationHistory=sqliteTable('recruitment_application_history',{
 userId:text('user_id').notNull(),jobId:text('job_id').notNull(),month:text('month').notNull(),total:integer('total').notNull(),closed:integer('closed').notNull(),inProgress:integer('in_progress').notNull(),
},t=>[primaryKey({columns:[t.userId,t.jobId,t.month]})]);
