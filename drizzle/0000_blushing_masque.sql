CREATE TABLE `answers` (
	`submission_id` text NOT NULL,
	`question_key` text NOT NULL,
	`value` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_unique` ON `answers` (`submission_id`,`question_key`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`sub_account_id` text,
	`user_id` text,
	`action` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_checks` (
	`sub_account_id` text NOT NULL,
	`email` text NOT NULL,
	`result` text,
	`risk` text,
	`reason` text,
	`raw` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_checks_unique` ON `email_checks` (`sub_account_id`,`email`);--> statement-breakpoint
CREATE TABLE `email_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events_log` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`destination` text NOT NULL,
	`event_name` text,
	`event_id` text,
	`payload` text,
	`response` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_submission` ON `events_log` (`submission_id`);--> statement-breakpoint
CREATE TABLE `field_mappings` (
	`form_id` text NOT NULL,
	`question_key` text NOT NULL,
	`ghl_field` text NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_mappings_unique` ON `field_mappings` (`form_id`,`question_key`);--> statement-breakpoint
CREATE TABLE `form_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`version` integer NOT NULL,
	`funnel` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`sub_account_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft` text NOT NULL,
	`published_version_id` text,
	`created_from_template_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_slug_unique` ON `forms` (`slug`);--> statement-breakpoint
CREATE INDEX `forms_sub_account` ON `forms` (`sub_account_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`sub_account_id` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`user_id` text NOT NULL,
	`sub_account_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_account` ON `memberships` (`user_id`,`sub_account_id`);--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text,
	`template_id` text,
	`token_hash` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_hash_unique` ON `share_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sub_account_secrets` (
	`sub_account_id` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sub_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`branding` text,
	`plan` text DEFAULT 'internal' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sub_accounts_slug_unique` ON `sub_accounts` (`slug`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`sub_account_id` text NOT NULL,
	`form_version_id` text NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`current_question_key` text,
	`end_screen_key` text,
	`params` text,
	`fbp` text,
	`fbc` text,
	`ip` text,
	`user_agent` text,
	`email` text,
	`email_status` text,
	`email_risk` text,
	`email_verified` integer DEFAULT false NOT NULL,
	`email_verified_at` integer,
	`phone_e164` text,
	`phone_verified` integer DEFAULT false NOT NULL,
	`phone_verified_at` integer,
	`address_line1` text,
	`address_line2` text,
	`town` text,
	`county` text,
	`postcode` text,
	`country` text,
	`uprn` text,
	`ghl_contact_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_version_id`) REFERENCES `form_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `submissions_form` ON `submissions` (`form_id`,`status`);--> statement-breakpoint
CREATE INDEX `submissions_account` ON `submissions` (`sub_account_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text,
	`thumbnail_url` text,
	`funnel` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`sub_account_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`sub_account_id`) REFERENCES `sub_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`password_hash` text,
	`is_super_admin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`channel` text NOT NULL,
	`target` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sends_count` integer DEFAULT 0 NOT NULL,
	`last_sent_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
