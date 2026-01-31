ALTER TABLE `github_access` ADD `vault_name` text(255) DEFAULT 'memoflow' NOT NULL;--> statement-breakpoint
ALTER TABLE `github_access` ADD `folder_index_in_vault` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `github_access` ADD `file_index_in_folder` integer DEFAULT 0 NOT NULL;