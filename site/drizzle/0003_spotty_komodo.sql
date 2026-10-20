CREATE TABLE `recruitment_application_history` (
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`month` text NOT NULL,
	`total` integer NOT NULL,
	`closed` integer NOT NULL,
	`in_progress` integer NOT NULL,
	PRIMARY KEY(`user_id`, `job_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `recruitment_applications` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`job_id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `applications_expiry` ON `recruitment_applications` (`expires_at`);
--> statement-breakpoint
-- Aggregate exactly once in the same transaction as expiry deletion; merged aliases are excluded.
CREATE TRIGGER `applications_retention_history` AFTER DELETE ON `recruitment_applications`
WHEN json_extract(OLD.payload,'$.mergedInto') IS NULL
BEGIN
 INSERT INTO recruitment_application_history (user_id,job_id,month,total,closed,in_progress)
 VALUES (OLD.user_id,OLD.job_id,substr(json_extract(OLD.payload,'$.createdAt'),1,7),1,
 CASE WHEN json_extract(OLD.payload,'$.status') IN ('No Go','Ne pas poursuivre','Embauché') THEN 1 ELSE 0 END,
 CASE WHEN json_extract(OLD.payload,'$.status') IN ('No Go','Ne pas poursuivre','Embauché') THEN 0 ELSE 1 END)
 ON CONFLICT(user_id,job_id,month) DO UPDATE SET total = total + 1, closed = closed + excluded.closed, in_progress = in_progress + excluded.in_progress;
END;
