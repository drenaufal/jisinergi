ALTER TABLE `business_units` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `business_units` ADD `league_finished_on` date;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD `actual_cost_id` char(36);--> statement-breakpoint
ALTER TABLE `fin_unit_owners` ADD `taken_amount` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `fin_unit_owners` ADD `taken_on` date;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_actual_cost_idx` UNIQUE(`actual_cost_id`);--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_actual_cost_id_fin_actual_costs_id_fk` FOREIGN KEY (`actual_cost_id`) REFERENCES `fin_actual_costs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Assets now follow real purchases (RAB Actual costs), not the RAB budget: drop the assets that were made from RAB lines...
DELETE FROM `fin_assets` WHERE `budget_item_id` IS NOT NULL;--> statement-breakpoint
-- ...and make one asset out of every cost already booked on an asset line.
INSERT INTO `fin_assets` (`id`, `business_unit_id`, `created_by`, `purchased_on`, `name`, `amount`, `proof_url`, `note`, `actual_cost_id`)
SELECT UUID(), c.`business_unit_id`, c.`created_by`, c.`spent_on`, LEFT(b.`name`, 160), c.`amount`, c.`proof_url`, 'Dibuat otomatis dari RAB Actual', c.`id`
FROM `fin_actual_costs` c
JOIN `fin_budget_items` b ON b.`id` = c.`budget_item_id`
WHERE b.`is_asset` = 1;
