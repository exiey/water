import { pgTable, serial, timestamp, index, pgPolicy, real, varchar, text, unique, boolean, integer } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const monitoringData = pgTable("monitoring_data", {
	id: serial().primaryKey().notNull(),
	waterFlow: real("water_flow").notNull(), // 瞬时流量 (m³/s)
	totalFlow: real("total_flow").default(0), // 累计流量 (m³)
	waterLevel: real("water_level").notNull(), // 水位 (cm)
	waterQuality: real("water_quality").notNull(), // TDS值 (ppm)
	eulerAngleX: real("euler_angle_x").notNull(), // 欧拉角X/横滚角 (度)
	eulerAngleY: real("euler_angle_y").notNull(), // 欧拉角Y/俯仰角 (度)
	eulerAngleZ: real("euler_angle_z").notNull(), // 欧拉角Z/偏航角 (度)
	loraStatus: varchar("lora_status", { length: 20 }).default('connected').notNull(), // LoRa状态: connected/disconnected
	recordedAt: timestamp("recorded_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("monitoring_data_recorded_at_idx").using("btree", table.recordedAt.asc().nullsLast().op("timestamptz_ops")),
	pgPolicy("monitoring_data_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("monitoring_data_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("monitoring_data_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("monitoring_data_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const aiConversations = pgTable("ai_conversations", {
	id: serial().primaryKey().notNull(),
	role: varchar({ length: 20 }).notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_conversations_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	pgPolicy("ai_conversations_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("ai_conversations_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("ai_conversations_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("ai_conversations_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const calibrations = pgTable("calibrations", {
	id: serial().primaryKey().notNull(),
	parameterType: varchar("parameter_type", { length: 50 }).notNull(),
	offsetValue: real("offset_value").default(0).notNull(),
	scaleFactor: real("scale_factor").default(1).notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("calibrations_parameter_type_idx").using("btree", table.parameterType.asc().nullsLast().op("text_ops")),
	unique("calibrations_parameter_type_unique").on(table.parameterType),
	pgPolicy("calibrations_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("calibrations_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("calibrations_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("calibrations_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const thresholds = pgTable("thresholds", {
	id: serial().primaryKey().notNull(),
	parameterType: varchar("parameter_type", { length: 50 }).notNull(),
	minValue: real("min_value").notNull(),
	maxValue: real("max_value").notNull(),
	unit: varchar({ length: 20 }).notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("thresholds_parameter_type_idx").using("btree", table.parameterType.asc().nullsLast().op("text_ops")),
	unique("thresholds_parameter_type_unique").on(table.parameterType),
	pgPolicy("thresholds_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("thresholds_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("thresholds_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("thresholds_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

// OneNET云平台配置表
export const onenetConfig = pgTable("onenet_config", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull().default("default"), // 配置名称
	accessKey: varchar("access_key", { length: 255 }).notNull(), // access_key
	productId: varchar("product_id", { length: 100 }).notNull(), // 产品ID
	deviceId: varchar("device_id", { length: 100 }).notNull(), // 设备ID
	deviceKey: varchar("device_key", { length: 255 }), // 设备秘钥（可选）
	isActive: boolean("is_active").default(true).notNull(), // 是否启用
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }), // 最后同步时间
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("onenet_config_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	pgPolicy("onenet_config_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("onenet_config_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("onenet_config_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("onenet_config_允许公开读取", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
]);

// OneNET同步日志表
export const onenetSyncLog = pgTable("onenet_sync_log", {
	id: serial().primaryKey().notNull(),
	configId: integer("config_id").notNull(), // 关联配置ID
	status: varchar({ length: 20 }).notNull(), // success/failed
	message: text(), // 同步消息/错误信息
	dataSnapshot: text("data_snapshot"), // 数据快照（JSON）
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("onenet_sync_log_config_id_idx").using("btree", table.configId.asc().nullsLast().op("int4_ops")),
	index("onenet_sync_log_synced_at_idx").using("btree", table.syncedAt.asc().nullsLast().op("timestamptz_ops")),
	pgPolicy("onenet_sync_log_允许公开删除", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("onenet_sync_log_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("onenet_sync_log_允许公开写入", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("onenet_sync_log_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);
