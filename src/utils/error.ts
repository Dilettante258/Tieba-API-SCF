import { TiebaError } from "tieba.js";
import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const handleError: ErrorHandler = (err, c) => {
	if (err instanceof TiebaError) {
		return c.json(
			{ error: err._tag, message: err.message },
			err.httpStatus as ContentfulStatusCode,
		);
	}
	console.error("Unexpected error:", err);
	return c.json({ error: "InternalError", message: "内部服务器错误" }, 500);
};
