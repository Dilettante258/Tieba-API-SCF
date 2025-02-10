import {z} from '@hono/zod-openapi'

export const tidSchema = z.object({
  tid: z
    .string()
    .openapi({
      param: {
        name: 'tid',
        in: 'query'
      },
      example: '9480119802',
    }),
  page: z
    .string()
    .openapi({
      param: {
        name: 'page',
        in: 'query'
      },
      example: '1',
    })
})

const mediaSchema = z.object({
  type: z.number().openapi({
    example: 3
  }),
  smallPic: z.string().openapi({
    example: "http://tiebapic.baidu.com/forum/w%3D720%3Bq%3D80/sign=3f824fced72397ddd6799a0669b9c38a/962bd40735fae6cd2133dd4849b30f2442a70f17.jpg?tbpicau=2025-02-11-05_2a8c0692dc83b695a74aee03e7aa56a3"
  }),
  bigPic: z.string().openapi({
    example: "http://tiebapic.baidu.com/forum/pic/item/0ea5a954b319ebc4edff00b0c426cffc1f1716ad.jpg?tbpicau=2025-02-11-05_3effe1a20fa3edfc58dd14fa51dc6b5c"
  }),
  waterPic: z.string().openapi({
    example: "http://tiebapic.baidu.com/forum/w%3D580%3B/sign=8b72e49f8f177f3e1034fc0540f43ac7/962bd40735fae6cd2133dd4849b30f2442a70f17.jpg?tbpicau=2025-02-11-05_db9826a40b2d9946db515947d6bb8e71"
  }),
  width: z.number().openapi({
    example: 560
  }),
  height: z.number().openapi({
    example: 1141
  })
}).openapi("mediaSchema");

const contentItemSchema = z.object({
  type: z.number().openapi({
    example: 0
  }),
  text: z.string().openapi({
    example: "真是有趣，吧友可以去看看"
  }),
  link: z.string().openapi({
    example: ""
  }),
  src: z.string().openapi({
    example: ""
  }),
  bsize: z.string().openapi({
    example: ""
  }),
  c: z.string().openapi({
    example: ""
  }),
  duringTime: z.number().openapi({
    example: 0
  }),
  uid: z.string().openapi({
    example: "0"
  }),
  width: z.number().openapi({
    example: 0
  }),
  height: z.number().openapi({
    example: 0
  }),
  originSrc: z.string().openapi({
    example: ""
  }),
  originSize: z.number().openapi({
    example: 0
  })
}).openapi("contentItemSchema");

const subPostItemSchema = z.object({
  id: z.string().openapi({
    example: "151654566137"
  }),
  time: z.number().openapi({
    example: 1739075867
  }),
  authorId: z.string().openapi({
    example: "6613564395"
  }),
  otherName: z.string().optional().openapi({
    example: "庄周惠施"
  }),
  otherId: z.string().optional().openapi({
    example: "6692955857"
  }),
  content: z.string().openapi({
    example: "不够包容导致的，包门！😤😤😤"
  })
}).openapi("subPostItemSchema");

const postItemSchema = z.object({
  id: z.string().openapi({
    example: "151654553008"
  }),
  floor: z.number().openapi({
    example: 3
  }),
  time: z.number().openapi({
    example: 1739075655
  }),
  content: z.string().openapi({
    example: "不过还有不少娇妻状态，缺一个被脚刹的时机，以及光评论就有不少打滚的集美 #[图片]  #[图片] "
  }),
  subPostNumber: z.number().openapi({
    example: 2
  }),
  subPostList: z.array(subPostItemSchema),
  authorId: z.string().openapi({
    example: "6692955857"
  }),
  agree: z.object({
    agreeNum: z.string().openapi({
      example: "163"
    }),
    disagreeNum: z.string().openapi({
      example: "1"
    })
  })
}).openapi("postItemSchema");

const userItemUnderPostSchema = z.object({
  id: z.string().openapi({
    example: "6692955857"
  }),
  name: z.string().openapi({
    example: "庄周惠施"
  }),
  nameShow: z.string().openapi({
    example: "庄周惠施"
  }),
  portrait: z.string().openapi({
    example: "tb.1.c963942d.7uok15xVOxs4woiZJWVhuA?t=1739108656"
  }),
  levelId: z.number().openapi({
    example: 12
  }),
  isBawu: z.number().openapi({
    example: 0
  }),
  bawuType: z.string().openapi({
    example: ""
  }),
  fansNum: z.number().openapi({
    example: 0
  }),
  gender: z.number().openapi({
    example: 2
  }),
  newGodData: z.object({
    fieldId: z.number().openapi({
      example: 0
    })
  }),
  ipAddress: z.string().openapi({
    example: "广东"
  }),
  userGrowth: z.object({
    levelId: z.number().openapi({
      example: 8
    })
  })
}).openapi("userItemUnderPostSchema");

export const postDataSchema = z.object({
  forum: z.object({
    id: z.string().openapi({
      example: "27497591"
    }),
    name: z.string().openapi({
      example: "原神内鬼"
    }),
    firstClass: z.string().openapi({
      example: "游戏"
    }),
    secondClass: z.string().openapi({
      example: "手机游戏"
    }),
    memberNum: z.number().openapi({
      example: 811959
    }),
    postNum: z.number().openapi({
      example: 50557480
    })
  }),
  page: z.object({
    pageSize: z.number().openapi({
      example: 30
    }),
    currentPage: z.number().openapi({
      example: 1
    }),
    totalPage: z.number().openapi({
      example: 11
    }),
    hasMore: z.number().openapi({
      example: 1
    }),
    hasPrev: z.number().openapi({
      example: 0
    })
  }),
  postList: z.array(postItemSchema),
  thread: z.object({
    id: z.string().openapi({
      example: "9480119802"
    }),
    title: z.string().openapi({
      example: "鸣的社区已经到了爆炸前夜了"
    }),
    replyNum: z.number().openapi({
      example: 415
    }),
    author: userItemUnderPostSchema,
    threadType: z.number().openapi({
      example: 0
    }),
    createTime: z.number().openapi({
      example: 1739075554
    }),
    postId: z.string().openapi({
      example: "151654546735"
    }),
    agree: z.object({
      agreeNum: z.string().openapi({
        example: "3535"
      }),
      hasAgree: z.number().openapi({
        example: 0
      }),
      agreeType: z.number().openapi({
        example: 0
      }),
      disagreeNum: z.string().openapi({
        example: "14"
      }),
      diffAgreeNum: z.string().openapi({
        example: "3521"
      })
    }),
    shareNum: z.number().openapi({
      example: 5
    }),
    originThreadInfo: z.object({
      title: z.string().openapi({
        example: "鸣的社区已经到了爆炸前夜了"
      }),
      media: z.array(mediaSchema),
      fname: z.string().openapi({
        example: "原神内鬼"
      }),
      tid: z.string().openapi({
        example: "9480119802"
      }),
      fid: z.string().openapi({
        example: "27497591"
      }),
      content: z.array(contentItemSchema),
      pollInfo: z.object({
        isMulti: z.number().openapi({
          example: 0
        }),
        totalNum: z.string().openapi({
          example: "0"
        }),
        totalPoll: z.string().openapi({
          example: "0"
        }),
        title: z.string().openapi({
          example: ""
        })
      })
    }),
    isShareThread: z.number().openapi({
      example: 0
    })
  }),
  userList: z.array(userItemUnderPostSchema),
  threadFreqNum: z.string().openapi({
    example: "25008"
  })
}).openapi("postDataSchema");

