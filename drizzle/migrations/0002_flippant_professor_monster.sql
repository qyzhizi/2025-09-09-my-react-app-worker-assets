CREATE TABLE `vaultsManager` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`default_sync_vaults` text(255) DEFAULT 'memoflow' NOT NULL,
	`current_sync_vaults` text(255) DEFAULT 'memoflow' NOT NULL,
	`other_sync_vaults` text,
	`folder_index_in_vault` integer DEFAULT 0 NOT NULL,
	`file_index_in_folder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `github_access` DROP COLUMN `current_sync_file`;--> statement-breakpoint
ALTER TABLE `github_access` DROP COLUMN `other_sync_file_list`;