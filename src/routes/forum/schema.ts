import {z} from '@hono/zod-openapi'
import {privSets} from "../commonSchema.js";

export const fnameSchema = z.object({
  fname: z
    .string()
    .openapi({
      param: {
        name: 'fname',
        in: 'query'
      },
      example: 'v',
    }),
  page: z
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

export const threadFetchSchema = z.object({
  fname: z
    .string()
    .openapi({
      param: {
        name: 'fname',
        in: 'query'
      },
      example: 'v',
    }),
  page: z
    .string()
    .openapi({
      param: {
        name: 'page',
        in: 'query'
      },
      default: '1',
      example: '1',
      description: '页码。'
    }),
  sort: z.enum(['0', '1', '2', '3', '4', '5']).openapi({
    param: {
      name: 'sort',
      in: 'query'
    },
    default: '0',
    example: '0',
    description: '如何排序：\n- 对于有热门分区的贴吧 0热门排序(HOT) 1按发布时间(CREATE) 2关注的人(FOLLOW) 3/4热门排序(HOT) >=5是按回复时间(REPLY)\n' +
      '- 对于无热门分区的贴吧 0按回复时间(REPLY) 1按发布时间(CREATE) 2关注的人(FOLLOW) >=3按回复时间(REPLY)\n'
  }),
  onlyGood: z.enum(['true', 'false']).optional().openapi({
    param: {
      name: 'onlyGood',
      in: 'query'
    },
    default: 'false',
    description: '是否只查看精品贴。'
  }),
  rn: z.string().optional().openapi({
    param: {
      name: 'rn',
      in: 'query'
    },
    default: '15',
    description: '每页主题帖数量。第一页只能为15。'
  }),
})

export const forumMemberResSchema = z.object({
  data: z.object({
    portrait: z.string().openapi({
      example: "tb.1.8e2ca0a8.IY4mSUvx-oWkNfTzOm4Jyg"
    }),
    username: z.string().openapi({
      example: "觉醒的土星柯基"
    }),
    nickname: z.string().openapi({
      example: "贴吧用户_a4bCDSU"
    })
  }).array(),
  pageData: z.object({
    all: z.number().openapi({
      example: 19817
    }),
    now: z.number().openapi({
      example: 1
    }),
    membersNum: z.number().openapi({
      example: 475607
    }),
    forumId: z.number().openapi({
      example: 97650
    }),
    forumName: z.string().openapi({
      example: "v"
    })
  })
}).openapi("forumMemberResSchema");

const forumPageSchema = z.object({
  pageSize: z.number().openapi({
    example: 73
  }),
  currentPage: z.number().openapi({
    example: 1
  }),
  totalCount: z.number().openapi({
    example: 10000
  }),
  totalPage: z.number().openapi({
    example: 137
  }),
  hasMore: z.number().openapi({
    example: 1
  }),
  hasPrev: z.number().openapi({
    example: 0
  })
})

export const forumThreadResSchema = z.object({
  forum: z.object({
    id: z.string().openapi({
      example: "97650"
    }),
    name: z.string().openapi({
      example: "v"
    }),
    firstClass: z.string().openapi({
      example: "动漫"
    }),
    secondClass: z.string().openapi({
      example: "次元文化"
    }),
    memberNum: z.number().openapi({
      example: 475606
    }),
    threadNum: z.number().openapi({
      example: 10000
    }),
    postNum: z.number().openapi({
      example: 28135730
    }),
    managers: z.object({}).array(),
  }),
  page: forumPageSchema,
  threadList: z.object({
    id: z.string().openapi({
      example: "8017642259"
    }),
    title: z.string().openapi({
      example: "【公告】关于中之人管理"
    }),
    replyNum: z.number().openapi({
      example: 715
    }),
    viewNum: z.number().openapi({
      example: 347039
    }),
    lastTimeInt: z.number().openapi({
      example: 1738726053
    }),
    isTop: z.number().openapi({
      example: 1
    }),
    isGood: z.number().openapi({
      example: 1
    }),
    fid: z.string().openapi({
      example: "97650"
    }),
    firstPostId: z.string().openapi({
      example: "145465689045"
    }),
    createTime: z.number().openapi({
      example: 1662978599
    }),
    authorId: z.string().openapi({
      example: "1447150457"
    }),
    agree: z.object({
      agreeNum: z.string().openapi({
        example: "2211"
      }),
      hasAgree: z.number().openapi({
        example: 0
      }),
      agreeType: z.number().openapi({
        example: 0
      }),
      disagreeNum: z.string().openapi({
        example: "22"
      }),
      diffAgreeNum: z.string().openapi({
        example: "2189"
      })
    }),
    shareNum: z.number().openapi({
      example: 11
    }),
    firstPostContent: z.string().openapi({
      example: "近期，由于eoe团、四禧丸子、夜王莉莉丝热度的增加，对于“真人偶像”转生相关的讨论增多。结合吧友投票意见，在此推出新的理办法"
    })
  }).array(),
  userList: z.object({
    id: z.string().openapi({
      example: "5987746517"
    }),
    name: z.string().openapi({
      example: "蝴蝶的口袋"
    }),
    nameShow: z.string().openapi({
      example: "亚达😢😚😘"
    }),
    portrait: z.string().openapi({
      example: "tb.1.46893c8c.-B7zvkrnyMHcKcDvQTRuKg?t=1654670770"
    }),
    iconinfo: z.object({
      name: z.string().openapi({
        example: "juxie_icon"
      })
    }).array(),
    levelId: z.number().openapi({
      example: 15
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
    sex: z.number().openapi({
      example: 1
    }),
    gender: z.number().openapi({
      example: 1
    }),
    privSets: privSets,
    newTshowIcon: z.object({
      name: z.string().openapi({
        example: "new_t_show"
      })
    }).array(),
    newGodData: z.object({
      status: z.number().openapi({
        example: 3
      }),
      fieldId: z.number().openapi({
        example: 2
      }),
      fieldName: z.string().openapi({
        example: "动漫"
      })
    }),
    isDefaultAvatar: z.number().openapi({
      example: 0
    }),
    userGrowth: z.object({
      levelId: z.number().openapi({
        example: 10
      })
    })
  }).array(),
  navTabInfo: z.object({
    tab: z.object({
      tabId: z.number().openapi({
        example: 247085
      }),
      tabName: z.string().openapi({
        example: "切片二创区"
      })
    })
  }),
  forumRule: z.object({
    hasForumRule: z.number().openapi({
      example: 1
    })
  })
}).openapi("forumThreadResSchema");

export const forumThreadPidResSchema = z.object({
  page: forumPageSchema,
  pidList: z.string().array().openapi({
    example: ["9482714892", "9482671929"]
  })
}).openapi("forumThreadPidResSchema");
