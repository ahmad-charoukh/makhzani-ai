CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`before` text,
	`after` text,
	`reason` text DEFAULT '',
	`ip` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_business` ON `audit_logs` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`lot` text NOT NULL,
	`expires` text,
	`quantity` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "batch_nonnegative" CHECK("batches"."quantity">=0)
);
--> statement-breakpoint
CREATE INDEX `batch_fefo` ON `batches` (`business_id`,`product_id`,`warehouse_id`,`expires`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_owner_unique` ON `businesses` (`owner`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_role" CHECK("members"."role" IN ('owner','manager','employee'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_email` ON `members` (`business_id`,`email`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`product_id` text NOT NULL,
	`warehouse_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`delta` integer NOT NULL,
	`expected` integer,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`invoice` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movement_reporting` ON `movements` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `movement_product` ON `movements` (`business_id`,`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`actor` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`product_id` text NOT NULL,
	`price` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text NOT NULL,
	`sku` text NOT NULL,
	`category` text DEFAULT 'عام' NOT NULL,
	`subcategory` text DEFAULT '',
	`brand` text DEFAULT '',
	`description` text DEFAULT '',
	`unit` text DEFAULT 'قطعة' NOT NULL,
	`minimum` integer DEFAULT 5000 NOT NULL,
	`purchase_price` integer DEFAULT 0 NOT NULL,
	`selling_price` integer DEFAULT 0 NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`supplier_id` text,
	`shelf` text DEFAULT '',
	`notes` text DEFAULT '',
	`expiry_enabled` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prices_nonnegative" CHECK("products"."purchase_price">=0 AND "products"."selling_price">=0 AND "products"."minimum">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `barcode_business` ON `products` (`business_id`,`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `sku_business` ON `products` (`business_id`,`sku`);--> statement-breakpoint
CREATE INDEX `product_search` ON `products` (`business_id`,`active`,`name`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`price` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "receive_bounds" CHECK("purchase_items"."received">=0 AND "purchase_items"."received"<="purchase_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`business_id` text PRIMARY KEY NOT NULL,
	`units` text DEFAULT '[]' NOT NULL,
	`currency` text DEFAULT 'TRY' NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '',
	`email` text DEFAULT '',
	`address` text DEFAULT '',
	`tax_info` text DEFAULT '',
	`notes` text DEFAULT '',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`branch` text DEFAULT 'الفرع الرئيسي' NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TRIGGER movement_guard BEFORE INSERT ON movements BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM batches b JOIN products p ON p.id=b.product_id JOIN warehouses w ON w.id=b.warehouse_id JOIN operations o ON o.id=NEW.operation_id WHERE b.id=NEW.batch_id AND b.business_id=NEW.business_id AND p.business_id=NEW.business_id AND w.business_id=NEW.business_id AND o.business_id=NEW.business_id AND b.product_id=NEW.product_id AND b.warehouse_id=NEW.warehouse_id) THEN RAISE(ABORT,'scope mismatch') END;
 SELECT CASE WHEN NEW.expected IS NOT NULL AND NEW.expected != COALESCE((SELECT SUM(quantity) FROM batches WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id),0) THEN RAISE(ABORT,'stale stock') END;
 SELECT CASE WHEN (SELECT quantity FROM batches WHERE id=NEW.batch_id)+NEW.delta<0 THEN RAISE(ABORT,'negative stock') END;
 SELECT CASE WHEN NEW.delta<0 AND NEW.kind='out' AND (SELECT expires FROM batches WHERE id=NEW.batch_id)<date('now') THEN RAISE(ABORT,'expired stock') END;
END;
--> statement-breakpoint
CREATE TRIGGER movement_balance AFTER INSERT ON movements BEGIN UPDATE batches SET quantity=quantity+NEW.delta WHERE id=NEW.batch_id; END;
--> statement-breakpoint
CREATE TRIGGER movement_immutable_update BEFORE UPDATE ON movements BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
--> statement-breakpoint
CREATE TRIGGER movement_immutable_delete BEFORE DELETE ON movements BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'immutable audit'); END;
--> statement-breakpoint
CREATE TRIGGER purchase_receive_guard BEFORE UPDATE OF received ON purchase_items BEGIN SELECT CASE WHEN (SELECT status FROM purchases WHERE id=NEW.purchase_id) NOT IN ('confirmed','partial') THEN RAISE(ABORT,'stale purchase') END; END;
