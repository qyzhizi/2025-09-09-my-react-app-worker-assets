ALTER TABLE `vaults` RENAME TO `vault`;--> statement-breakpoint
ALTER TABLE `vault` RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vault` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`vault_name` text(255) DEFAULT 'memoflow' NOT NULL,
	`status` text DEFAULT 'current' NOT NULL,
	`folder_index_in_vault` integer DEFAULT 0 NOT NULL,
	`file_index_in_folder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_vault`("id", "user_id", "vault_name", "status", "folder_index_in_vault", "file_index_in_folder") SELECT "id", "user_id", "vault_name", "status", "folder_index_in_vault", "file_index_in_folder" FROM `vault`;--> statement-breakpoint
DROP TABLE `vault`;--> statement-breakpoint
ALTER TABLE `__new_vault` RENAME TO `vault`;--> statement-breakpoint
PRAGMA foreign_keys=ON;