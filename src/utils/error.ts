import type {Hook} from "@hono/zod-openapi";
import type {Env} from "hono";

function formatZodErrors(result) {
  return result.error.issues.map((issue) => ({
    message: issue.message,
    path: issue.path,
  }))
}

export const commonErrorHook: Hook<any, Env, any, any> = (result, c) => {
  if (!result.success) {
    console.log(result.error)
    return c.json(
      {
        ok: false,
        errors: formatZodErrors(result),
        source: 'custom_error_handler',
      },
      422
    )
  }
}
