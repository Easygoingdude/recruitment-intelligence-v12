CREATE TABLE `interviews` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `interviews_expiry` ON `interviews` (`expires_at`);