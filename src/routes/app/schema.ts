import {z} from "@hono/zod-openapi";

export const aSchema = z.object({
  id: z
    .string()
    .openapi({
      param: {
        name: 'id',
        in: 'query'
      },
      example: 'v',
    }),
  password: z
    .string()
    .openapi({
      param: {
        name: 'page',
        in: 'query'
      },
      default: '1',
      example: '1',
      description: '页码，应该是小于500的正整数。'
    })
})

export const oAuthQuerySchema = z.object({
  code: z
    .string()
    .openapi({
      param: {
        name: 'code',
        in: 'query'
      },
      example: 'a820a120b50bf0ca0aa9',
    }),
})
