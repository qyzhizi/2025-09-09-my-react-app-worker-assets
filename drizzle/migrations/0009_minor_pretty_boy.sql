PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_github_access` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`branch` text(255),
	`github_repo_name` text(255),
	`vault_path_in_repo` text(255),
	`access_token` text(255),
	`access_token_expires_at` integer,
	`refresh_token` text(255),
	`refresh_token_expires_at` integer,
	`github_user_name` text(255),
	`vault_name` text(255) DEFAULT 'memoflowVault' NOT NULL,
	`folder_index_in_vault` integer DEFAULT 0 NOT NULL,
	`file_index_in_folder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_github_access`("id", "user_id", "branch", "github_repo_name", "vault_path_in_repo", "access_token", "access_token_expires_at", "refresh_token", "refresh_token_expires_at", "github_user_name", "vault_name", "folder_index_in_vault", "file_index_in_folder") SELECT "id", "user_id", "branch", "github_repo_name", "vault_path_in_repo", "access_token", "access_token_expires_at", "refresh_token", "refresh_token_expires_at", "github_user_name", "vault_name", "folder_index_in_vault", "file_index_in_folder" FROM `github_access`;--> statement-breakpoint
DROP TABLE `github_access`;--> statement-breakpoint
ALTER TABLE `__new_github_access` RENAME TO `github_access`;--> statement-breakpoint
PRAGMA foreign_keys=ON;