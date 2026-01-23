ALTER TABLE `vaultsManager` RENAME TO `vaults`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vaults` (
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
INSERT INTO `__new_vaults`("id", "userId", "default_sync_vaults", "current_sync_vaults", "other_sync_vaults", "folder_index_in_vault", "file_index_in_folder") SELECT "id", "userId", "default_sync_vaults", "current_sync_vaults", "other_sync_vaults", "folder_index_in_vault", "file_index_in_folder" FROM `vaults`;--> statement-breakpoint
DROP TABLE `vaults`;--> statement-breakpoint
ALTER TABLE `__new_vaults` RENAME TO `vaults`;--> statement-breakpoint
PRAGMA foreign_keys=ON;