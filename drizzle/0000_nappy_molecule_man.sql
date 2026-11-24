CREATE TABLE `loyalty_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`bonus` integer DEFAULT 2 NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`sizes` text DEFAULT '[]' NOT NULL,
	`photo_key` text,
	`calories` integer,
	`caffeine_mg` integer,
	`allergens` text DEFAULT '' NOT NULL,
	`high_salt` integer DEFAULT false NOT NULL,
	`sold_out_on` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `menu_sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_items_section` ON `menu_items` (`section_id`,`position`);--> statement-breakpoint
CREATE TABLE `menu_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_attempts` (
	`client` text NOT NULL,
	`minute` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`client`, `minute`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`item_id` text,
	`name` text NOT NULL,
	`size` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`qty` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`number` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`delivery` text,
	`mode` text,
	`plate` text DEFAULT '' NOT NULL,
	`table_name` text DEFAULT '' NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`card_id` text,
	`day` text NOT NULL,
	`created_by` text,
	`ready_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_token_unique` ON `orders` (`token`);--> statement-breakpoint
CREATE INDEX `orders_day` ON `orders` (`day`,`status`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`order_id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`order_id` text NOT NULL,
	`round` integer NOT NULL,
	`given_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_card_round` ON `rewards` (`card_id`,`round`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`venue_name` text DEFAULT '' NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`loyalty_enabled` integer DEFAULT false NOT NULL,
	`stamps_needed` integer DEFAULT 8 NOT NULL,
	`reward_text` text DEFAULT '' NOT NULL,
	`stamp_shape` text DEFAULT 'cup' NOT NULL,
	`collect_enabled` integer DEFAULT false NOT NULL,
	`car_enabled` integer DEFAULT false NOT NULL,
	`table_enabled` integer DEFAULT false NOT NULL,
	`opens_at` text DEFAULT '' NOT NULL,
	`closes_at` text DEFAULT '' NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `stamps` (
	`order_id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`round` integer NOT NULL,
	`day` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stamps_card` ON `stamps` (`card_id`,`round`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `venue_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_tables_code_unique` ON `venue_tables` (`code`);