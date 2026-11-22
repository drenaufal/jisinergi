CREATE TABLE `fin_owners` (
	`id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `fin_owners_id` PRIMARY KEY(`id`),
	CONSTRAINT `fin_owners_name_idx` UNIQUE(`name`)
);
--> statement-breakpoint
INSERT IGNORE INTO `fin_owners` (`id`, `name`)
SELECT UUID(), TRIM(`name`)
FROM `fin_unit_owners`
GROUP BY TRIM(`name`);
