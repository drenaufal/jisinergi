CREATE TABLE `fin_actual_costs` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`budget_item_id` char(36),
	`actual_item_id` char(36),
	`amount` bigint NOT NULL,
	`spent_on` date NOT NULL,
	`proof_url` text,
	`note` text,
	CONSTRAINT `fin_actual_costs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_actual_items` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`category` varchar(160) NOT NULL,
	`name` varchar(200) NOT NULL,
	`note` text,
	CONSTRAINT `fin_actual_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `fin_actual_items_unit_name_idx` UNIQUE(`business_unit_id`,`category`,`name`)
);
--> statement-breakpoint
CREATE TABLE `fin_unit_owners` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`share_bp` int NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `fin_unit_owners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `business_units` ADD `program_starts_on` date;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD `budget_item_id` char(36);--> statement-breakpoint
ALTER TABLE `fin_assets` ADD `expense_id` char(36);--> statement-breakpoint
ALTER TABLE `fin_budget_items` ADD `is_asset` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_expenses` ADD `is_asset` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_budget_item_idx` UNIQUE(`budget_item_id`);--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_expense_idx` UNIQUE(`expense_id`);--> statement-breakpoint
ALTER TABLE `fin_actual_costs` ADD CONSTRAINT `fin_actual_costs_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_actual_costs` ADD CONSTRAINT `fin_actual_costs_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_actual_costs` ADD CONSTRAINT `fin_actual_costs_budget_item_id_fin_budget_items_id_fk` FOREIGN KEY (`budget_item_id`) REFERENCES `fin_budget_items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_actual_costs` ADD CONSTRAINT `fin_actual_costs_actual_item_id_fin_actual_items_id_fk` FOREIGN KEY (`actual_item_id`) REFERENCES `fin_actual_items`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_actual_items` ADD CONSTRAINT `fin_actual_items_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_actual_items` ADD CONSTRAINT `fin_actual_items_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_unit_owners` ADD CONSTRAINT `fin_unit_owners_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fin_actual_costs_unit_date_idx` ON `fin_actual_costs` (`business_unit_id`,`spent_on`);--> statement-breakpoint
CREATE INDEX `fin_actual_costs_budget_item_idx` ON `fin_actual_costs` (`budget_item_id`);--> statement-breakpoint
CREATE INDEX `fin_actual_costs_actual_item_idx` ON `fin_actual_costs` (`actual_item_id`);--> statement-breakpoint
CREATE INDEX `fin_unit_owners_unit_idx` ON `fin_unit_owners` (`business_unit_id`,`position`);--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_budget_item_id_fin_budget_items_id_fk` FOREIGN KEY (`budget_item_id`) REFERENCES `fin_budget_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_expense_id_fin_expenses_id_fk` FOREIGN KEY (`expense_id`) REFERENCES `fin_expenses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The old amount-based dividend records become owner shares: each recipient's portion of what the unit paid out.
INSERT INTO `fin_unit_owners` (`id`, `business_unit_id`, `name`, `share_bp`, `position`)
SELECT UUID(), d.`business_unit_id`, d.`recipient_name`, ROUND(d.`amount` * 10000 / t.`total`),
       ROW_NUMBER() OVER (PARTITION BY d.`business_unit_id` ORDER BY d.`created_at`, d.`id`)
FROM `fin_dividends` d
JOIN (SELECT `business_unit_id`, SUM(`amount`) AS `total` FROM `fin_dividends` GROUP BY `business_unit_id` HAVING SUM(`amount`) > 0) t
  ON t.`business_unit_id` = d.`business_unit_id`
WHERE d.`amount` > 0;
