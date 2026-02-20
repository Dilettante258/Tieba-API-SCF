import { TiebaError } from "tieba.js";
import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

function normalizeError(err: unknown): {
	message: string;
	stack?: string;
} {
	if (err instanceof Error) {
		return {
			message: err.message,
			stack: err.stack,
		};
	}
	return {
		message: String(err),
	};
}

function toStatusCode(status: unknown): ContentfulStatusCode {
	const code = Number(status);
	if (Number.isInteger(code) && code >= 400 && code <= 599) {
		return code as ContentfulStatusCode;
	}
	return 500;
}

export const handleError: ErrorHandler = (err, c) => {
	const { message, stack } = normalizeError(err);
	const reqInfo = `${c.req.method} ${c.req.path}`;

	// 调试期保留完整错误日志，便于从平台日志排查。
	console.error(`[API Error] ${reqInfo}`, err);

	if (err instanceof TiebaError) {
		return c.json(
			{
				error: err._tag,
				message,
				stack,
			},
			toStatusCode(err.httpStatus),
		);
	}

	return c.json(
		{
			error: "InternalError",
			message,
			stack,
		},
		500,
	);
};
