import { z } from '@hono/zod-openapi'
import {privSets} from "../commonSchema.js";

export const getUserInfoParamsSchema = z.object({
  username: z
    .string()
    .openapi({
      param: {
        name: 'username',
        in: 'path',
      },
      example: '悲伤逆流成蓮',
    }),
})

export const UserInfoSchema = z.object({
  tbs: z.string().openapi({
    example: "a906665dd7a0c1c7"
  }),
  raw_name: z.string().openapi({
    example: "Admire_02"
  }),
  id: z.number().openapi({
    example: 5991323492
  }),
  inner_id: z.string().openapi({
    example: "i"
  }),
  creator: z.object({
    name_link: z.string().openapi({
      example: "i"
    }),
    inner_id: z.string().openapi({
      example: "i"
    }),
    is_online: z.boolean().openapi({
      example: false
    }),
    itieba_portrait: z.string().openapi({
      example: "tb.1.1e1bb5f8._oTizPuMkZjpdOI6Dr4GDg"
    }),
    name: z.string().openapi({
      example: "Admire_02"
    }),
    name_show: z.string().openapi({
      example: "Admire_02"
    }),
    show_nickname: z.string().openapi({
      example: "\uD83C\uDF80Admire\uD83D\uDE08"
    }),
    itieba_id: z.string().openapi({
      example: "i"
    }),
    portrait: z.string().openapi({
      example: "tb.1.1e1bb5f8._oTizPuMkZjpdOI6Dr4GDg"
    }),
    is_prison: z.boolean().openapi({
      example: false
    }),
    id: z.number().openapi({
      example: 5991323492
    }),
    is_private: z.boolean().openapi({
      example: false
    }),
    is_verify: z.boolean().openapi({
      example: false
    })
  })
}).openapi("UserInfoSchema");


export const UserPostSchema = z.object({
  forumId: z.number().openapi({
    example: 21841105
  }),
  forumName: z.string().openapi({
    example: "孙笑川"
  }),
  title: z.string().openapi({
    example: "标题例子"
  }),
  threadId: z.string().openapi({
    example: "8972915291"
  }),
  postId: z.string().openapi({
    example: "150086001049"
  }),
  cid: z.string().openapi({
    example: "150086001049"
  }),
  createTime: z.date().openapi({
    example: "2024/4/10 10:00"
  }),
  affiliated: z.boolean().openapi({
    example: false
  }),
  content: z.string().openapi({
    example: "经验加3"
  })
}).array().openapi("UserPostSchema");

export const userLikeForumSchema = z.object({
  id: z.string().openapi({
    example: "27925094"
  }),
  name: z.string().openapi({
    example: "桌饺"
  }),
  favo_type: z.string().openapi({
    example: "0"
  }),
  level_id: z.string().openapi({
    example: "11"
  }),
  level_name: z.string().openapi({
    example: "桌饺军长"
  }),
  cur_score: z.string().openapi({
    example: "3596"
  }),
  levelup_score: z.string().openapi({
    example: "6000"
  }),
  avatar: z.string().openapi({
    example: "http://tiebapic.baidu.com/forum/w%3D120%3Bh%3D120/sign=114edf063dec54e741ec1e1c8903f36d/38dbb6fd5266d0163955cc10d12bd40735fa35bd.jpg?tbpicau=2025-02-18-05_37f484e9591f07ca2ca4fd17f9b1499c"
  }),
  slogan: z.string().openapi({
    example: "示例文本"
  })
}).array().openapi("userLikeForumSchema");


export const userHiddenLikeForumSchema = z.object({
  grade: z.record(z.string(), z.object({
    count: z.number().openapi({
      example: 29
    }),
    forum_list: z.string().array().openapi({
      example: ["bilibili", "v", "steam"]
    })
  })),
  plain: z.string().array().openapi({
    example: ["v", "\u53CD\u6050\u7CBE\u82F1ol", "dota2", "\u65B0\u79D1\u5A18"]
  })
}).openapi("userHiddenLikeForumSchema");


export const userCondenseProfileSchema = z.object({
  name: z.string().openapi({
    example: "\u53EB\u6211\u8001\u51B0\u5C31\u597D\u4E86"
  }),
  nickname: z.string().openapi({
    example: "\u3010\uD83E\uDDCA\u3011\u865A\u73AF\u52A0\u5F3A\u963F\u6893"
  }),
  id: z.string().openapi({
    example: "458523362"
  }),
  uid: z.string().openapi({
    example: "30861022"
  }),
  portrait: z.string().openapi({
    example: "tb.1.5cbeff48.BFTm1j0MhGcFt-QXdcexQw?t=1693901333"
  }),
  fan: z.number().openapi({
    example: 9551
  }),
  follow: z.number().openapi({
    example: 197
  }),
  sex: z.number().openapi({
    example: 2
  }),
  group: z.number().optional().openapi({
    example: 3
  }),
  godData: z.string().optional().openapi({
    example: "\u52A8\u6F2B"
  }),
  ipAddress: z.string().openapi({
    example: "\u5C71\u897F"
  }),
  userGrowth: z.number().openapi({
    example: 10
  }),
  totalAgreeNum: z.string().openapi({
    example: "165020"
  }),
  tbAge: z.string().openapi({
    example: "13.4"
  }),
  postNum: z.string().openapi({
    example: "6.1\u4E07"
  }),
  tbVip: z.boolean().openapi({
    example: false
  }),
  vip: z.object({
    level: z.string().openapi({
      example: "4"
    }),
    status: z.string().openapi({
      example: "0"
    }),
    expireTime: z.number().openapi({
      example: 1738518089
    })
  }),
  manager: z.object({
    manager: z.object({
      count: z.number().openapi({
        example: 1
      }),
      forum_list: z.string().array().openapi({
        example: ["v"]
      })
    })
  })
}).openapi("userCondenseProfileSchema");


const followItemSchema = z.object({
  ala_info: z.object({
    anchor_live: z.number().optional(),
    location: z.string(),
    lng: z.number(),
    lat: z.number(),
  }).optional(),
  bazhu_grade: z.object({
    desc: z.string().openapi({
      example: "双一流高校吧吧主"
    }),
    level: z.string().openapi({
      example: "双一流高校吧吧主"
    }),
  }).partial(),
  business_account_info: z.object({
    is_business_account: z.number().openapi({
      example: 0
    }),
    is_forum_business_account: z.number().openapi({
      example: 0
    })
  }),
  display_auth_type: z.number().openapi({
    example: 0
  }),
  follow_from: z.string().openapi({
    example: "来自贴吧关注"
  }),
  has_concerned: z.number().openapi({
    example: 1
  }),
  id: z.number().openapi({
    example: 5260121165
  }),
  intro: z.string().openapi({
    example: "别靠近我会变得不幸"
  }),
  name: z.string().openapi({
    example: "川上富江813"
  }).optional(),
  name_show: z.string().openapi({
    example: "川上富江🌸🌟"
  }),
  new_god_data: z.object({
    status: z.number().openapi({
      example: 1
    }),
    field_id: z.number().openapi({
      example: 5
    }),
    field_name: z.string().openapi({
      example: "校园"
    }),
    type: z.number().openapi({
      example: 1
    }),
    type_name: z.string().openapi({
      example: "通用"
    })
  }).optional(),
  portrait: z.string().openapi({
    example: "tb.1.636d3cf0.lcPD_3giaXxxieMU_QhJnA?t=1738872521"
  }),
  portraith: z.string().openapi({
    example: "tb.1.636d3cf0.lcPD_3giaXxxieMU_QhJnA?t=1738872521"
  }),
  priv_sets: privSets,
  work_creator_info: z.object({
    auth_desc: z.string().openapi({
      example: ""
    })
  }),
}).openapi("followItemSchema");


export const userFollowSchema = z.object({
  logid: z.string().openapi({
    example: "0614424651"
  }),
  time: z.number().openapi({
    example: 1738912214
  }),
  error_code: z.number().openapi({
    example: 0
  }),
  error_msg: z.string().openapi({
    example: ""
  }),
  pn: z.number().openapi({
    example: 1
  }),
  has_more: z.number().openapi({
    example: 1
  }),
  tips_text: z.string().openapi({
    example: "仅展示登录用户和正常账号"
  }),
  follow_list_switch: z.number().openapi({
    example: 1
  }),
  follow_list: z.array(followItemSchema),
  total_follow_num: z.number().openapi({
    example: 154
  }),
  ctime: z.string().openapi({
    example: "0"
  }),
  server_time: z.number().openapi({
    example: 236
  })
}).openapi("userFollowSchema");

const fanItemSchema = z.object({
  id: z.string().openapi({
    example: "1343485122"
  }),
  name: z.string().openapi({
    example: "贴吧用户"
  }),
  portrait: z.string().openapi({
    example: "tb.1.3cf3d31d.-eKKl0ICVOKQOhpZkwKczA?t=1640185443"
  }),
  follow_time: z.string().openapi({
    example: "1737820035"
  }),
  follow_from: z.string().openapi({
    example: "来自贴吧关注"
  }),
  name_show: z.string().openapi({
    example: "蓝色海屿云烟"
  }),
  live_status: z.string().openapi({
    example: "0"
  }),
  live_id: z.string().openapi({
    example: "0"
  }),
  display_auth_type: z.string().openapi({
    example: ""
  }),
  work_creator_info: z.string().openapi({
    example: ""
  }),
  bazhu_grade: z.object({
    desc: z.string().openapi({
      example: "南京生存狂吧吧主"
    }),
    forum_id: z.string().openapi({
      example: "27496352"
    }),
    level: z.string().openapi({
      example: "D"
    })
  }).or(z.string().openapi({
    example: ""
  })).or(z.object({}).array().openapi({
      example: []
    })),
  priv_sets: privSets,
  intro: z.string().openapi({
    example: ""
  }),
  is_followed: z.string().openapi({
    example: "0"
  }),
  is_friend: z.string().openapi({
    example: "0"
  }),
  has_concerned: z.string().openapi({
    example: "0"
  }),
  is_fans: z.string().openapi({
    example: "1"
  }),
  is_new: z.string().openapi({
    example: "0"
  })
}).openapi("fanItemSchema");


export const userFanSchema = z.object({
  page: z.object({
    page_size: z.string().openapi({
      example: "100"
    }),
    offset: z.string().openapi({
      example: "0"
    }),
    current_page: z.string().openapi({
      example: "1"
    }),
    total_count: z.string().openapi({
      example: "228"
    }),
    total_page: z.string().openapi({
      example: "3"
    }),
    has_more: z.string().openapi({
      example: "1"
    }),
    has_prev: z.string().openapi({
      example: "0"
    })
  }),
  user_list: z.array(fanItemSchema),
  tips_text: z.string().openapi({
    example: "仅展示登录粉丝和正常账号"
  }),
  follow_list_switch: z.string().openapi({
    example: "1"
  }),
  server_time: z.string().openapi({
    example: "718732"
  }),
  time: z.number().openapi({
    example: 1739005764
  }),
  ctime: z.number().openapi({
    example: 0
  }),
  logid: z.number().openapi({
    example: 564021784
  }),
  error_code: z.string().openapi({
    example: "0"
  })
}).openapi("userFanSchema");
