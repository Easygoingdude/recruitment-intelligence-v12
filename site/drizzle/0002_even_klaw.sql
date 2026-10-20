CREATE TABLE `recruitment_appointments` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `appointments_expiry` ON `recruitment_appointments` (`expires_at`);