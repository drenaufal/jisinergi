CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`actor_id` char(36),
	`actor_name` text,
	`actor_role` text,
	`action` varchar(64) NOT NULL,
	`entity_type` varchar(40) NOT NULL,
	`entity_id` char(36),
	`summary` text NOT NULL,
	`before` json,
	`after` json,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_unit_members` (
	`user_id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_unit_members_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `business_units` (
	`id` char(36) NOT NULL,
	`code` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('liga','sekolah_bola') NOT NULL DEFAULT 'liga',
	`description` text,
	`program_weeks` int NOT NULL DEFAULT 10,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_units_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `fin_assets` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`purchased_on` date NOT NULL,
	`name` varchar(160) NOT NULL,
	`amount` bigint NOT NULL,
	`proof_url` text,
	`note` text,
	CONSTRAINT `fin_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_budget_items` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`period` enum('weekly','monthly') NOT NULL,
	`category` varchar(160) NOT NULL,
	`category_order` int NOT NULL DEFAULT 0,
	`name` varchar(200) NOT NULL,
	`item_order` int NOT NULL DEFAULT 0,
	`quantity` int NOT NULL DEFAULT 1,
	`unit_price` bigint NOT NULL DEFAULT 0,
	`note` text,
	CONSTRAINT `fin_budget_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_capital` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`owner_name` varchar(120) NOT NULL,
	`amount` bigint NOT NULL,
	`status` enum('outstanding','returned') NOT NULL DEFAULT 'outstanding',
	`invested_on` date,
	`returned_on` date,
	`note` text,
	CONSTRAINT `fin_capital_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_dividends` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`recipient_name` varchar(120) NOT NULL,
	`amount` bigint NOT NULL,
	`paid_on` date,
	`note` text,
	CONSTRAINT `fin_dividends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_expenses` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`spent_on` date NOT NULL,
	`category` varchar(120) NOT NULL,
	`name` varchar(200) NOT NULL,
	`amount` bigint NOT NULL,
	`proof_url` text,
	`note` text,
	CONSTRAINT `fin_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fin_match_fees` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`club_name` varchar(160) NOT NULL,
	`week` int NOT NULL,
	`matches` int NOT NULL,
	`fee_per_match` bigint NOT NULL,
	`proof_url` text,
	`note` text,
	CONSTRAINT `fin_match_fees_id` PRIMARY KEY(`id`),
	CONSTRAINT `fin_match_fees_unit_club_week_idx` UNIQUE(`business_unit_id`,`club_name`,`week`)
);
--> statement-breakpoint
CREATE TABLE `fin_registrations` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`club_name` varchar(160) NOT NULL,
	`fee` bigint NOT NULL,
	`dp_amount` bigint NOT NULL DEFAULT 0,
	`dp_paid_on` date,
	`dp_proof_url` text,
	`final_amount` bigint NOT NULL DEFAULT 0,
	`final_paid_on` date,
	`final_proof_url` text,
	`note` text,
	CONSTRAINT `fin_registrations_id` PRIMARY KEY(`id`),
	CONSTRAINT `fin_registrations_unit_club_idx` UNIQUE(`business_unit_id`,`club_name`)
);
--> statement-breakpoint
CREATE TABLE `fin_student_payments` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`student_id` char(36) NOT NULL,
	`kind` enum('registration','jersey','monthly') NOT NULL,
	`paid_on` date NOT NULL,
	`amount` bigint NOT NULL,
	`discount` bigint NOT NULL DEFAULT 0,
	`period` varchar(7),
	`proof_url` text,
	`note` text,
	CONSTRAINT `fin_student_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `fin_student_payments_student_kind_period_idx` UNIQUE(`student_id`,`kind`,`period`)
);
--> statement-breakpoint
CREATE TABLE `fin_students` (
	`id` char(36) NOT NULL,
	`business_unit_id` char(36) NOT NULL,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`name` varchar(160) NOT NULL,
	`nickname` varchar(80),
	`birth_date` date,
	`joined_on` date NOT NULL,
	`jersey_number` int,
	`note` text,
	CONSTRAINT `fin_students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` char(36) NOT NULL,
	`kind` enum('image','document') NOT NULL,
	`file_name` text,
	`mime_type` varchar(80) NOT NULL,
	`size` int NOT NULL,
	`data` longtext NOT NULL,
	`uploaded_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`name` text NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` text NOT NULL,
	`role` enum('owner','unit_admin') NOT NULL DEFAULT 'unit_admin',
	`title` text,
	`active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_unit_members` ADD CONSTRAINT `business_unit_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_unit_members` ADD CONSTRAINT `business_unit_members_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_assets` ADD CONSTRAINT `fin_assets_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_budget_items` ADD CONSTRAINT `fin_budget_items_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_budget_items` ADD CONSTRAINT `fin_budget_items_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_capital` ADD CONSTRAINT `fin_capital_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_capital` ADD CONSTRAINT `fin_capital_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_dividends` ADD CONSTRAINT `fin_dividends_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_dividends` ADD CONSTRAINT `fin_dividends_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_expenses` ADD CONSTRAINT `fin_expenses_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_expenses` ADD CONSTRAINT `fin_expenses_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_match_fees` ADD CONSTRAINT `fin_match_fees_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_match_fees` ADD CONSTRAINT `fin_match_fees_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_registrations` ADD CONSTRAINT `fin_registrations_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_registrations` ADD CONSTRAINT `fin_registrations_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_student_payments` ADD CONSTRAINT `fin_student_payments_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_student_payments` ADD CONSTRAINT `fin_student_payments_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_student_payments` ADD CONSTRAINT `fin_student_payments_student_id_fin_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `fin_students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_students` ADD CONSTRAINT `fin_students_business_unit_id_business_units_id_fk` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fin_students` ADD CONSTRAINT `fin_students_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media` ADD CONSTRAINT `media_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_unit_members_unit_idx` ON `business_unit_members` (`business_unit_id`);--> statement-breakpoint
CREATE INDEX `fin_assets_unit_date_idx` ON `fin_assets` (`business_unit_id`,`purchased_on`);--> statement-breakpoint
CREATE INDEX `fin_budget_items_unit_period_idx` ON `fin_budget_items` (`business_unit_id`,`period`);--> statement-breakpoint
CREATE INDEX `fin_capital_unit_idx` ON `fin_capital` (`business_unit_id`);--> statement-breakpoint
CREATE INDEX `fin_dividends_unit_idx` ON `fin_dividends` (`business_unit_id`);--> statement-breakpoint
CREATE INDEX `fin_expenses_unit_date_idx` ON `fin_expenses` (`business_unit_id`,`spent_on`);--> statement-breakpoint
CREATE INDEX `fin_student_payments_unit_date_idx` ON `fin_student_payments` (`business_unit_id`,`paid_on`);--> statement-breakpoint
CREATE INDEX `fin_students_unit_idx` ON `fin_students` (`business_unit_id`,`name`);