CREATE TABLE `fin_other_income` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`name` varchar(160) NOT NULL,
	`week` int NOT NULL,
	`amount` bigint NOT NULL,
	`proof_url` text,
	`note` text,
	CONSTRAINT `fin_other_income_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `fin_actual_items` ADD `period` enum('weekly','monthly') DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_match_fees` ADD `age_group` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_registrations` ADD `age_group` varchar(40) DEFAULT '' NOT NULL;--> statement-breakpoint
-- The new unique keys go in before the old ones come out: the foreign key on business_unit_id needs an index at all times.
ALTER TABLE `fin_match_fees` ADD CONSTRAINT `fin_match_fees_unit_group_club_week_idx` UNIQUE(`business_unit_id`,`age_group`,`club_name`,`week`);--> statement-breakpoint
ALTER TABLE `fin_registrations` ADD CONSTRAINT `fin_registrations_unit_group_club_idx` UNIQUE(`business_unit_id`,`age_group`,`club_name`);--> statement-breakpoint
ALTER TABLE `fin_match_fees` DROP INDEX `fin_match_fees_unit_club_week_idx`;--> statement-breakpoint
ALTER TABLE `fin_registrations` DROP INDEX `fin_registrations_unit_club_idx`;--> statement-breakpoint
ALTER TABLE `fin_other_income` ADD CONSTRAINT `fin_other_income_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_other_income` ADD CONSTRAINT `fin_other_income_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fin_other_income_unit_week_idx` ON `fin_other_income` (`business_unit_id`,`week`);
