import {z} from "@hono/zod-openapi";

export const errorMessageSchema = z.object({
  error: z.string(),
  stack: z.string()
})

export const methodWithPageSchema = z.object({
  method: z.enum(['uid', 'id', 'un']).openapi({
    param: {
      name: 'method',
      in: 'query'
    },
    description: '定位用户的方法。uid指代`user_id`，id指代手机贴吧个人主页ID，un指代`username`用户名。',
    default: 'un',
    example: 'un',
  }),
  id: z
    .string()
    .openapi({
      param: {
        name: 'id',
        in: 'query'
      },
      example: '悲伤逆流成蓮',
    }),
  page: z
    .string().optional()
    .openapi({
      param: {
        name: 'page',
        in: 'query'
      },
      default: '1',
      description: "页码数"
    }),
})

export const methodSpecSchema = z.object({
  method: z.enum(['uid', 'id', 'un']).openapi({
    param: {
      name: 'method',
      in: 'query'
    },
    description: '查询的关键字',
    example: 'un',
  }),
  id: z
    .string()
    .openapi({
      param: {
        name: 'id',
        in: 'query'
      },
      example: '悲伤逆流成蓮',
    })
})

export const privSets = z.object({
  bazhu_show_inside: z.number().openapi({
    example: 3
  }),
  bazhu_show_outside: z.number().openapi({
    example: 3
  }),
  friend: z.number().openapi({
    example: 3
  }),
  group: z.number().openapi({
    example: 3
  }),
  like: z.number().openapi({
    example: 3
  }),
  live: z.number().openapi({
    example: 1
  }),
  location: z.number().openapi({
    example: 3
  }),
  post: z.number().openapi({
    example: 3
  }),
  reply: z.number().openapi({
    example: 1
  })
}).partial().openapi("privSets");
