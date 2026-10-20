CREATE TABLE `recruitment_jobs` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`legacy_key` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_legacy_import` ON `recruitment_jobs` (`user_id`,`legacy_key`);