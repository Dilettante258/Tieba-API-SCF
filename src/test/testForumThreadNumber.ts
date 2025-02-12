import 'dotenv/config';
import {drizzle} from 'drizzle-orm/node-postgres';
import {forumKeyTable, postTable, subPostTable} from "../db/schema/tieba.js";
import {collatePost, getForumID, getPost, getThreadPid} from "tieba.js";
import log4js from "log4js";
import xlsx from 'node-xlsx';
import * as fs from "node:fs";

log4js.configure({
  appenders: {
    console: { type: "console" },
    app: { type: "file", filename: "application.log" },
  },
  categories: {
    default: { appenders: ["console"], level: "trace" },
    app: { appenders: ["app"], level: "trace" },
    "app.console": { appenders: ["console"], level: "info" },
  },
})

const logger = log4js.getLogger("app.console");
logger.info("程序启动。")

const db = drizzle(process.env.DATABASE_URL!);


const header = ["吧名", "排序标识","页码", "主题帖数", "提示总页码"]
const xlsxData: Array<any> = [header]
async function getAllPid(fname: string) {
  logger.trace(`开始获取${fname}吧的主题帖列表`)
  for (const sortKey of [0,1,2,3,4,5]) {
    const commonParams = {
      fname: fname,
      rn: 100,
      sort: sortKey,
      OnlyGood: false
    }
    const N1Res = await getThreadPid({
      ...commonParams,
      page: 1,
    })
    xlsxData.push([fname,sortKey, 1, N1Res.pidList.length, N1Res.page.totalPage])
    const N2Res = await getThreadPid({
      ...commonParams,
      page: 2
    })
    xlsxData.push([fname, 2, N2Res.pidList.length, N2Res.page.totalPage])
    const totalPage = N2Res.page.totalPage;
    const promises: Array<Promise<Array<string>>> = []
    for (let i = 3; i <= totalPage; i++) {
      promises.push(getThreadPid({
        ...commonParams,
        page: i
      }).then((data)=> {
        xlsxData.push([fname,sortKey, i, data.pidList.length, data.page.totalPage])
        return data.pidList;
      }))
    }
    const arrayOfArrays = await Promise.all(promises)
    const pidList = [...new Set(arrayOfArrays.flat().concat(N2Res.pidList).concat(N1Res.pidList))]
    logger.info(`sort: ${sortKey}共获取了${fname}吧的${pidList.length}个主题帖的pid号`)
  }
  // logger.info(`共获取了${fname}吧的${pidList.length}个主题帖的pid号`)
  return undefined;
}


// 有问题的："存钱", "闲人赚钱", "迷茫", "忏悔",
async function main() {
  // const forumList = ["救急", "扒皮", "救急", "房贷", "戒网贷", "破产", "随便赚", "戒神", "无人机", "厦门", "学生找工作", "大连", "工作", "中国民航飞行学院", "中国低空飞行俱乐部", "战机世界", "大邑", "飞行俱乐部", "应城", "seo研究中心", "兼职", "征信", "大疆无人机", "个人征信", "nft", "分期乐", "阳谷", "义乌", "毕业论文", "辅助", "国考", "公务员", "打工仔", "绝密资料", "网贷", "打工", "斗米兼职", "北京", "上海", "杭州", "网上打工", "重庆工作", "深圳工作", "杭州工作", "长沙找工作", "武汉求职", "岳阳", "常德", "手赚", "app赚钱", "武汉工作", "网络", "澳门", "放弃", "反赌联盟", "上海找工作", "全国图书批发", "期刊", "党建", "三亚", "浙江打工", "军恋", "浙江", "海南", "军嫂vs守望爱", "福建", "家里蹲", "军嫂论坛", "流浪", "军婚", "军嫂", "三亚婚纱摄影", "大学生找工作", "三亚学院", "北京工作", "房山", "北京日结", "在家赚钱", "斗米兼职", "广东兴宁", "广东梅县", "鹿城", "搞钱", "毕业生", "快递员", "征信", "记者", "上海长兴岛", "中国记者", "长兴岛", "浙江找工作", "报社", "诏安", "饶平", "航空母舰", "长兴", "困难", "灰", "挣", "搞钱", "西安工作", "宁波", "飞机", "临时工", "钟点工", "飞行员", "铁山港", "公务员", "国企", "新兵连", "军恋", "非现役文职", "红星待遇", "福建事业单位", "文员", "流浪", "招工求职", "福清", "失业", "职业", "江苏", "跑腿", "难民收留", "家里蹲", "大学生求职", "转隶", "潮阳", "流浪汉", "事业编", "广州", "拒赌", "boss直聘", "南宁", "厦门", "汕头", "龙湖", "汕头建设", "汕头卫校", "戒赌", "潮汕", "漳州", "项目", "深圳", "求职", "上海日结", "找兼_职", "打车", "上海网约车", "接单赚钱", "网上找工作", "计程车", "中船重工", "湛江", "福建日结", "宁德", "上海拼车", "退役士兵", "上海住宿", "青岛", "台州", "泉州", "浙江大学", "福建工作", "帮忙", "沈阳辅警", "珠海", "上海居转户", "浦东", "广州日结", "军", "文职", "泉州找工作", "请求帮助", "深圳辅警", "空警", "广西工作", "深圳日结", "项目", "创业小项目", "连云港", "民兵", "帮助", "难民", "兼_职", "漳州找工作", "东山", "两会", "求助", "江南造船厂", "航空母舰", "武昌造船厂", "晋江", "大埕", "舟山", "无锡", "山东", "应急", "武汉找工作", "大学生兼职", "青岛", "湖北", "霞浦", "福州", "龙田", "055", "三明", "岱山", "汕尾", "青岛远洋船员职业学院", "厦门求职", "广州求职", "黑龙江农业经济职业学院", "云南", "舟山群岛", "玉门油田", "平潭", "海南", "香港", "上犹", "长乐机场", "阿拉善左旗", "上海工作", "闽侯", "期刊征稿", "征稿", "三亚湾", "三亚人才网", "防诈骗", "晋江机场", "核动力航母战斗群", "阿旗", "内蒙古", "晋江贴", "三亚交流", "玉门镇", "陆丰", "赣州", "左旗", "中国军工", "半导体", "佛山找工作", "嗨钱网", "即墨", "咸鱼", "昌平", "赤壁市", "福建漳州", "厦门大学", "龙岩", "漳州立人学校", "正兴学校", "中国辅警", "人工智能", "退役", "钱", "绿色军营", "体制内", "厦门工作", "青岛找工作", "澄海", "借到", "上海求职", "大学生士兵", "汕头工作", "青岛大学生就业服务中心", "潮州", "捷胜", "公文", "青岛工作", "欠债还钱", "打工求职", "退役创业", "广东工作", "打工者", "工作群", "高危工作", "海阳", "老赖还钱", "欠欠不欠钱", "上海打工", "找工作群", "海军军嫂", "邮政", "泉州工作", "平潭", "福州找工作", "哈工大深圳研究生院", "台州工作", "哈尔滨工业大学", "沈阳航空航天大学", "我要找工作", "温岭", "福建找工作", "温州", "挂壁", "平阳", "苍南", "百度网盘", "象山", "浦东", "芜湖", "昆明", "宁波工作", "厦门大学研究生", "厦门找工作", "项目赚钱", "乐平", "吉阳区", "公务员面试", "公务员考试", "大学生副业", "海南工作", "惠安", "福安", "空军飞行员", "海南酒店", "漳州人力资源", "歼35", "航天", "南京航空航天大学", "南京理工大学", "徐州", "徐州找工作", "驻马店", "蕉城", "深圳找工作", "上班族", "大目湾", "佛山", "记者调查", "uu跑腿", "湛江找工作", "湛江调研", "废报纸", "重兵器", "军人魂", "现代军人启示录", "军人的爱情", "嫁给军人", "湛江考试", "湛江发展", "报纸", "连云港求职", "爱上军人", "军人妹", "宋军人", "军人爱情", "嘉兴", "宁德", "留学生", "合拍贷", "人人贷", "旅顺", "葫芦岛", "文职人员", "赚钱app", "渔民", "中国航天", "文职文职", "成都日结", "拉手网", "辽宁", "旅顺开发区", "债", "地推", "旅顺实验学校", "旅顺钓鱼", "大连阿尔滨", "芗城", "技能文职", "后悔", "大学生创业", "斗米兼职", "当兵", "兵哥哥and拥军女孩", "那些年我们一起当兵的日子", "四川兵哥哥", "铁打的营盘流水的兵", "军校生", "西藏兵", "90后创业", "生意上岸", "成都", "南京", "现役文职", "福州工作", "钓鱼发烧友", "鼓浪屿", "战斗机", "翔安", "兵工科技", "媒体关注", "军迷", "海员", "贵人", "摄影", "杂志", "沪东中华", "轻兵器", "仓山", "厦门滴滴", "厦门网约车", "泉州幼儿师范高等专科学校", "泉州华侨职校", "泉州师范学院", "广东", "中航", "海事", "新会", "军职在线", "定海", "福鼎", "厦门日结", "军迷藏", "藏书爱好者", "旧书", "出版社", "研究生", "二手书", "旧书网", "无锡找工作", "图书批发", "长乐", "打工人", "书籍", "书", "智库", "星空迷彩", "考研", "邮差", "海军飞行员", "诸城", "海沧", "诸城信息港", "书商", "长沙", "博览会", "印刷", "新闻记者", "漳浦", "无锡职业技术学院", "兵哥哥相亲", "重庆航天职业技术学院", "军残", "石狮", "借到", "婚姻", "宝山", "武夷山", "天津", "灰", "南平", "跑", "航空", "宁德找工作", "文件", "邮政快递"]
  const forumList = ["存钱"]
  for (const forum of forumList) {
    try {
      logger.info(`开始处理${forum}吧`)
      const pidList = await getAllPid(forum);
    } catch (e) {
      logger.error(`贴吧${forum}吧主题帖列表获取失败！${e.message}`)
    }finally {
      var buffer = xlsx.build([{name: 'mySheetName', data: xlsxData}]);
      fs.writeFileSync(`./${forum}.xlsx`, buffer);
    }
  }
}

await main();
