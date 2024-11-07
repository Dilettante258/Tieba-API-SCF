import { pgTable, check, timestamp, text, integer, bigint, pgView, boolean, doublePrecision, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const postgresLog = pgTable("postgres_log", {
	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }).notNull(),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}, (table) => {
	return {
		postgresLogCheck: check("postgres_log_check", sql`CHECK (false) NO INHERIT`),
	}
});
export const pgAuthMon = pgView("pg_auth_mon", {	// TODO: failed to parse database type 'name'
	rolname: text("rolname"),
	deleted: boolean(),
	// TODO: failed to parse database type 'oid'
	uid: text("uid"),
	successfulAttempts: integer("successful_attempts"),
	lastSuccessfulTs: timestamp("last_successful_ts", { withTimezone: true, mode: 'string' }),
	totalHbaConflicts: integer("total_hba_conflicts"),
	otherAuthFailures: integer("other_auth_failures"),
	lastFailedTs: timestamp("last_failed_ts", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT COALESCE(pg_roles.rolname, pg_auth_mon.rolename_at_last_login_attempt) AS rolname, pg_roles.rolname IS NULL AS deleted, CASE WHEN pg_roles.rolname IS NULL THEN 0::oid ELSE pg_auth_mon.uid END AS uid, pg_auth_mon.successful_attempts, pg_auth_mon.last_successful_ts, pg_auth_mon.total_hba_conflicts, pg_auth_mon.other_auth_failures, pg_auth_mon.last_failed_ts FROM pg_auth_mon() pg_auth_mon(uid, successful_attempts, last_successful_ts, total_hba_conflicts, other_auth_failures, last_failed_ts, rolename_at_last_login_attempt) LEFT JOIN pg_roles ON pg_roles.oid = pg_auth_mon.uid`);

export const failedAuthentication1 = pgView("failed_authentication_1", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_1.log_time, postgres_log_1.user_name, postgres_log_1.database_name, postgres_log_1.process_id, postgres_log_1.connection_from, postgres_log_1.session_id, postgres_log_1.session_line_num, postgres_log_1.command_tag, postgres_log_1.session_start_time, postgres_log_1.virtual_transaction_id, postgres_log_1.transaction_id, postgres_log_1.error_severity, postgres_log_1.sql_state_code, postgres_log_1.message, postgres_log_1.detail, postgres_log_1.hint, postgres_log_1.internal_query, postgres_log_1.internal_query_pos, postgres_log_1.context, postgres_log_1.query, postgres_log_1.query_pos, postgres_log_1.location, postgres_log_1.application_name, postgres_log_1.backend_type, postgres_log_1.leader_pid, postgres_log_1.query_id FROM postgres_log_1 WHERE postgres_log_1.command_tag = 'authentication'::text AND postgres_log_1.error_severity = 'FATAL'::text`);

export const failedAuthentication2 = pgView("failed_authentication_2", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_2.log_time, postgres_log_2.user_name, postgres_log_2.database_name, postgres_log_2.process_id, postgres_log_2.connection_from, postgres_log_2.session_id, postgres_log_2.session_line_num, postgres_log_2.command_tag, postgres_log_2.session_start_time, postgres_log_2.virtual_transaction_id, postgres_log_2.transaction_id, postgres_log_2.error_severity, postgres_log_2.sql_state_code, postgres_log_2.message, postgres_log_2.detail, postgres_log_2.hint, postgres_log_2.internal_query, postgres_log_2.internal_query_pos, postgres_log_2.context, postgres_log_2.query, postgres_log_2.query_pos, postgres_log_2.location, postgres_log_2.application_name, postgres_log_2.backend_type, postgres_log_2.leader_pid, postgres_log_2.query_id FROM postgres_log_2 WHERE postgres_log_2.command_tag = 'authentication'::text AND postgres_log_2.error_severity = 'FATAL'::text`);

export const failedAuthentication0 = pgView("failed_authentication_0", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_0.log_time, postgres_log_0.user_name, postgres_log_0.database_name, postgres_log_0.process_id, postgres_log_0.connection_from, postgres_log_0.session_id, postgres_log_0.session_line_num, postgres_log_0.command_tag, postgres_log_0.session_start_time, postgres_log_0.virtual_transaction_id, postgres_log_0.transaction_id, postgres_log_0.error_severity, postgres_log_0.sql_state_code, postgres_log_0.message, postgres_log_0.detail, postgres_log_0.hint, postgres_log_0.internal_query, postgres_log_0.internal_query_pos, postgres_log_0.context, postgres_log_0.query, postgres_log_0.query_pos, postgres_log_0.location, postgres_log_0.application_name, postgres_log_0.backend_type, postgres_log_0.leader_pid, postgres_log_0.query_id FROM postgres_log_0 WHERE postgres_log_0.command_tag = 'authentication'::text AND postgres_log_0.error_severity = 'FATAL'::text`);

export const failedAuthentication5 = pgView("failed_authentication_5", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_5.log_time, postgres_log_5.user_name, postgres_log_5.database_name, postgres_log_5.process_id, postgres_log_5.connection_from, postgres_log_5.session_id, postgres_log_5.session_line_num, postgres_log_5.command_tag, postgres_log_5.session_start_time, postgres_log_5.virtual_transaction_id, postgres_log_5.transaction_id, postgres_log_5.error_severity, postgres_log_5.sql_state_code, postgres_log_5.message, postgres_log_5.detail, postgres_log_5.hint, postgres_log_5.internal_query, postgres_log_5.internal_query_pos, postgres_log_5.context, postgres_log_5.query, postgres_log_5.query_pos, postgres_log_5.location, postgres_log_5.application_name, postgres_log_5.backend_type, postgres_log_5.leader_pid, postgres_log_5.query_id FROM postgres_log_5 WHERE postgres_log_5.command_tag = 'authentication'::text AND postgres_log_5.error_severity = 'FATAL'::text`);

export const failedAuthentication3 = pgView("failed_authentication_3", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_3.log_time, postgres_log_3.user_name, postgres_log_3.database_name, postgres_log_3.process_id, postgres_log_3.connection_from, postgres_log_3.session_id, postgres_log_3.session_line_num, postgres_log_3.command_tag, postgres_log_3.session_start_time, postgres_log_3.virtual_transaction_id, postgres_log_3.transaction_id, postgres_log_3.error_severity, postgres_log_3.sql_state_code, postgres_log_3.message, postgres_log_3.detail, postgres_log_3.hint, postgres_log_3.internal_query, postgres_log_3.internal_query_pos, postgres_log_3.context, postgres_log_3.query, postgres_log_3.query_pos, postgres_log_3.location, postgres_log_3.application_name, postgres_log_3.backend_type, postgres_log_3.leader_pid, postgres_log_3.query_id FROM postgres_log_3 WHERE postgres_log_3.command_tag = 'authentication'::text AND postgres_log_3.error_severity = 'FATAL'::text`);

export const failedAuthentication4 = pgView("failed_authentication_4", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_4.log_time, postgres_log_4.user_name, postgres_log_4.database_name, postgres_log_4.process_id, postgres_log_4.connection_from, postgres_log_4.session_id, postgres_log_4.session_line_num, postgres_log_4.command_tag, postgres_log_4.session_start_time, postgres_log_4.virtual_transaction_id, postgres_log_4.transaction_id, postgres_log_4.error_severity, postgres_log_4.sql_state_code, postgres_log_4.message, postgres_log_4.detail, postgres_log_4.hint, postgres_log_4.internal_query, postgres_log_4.internal_query_pos, postgres_log_4.context, postgres_log_4.query, postgres_log_4.query_pos, postgres_log_4.location, postgres_log_4.application_name, postgres_log_4.backend_type, postgres_log_4.leader_pid, postgres_log_4.query_id FROM postgres_log_4 WHERE postgres_log_4.command_tag = 'authentication'::text AND postgres_log_4.error_severity = 'FATAL'::text`);

export const failedAuthentication6 = pgView("failed_authentication_6", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_6.log_time, postgres_log_6.user_name, postgres_log_6.database_name, postgres_log_6.process_id, postgres_log_6.connection_from, postgres_log_6.session_id, postgres_log_6.session_line_num, postgres_log_6.command_tag, postgres_log_6.session_start_time, postgres_log_6.virtual_transaction_id, postgres_log_6.transaction_id, postgres_log_6.error_severity, postgres_log_6.sql_state_code, postgres_log_6.message, postgres_log_6.detail, postgres_log_6.hint, postgres_log_6.internal_query, postgres_log_6.internal_query_pos, postgres_log_6.context, postgres_log_6.query, postgres_log_6.query_pos, postgres_log_6.location, postgres_log_6.application_name, postgres_log_6.backend_type, postgres_log_6.leader_pid, postgres_log_6.query_id FROM postgres_log_6 WHERE postgres_log_6.command_tag = 'authentication'::text AND postgres_log_6.error_severity = 'FATAL'::text`);

export const failedAuthentication7 = pgView("failed_authentication_7", {	logTime: timestamp("log_time", { precision: 3, withTimezone: true, mode: 'string' }),
	userName: text("user_name"),
	databaseName: text("database_name"),
	processId: integer("process_id"),
	connectionFrom: text("connection_from"),
	sessionId: text("session_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionLineNum: bigint("session_line_num", { mode: "number" }),
	commandTag: text("command_tag"),
	sessionStartTime: timestamp("session_start_time", { withTimezone: true, mode: 'string' }),
	virtualTransactionId: text("virtual_transaction_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	transactionId: bigint("transaction_id", { mode: "number" }),
	errorSeverity: text("error_severity"),
	sqlStateCode: text("sql_state_code"),
	message: text(),
	detail: text(),
	hint: text(),
	internalQuery: text("internal_query"),
	internalQueryPos: integer("internal_query_pos"),
	context: text(),
	query: text(),
	queryPos: integer("query_pos"),
	location: text(),
	applicationName: text("application_name"),
	backendType: text("backend_type"),
	leaderPid: integer("leader_pid"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryId: bigint("query_id", { mode: "number" }),
}).with({"securityBarrier":true}).as(sql`SELECT postgres_log_7.log_time, postgres_log_7.user_name, postgres_log_7.database_name, postgres_log_7.process_id, postgres_log_7.connection_from, postgres_log_7.session_id, postgres_log_7.session_line_num, postgres_log_7.command_tag, postgres_log_7.session_start_time, postgres_log_7.virtual_transaction_id, postgres_log_7.transaction_id, postgres_log_7.error_severity, postgres_log_7.sql_state_code, postgres_log_7.message, postgres_log_7.detail, postgres_log_7.hint, postgres_log_7.internal_query, postgres_log_7.internal_query_pos, postgres_log_7.context, postgres_log_7.query, postgres_log_7.query_pos, postgres_log_7.location, postgres_log_7.application_name, postgres_log_7.backend_type, postgres_log_7.leader_pid, postgres_log_7.query_id FROM postgres_log_7 WHERE postgres_log_7.command_tag = 'authentication'::text AND postgres_log_7.error_severity = 'FATAL'::text`);

export const pgStatKcacheDetail = pgView("pg_stat_kcache_detail", {	query: text(),
	top: boolean(),
	// TODO: failed to parse database type 'name'
	datname: text("datname"),
	// TODO: failed to parse database type 'name'
	rolname: text("rolname"),
	planUserTime: doublePrecision("plan_user_time"),
	planSystemTime: doublePrecision("plan_system_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planMinflts: bigint("plan_minflts", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planMajflts: bigint("plan_majflts", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planNswaps: bigint("plan_nswaps", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planReads: bigint("plan_reads", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planReadsBlks: bigint("plan_reads_blks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planWrites: bigint("plan_writes", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planWritesBlks: bigint("plan_writes_blks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planMsgsnds: bigint("plan_msgsnds", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planMsgrcvs: bigint("plan_msgrcvs", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planNsignals: bigint("plan_nsignals", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planNvcsws: bigint("plan_nvcsws", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planNivcsws: bigint("plan_nivcsws", { mode: "number" }),
	execUserTime: doublePrecision("exec_user_time"),
	execSystemTime: doublePrecision("exec_system_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execMinflts: bigint("exec_minflts", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execMajflts: bigint("exec_majflts", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execNswaps: bigint("exec_nswaps", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execReads: bigint("exec_reads", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execReadsBlks: bigint("exec_reads_blks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execWrites: bigint("exec_writes", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execWritesBlks: bigint("exec_writes_blks", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execMsgsnds: bigint("exec_msgsnds", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execMsgrcvs: bigint("exec_msgrcvs", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execNsignals: bigint("exec_nsignals", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execNvcsws: bigint("exec_nvcsws", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	execNivcsws: bigint("exec_nivcsws", { mode: "number" }),
}).as(sql`SELECT s.query, k.top, d.datname, r.rolname, k.plan_user_time, k.plan_system_time, k.plan_minflts, k.plan_majflts, k.plan_nswaps, k.plan_reads, k.plan_reads / current_setting('block_size'::text)::integer AS plan_reads_blks, k.plan_writes, k.plan_writes / current_setting('block_size'::text)::integer AS plan_writes_blks, k.plan_msgsnds, k.plan_msgrcvs, k.plan_nsignals, k.plan_nvcsws, k.plan_nivcsws, k.exec_user_time, k.exec_system_time, k.exec_minflts, k.exec_majflts, k.exec_nswaps, k.exec_reads, k.exec_reads / current_setting('block_size'::text)::integer AS exec_reads_blks, k.exec_writes, k.exec_writes / current_setting('block_size'::text)::integer AS exec_writes_blks, k.exec_msgsnds, k.exec_msgrcvs, k.exec_nsignals, k.exec_nvcsws, k.exec_nivcsws FROM pg_stat_kcache() k(queryid, top, userid, dbid, plan_reads, plan_writes, plan_user_time, plan_system_time, plan_minflts, plan_majflts, plan_nswaps, plan_msgsnds, plan_msgrcvs, plan_nsignals, plan_nvcsws, plan_nivcsws, exec_reads, exec_writes, exec_user_time, exec_system_time, exec_minflts, exec_majflts, exec_nswaps, exec_msgsnds, exec_msgrcvs, exec_nsignals, exec_nvcsws, exec_nivcsws) JOIN pg_stat_statements s ON k.queryid = s.queryid AND k.dbid = s.dbid AND k.userid = s.userid JOIN pg_database d ON d.oid = s.dbid JOIN pg_roles r ON r.oid = s.userid`);

export const pgStatKcache = pgView("pg_stat_kcache", {	// TODO: failed to parse database type 'name'
	datname: text("datname"),
	planUserTime: doublePrecision("plan_user_time"),
	planSystemTime: doublePrecision("plan_system_time"),
	planMinflts: numeric("plan_minflts"),
	planMajflts: numeric("plan_majflts"),
	planNswaps: numeric("plan_nswaps"),
	planReads: numeric("plan_reads"),
	planReadsBlks: numeric("plan_reads_blks"),
	planWrites: numeric("plan_writes"),
	planWritesBlks: numeric("plan_writes_blks"),
	planMsgsnds: numeric("plan_msgsnds"),
	planMsgrcvs: numeric("plan_msgrcvs"),
	planNsignals: numeric("plan_nsignals"),
	planNvcsws: numeric("plan_nvcsws"),
	planNivcsws: numeric("plan_nivcsws"),
	execUserTime: doublePrecision("exec_user_time"),
	execSystemTime: doublePrecision("exec_system_time"),
	execMinflts: numeric("exec_minflts"),
	execMajflts: numeric("exec_majflts"),
	execNswaps: numeric("exec_nswaps"),
	execReads: numeric("exec_reads"),
	execReadsBlks: numeric("exec_reads_blks"),
	execWrites: numeric("exec_writes"),
	execWritesBlks: numeric("exec_writes_blks"),
	execMsgsnds: numeric("exec_msgsnds"),
	execMsgrcvs: numeric("exec_msgrcvs"),
	execNsignals: numeric("exec_nsignals"),
	execNvcsws: numeric("exec_nvcsws"),
	execNivcsws: numeric("exec_nivcsws"),
}).as(sql`SELECT pg_stat_kcache_detail.datname, sum(pg_stat_kcache_detail.plan_user_time) AS plan_user_time, sum(pg_stat_kcache_detail.plan_system_time) AS plan_system_time, sum(pg_stat_kcache_detail.plan_minflts) AS plan_minflts, sum(pg_stat_kcache_detail.plan_majflts) AS plan_majflts, sum(pg_stat_kcache_detail.plan_nswaps) AS plan_nswaps, sum(pg_stat_kcache_detail.plan_reads) AS plan_reads, sum(pg_stat_kcache_detail.plan_reads_blks) AS plan_reads_blks, sum(pg_stat_kcache_detail.plan_writes) AS plan_writes, sum(pg_stat_kcache_detail.plan_writes_blks) AS plan_writes_blks, sum(pg_stat_kcache_detail.plan_msgsnds) AS plan_msgsnds, sum(pg_stat_kcache_detail.plan_msgrcvs) AS plan_msgrcvs, sum(pg_stat_kcache_detail.plan_nsignals) AS plan_nsignals, sum(pg_stat_kcache_detail.plan_nvcsws) AS plan_nvcsws, sum(pg_stat_kcache_detail.plan_nivcsws) AS plan_nivcsws, sum(pg_stat_kcache_detail.exec_user_time) AS exec_user_time, sum(pg_stat_kcache_detail.exec_system_time) AS exec_system_time, sum(pg_stat_kcache_detail.exec_minflts) AS exec_minflts, sum(pg_stat_kcache_detail.exec_majflts) AS exec_majflts, sum(pg_stat_kcache_detail.exec_nswaps) AS exec_nswaps, sum(pg_stat_kcache_detail.exec_reads) AS exec_reads, sum(pg_stat_kcache_detail.exec_reads_blks) AS exec_reads_blks, sum(pg_stat_kcache_detail.exec_writes) AS exec_writes, sum(pg_stat_kcache_detail.exec_writes_blks) AS exec_writes_blks, sum(pg_stat_kcache_detail.exec_msgsnds) AS exec_msgsnds, sum(pg_stat_kcache_detail.exec_msgrcvs) AS exec_msgrcvs, sum(pg_stat_kcache_detail.exec_nsignals) AS exec_nsignals, sum(pg_stat_kcache_detail.exec_nvcsws) AS exec_nvcsws, sum(pg_stat_kcache_detail.exec_nivcsws) AS exec_nivcsws FROM pg_stat_kcache_detail WHERE pg_stat_kcache_detail.top IS TRUE GROUP BY pg_stat_kcache_detail.datname`);

export const pgStatStatementsInfo = pgView("pg_stat_statements_info", {	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	dealloc: bigint({ mode: "number" }),
	statsReset: timestamp("stats_reset", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT pg_stat_statements_info.dealloc, pg_stat_statements_info.stats_reset FROM pg_stat_statements_info() pg_stat_statements_info(dealloc, stats_reset)`);

export const pgStatStatements = pgView("pg_stat_statements", {	// TODO: failed to parse database type 'oid'
	userid: text("userid"),
	// TODO: failed to parse database type 'oid'
	dbid: text("dbid"),
	toplevel: boolean(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	queryid: bigint({ mode: "number" }),
	query: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	plans: bigint({ mode: "number" }),
	totalPlanTime: doublePrecision("total_plan_time"),
	minPlanTime: doublePrecision("min_plan_time"),
	maxPlanTime: doublePrecision("max_plan_time"),
	meanPlanTime: doublePrecision("mean_plan_time"),
	stddevPlanTime: doublePrecision("stddev_plan_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	calls: bigint({ mode: "number" }),
	totalExecTime: doublePrecision("total_exec_time"),
	minExecTime: doublePrecision("min_exec_time"),
	maxExecTime: doublePrecision("max_exec_time"),
	meanExecTime: doublePrecision("mean_exec_time"),
	stddevExecTime: doublePrecision("stddev_exec_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	rows: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sharedBlksHit: bigint("shared_blks_hit", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sharedBlksRead: bigint("shared_blks_read", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sharedBlksDirtied: bigint("shared_blks_dirtied", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sharedBlksWritten: bigint("shared_blks_written", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	localBlksHit: bigint("local_blks_hit", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	localBlksRead: bigint("local_blks_read", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	localBlksDirtied: bigint("local_blks_dirtied", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	localBlksWritten: bigint("local_blks_written", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tempBlksRead: bigint("temp_blks_read", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tempBlksWritten: bigint("temp_blks_written", { mode: "number" }),
	blkReadTime: doublePrecision("blk_read_time"),
	blkWriteTime: doublePrecision("blk_write_time"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	walRecords: bigint("wal_records", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	walFpi: bigint("wal_fpi", { mode: "number" }),
	walBytes: numeric("wal_bytes"),
}).as(sql`SELECT pg_stat_statements.userid, pg_stat_statements.dbid, pg_stat_statements.toplevel, pg_stat_statements.queryid, pg_stat_statements.query, pg_stat_statements.plans, pg_stat_statements.total_plan_time, pg_stat_statements.min_plan_time, pg_stat_statements.max_plan_time, pg_stat_statements.mean_plan_time, pg_stat_statements.stddev_plan_time, pg_stat_statements.calls, pg_stat_statements.total_exec_time, pg_stat_statements.min_exec_time, pg_stat_statements.max_exec_time, pg_stat_statements.mean_exec_time, pg_stat_statements.stddev_exec_time, pg_stat_statements.rows, pg_stat_statements.shared_blks_hit, pg_stat_statements.shared_blks_read, pg_stat_statements.shared_blks_dirtied, pg_stat_statements.shared_blks_written, pg_stat_statements.local_blks_hit, pg_stat_statements.local_blks_read, pg_stat_statements.local_blks_dirtied, pg_stat_statements.local_blks_written, pg_stat_statements.temp_blks_read, pg_stat_statements.temp_blks_written, pg_stat_statements.blk_read_time, pg_stat_statements.blk_write_time, pg_stat_statements.wal_records, pg_stat_statements.wal_fpi, pg_stat_statements.wal_bytes FROM pg_stat_statements(true) pg_stat_statements(userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, blk_read_time, blk_write_time, wal_records, wal_fpi, wal_bytes)`);
