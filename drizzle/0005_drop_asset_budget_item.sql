ALTER TABLE `fin_assets` DROP FOREIGN KEY `fin_assets_budget_item_id_fin_budget_items_id_fk`;--> statement-breakpoint
ALTER TABLE `fin_assets` DROP INDEX `fin_assets_budget_item_idx`;--> statement-breakpoint
ALTER TABLE `fin_assets` DROP COLUMN `budget_item_id`;
