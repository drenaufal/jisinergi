CREATE TABLE `fin_savings` (
	`id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`amount` bigint NOT NULL,
	`saved_on` date NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `fin_savings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `fin_savings` ADD CONSTRAINT `fin_savings_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fin_savings_name_idx` ON `fin_savings` (`name`,`saved_on`);