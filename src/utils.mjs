import {Md5} from "ts-md5";
import {forumReqSerialize, forumResDeserialize} from "./ProtobufParser.mjs";

export const baseUrl = 'https://tiebac.baidu.com'
export const timeFormat = Intl.DateTimeFormat('zh-CN', {
  timeStyle: "short",
  dateStyle: "short",
});

const defaultBDUSS = process.env.BDUSS;

export async function postFormData(url, data) {
  const response = await fetch(baseUrl + url, {
    method: "POST",
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: data,
  }).catch(error => {
    console.error('Fetch failed:', error);
  });
  return await response.json();
}

export async function postProtobuf(url, buffer) {
  let blob = new Blob([buffer]);
  let data = new FormData();
  data.append('data', blob);
  const response = await fetch(baseUrl + url, {
    method: "POST",
    headers: {
      'x_bd_data_type': 'protobuf',
    },
    body: data,
  }).catch(error => {
    console.error('Fetch failed:', error);
  });
  return await response.arrayBuffer();
}

export const unpack = async (posts,needForumName=false) => {
  let result = [];
  for (let post of posts) {
    const forumName_ = needForumName ? await getForumName(post.forumId) : '';
    for(let content of post.content){
      let affiliated = content.postType == "1";
      let isReply = affiliated && content?.postContent[1]?.type == "4";
      result.push({
        forumId: Number(post.forumId),
        forumName: forumName_,
        title: post.title.slice(3),
        threadId: String(post.threadId),
        postId: String(content.postId),
        cid: String(content.postId),
        createTime: timeFormat.format(new Date(content.createTime*1000)),
        affiliated: affiliated,
        content: (isReply) ?
          content.postContent[2].text.slice(2) :
          (content.postContent.length === 1 ?
              content.postContent[0].text : content.postContent.map(item => item.text).join('')
          ),
        replyTo: isReply ? content.postContent[1].text : "",
      });
    }
  }
  return result;
}

export function processContent(data, emojicounter, emoticonCounter, needPlainText=false) {
  let resultString = '';
  const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  data.forEach(item => {
    // if (item.type > startingNumber && item.type < endingNumber) { item.type =  }
    switch (item.type) {
      //[0, 9, 18, 27, 40]
      case 0:
      case 9:
      case 18:
      case 27:
      case 40:
        const matches = item.text.match(emojiRegex);
        if (matches) {
          matches.forEach(emoji => {
            if (!emojicounter[emoji]) {
              emojicounter[emoji] = 0;
            }
            emojicounter[emoji]++;
          });
        }
        resultString += item.text;
        break;
      case 1:
        resultString += needPlainText ? `${item.text}`: `${item.text}#[链接]`;
        break;
      case 2:
      case 11:
        if (!emoticonCounter[item.c]) {
          emoticonCounter[item.c] = 0;
        }
        emoticonCounter[item.c]++;
        resultString += needPlainText ? " ": `#(${item.c})`;
        break;
      case 3:
      case 20:
        resultString += needPlainText ? " ": `#[图片]`;
        break;
      case 4:
        resultString += needPlainText ? " ": `${item.text}`;
        break;
      case 5:
        resultString += needPlainText ? " ": `#[视频]`;
        break;
      case 10:
        resultString += needPlainText ? " ": `#[语音]`;
        break;
      default:
        // 其他类型可以在这里处理，或者忽略
        break;
      }
  });
  return resultString;
}

export const unpackPost = async (posts, needPlainText=false, withComment=false) => {
  let result = [];
  let emojicounter = {};
  let emoticonCounter = {};
  for (let post of posts) {
    result.push({
      ...post,
      id: String(post.id),
      authorId: String(post.authorId),
      content: processContent(post.content, emojicounter, emoticonCounter, needPlainText),
    });
    if (withComment) {
      result.at(-1).subPostList = post.subPostNumber>0 ? post.subPostList.subPostList.map(subPost => {
        return {
          id: String(subPost.id),
          authorId: String(subPost.authorId),
          time: subPost.time,
          content: processContent(subPost.content, emojicounter, emoticonCounter, needPlainText),
        }
      }) : []
    }
    if (post?.signature) {
      result.at(-1).signature = processContent(post.signature.content, emojicounter, emoticonCounter, needPlainText);
    }
  }
  //处理特殊情况
  delete emoticonCounter[""];
  delete emoticonCounter.undefined;
  if (emoticonCounter['升起']) {
    emoticonCounter['生气'] = emoticonCounter['升起'];
    delete emoticonCounter['升起'];
  }
  return [result, emojicounter, emoticonCounter];
}


export const unpackSimpleUserPost = async (posts) => {
  let result = [];
  for (let post of posts) {
    for(let content of post.content){
      const forumName = await getForumName(post.forumId)||'';
      let affiliated = content.postType == "1";
      let isReply = affiliated && content?.postContent[1]?.type == "4";
      result.push({
        forumName: forumName,
        createTime: Number(content.createTime),
        content: (isReply) ?
          content.postContent[2].text.slice(2) :
          (content.postContent.length === 1 ?
              content.postContent[0].text : content.postContent.map(item => item.text).join('')
          ),
      });
    }
  }
  return result;
}

let forumNameCache = {};

export const getForumName = async (forumId) => {
  if (forumNameCache[forumId]) {
    return forumNameCache[forumId];
  }
  const buffer = await forumReqSerialize(forumId);
  const res = await postProtobuf('/c/f/forum/getforumdetail?cmd=303021', buffer);
  if (res.byteLength < 200) {
    return "error";
  }
  const forumName = await forumResDeserialize(res);
  forumNameCache[forumId] = forumName;
  return forumName;
}


export const unpackThread = async (posts) => {
  let result = [];
  let emojicounter = {};
  let emoticonCounter = {};
  for (let post of posts) {
    result.push({
      ...post,
      id: String(post.id),
      firstPostId: String(post.firstPostId),
      authorId: String(post.authorId),
      fid: String(post.fid),
      firstPostContent: processContent(post.firstPostContent, emojicounter, emoticonCounter),
    });
    delete result.at(-1).voiceInfo;
    delete result.at(-1).isVoiceThread;
    delete result.at(-1).author;
    delete result.at(-1).threadType;
  }
  return [result, emojicounter, emoticonCounter];
}


export function packRequest(params) {
  params = new URLSearchParams(params);
  if (!params.has('BDUSS')) {
    params.append('BDUSS', defaultBDUSS);
  }
  if (!params.has('_client_version')) {
    params.append('_client_version', '12.57.4.2');
  }
  if (!params.has('pn')) {
    params.append('pn', params.get('page') || 1);
  }
  params.delete('page');
  params.sort();
  const string = Array.from(params.entries()).map(entry => entry.join('=')).join('');
  const sign = Md5.hashStr(string + 'tiebaclient!!!').toUpperCase();
  params.append('sign', sign);
  return Array.from(params.entries()).map(entry => entry.join('=')).join('&');
}

export function countUserAttributes(userList) {
  const counts = {
    ipAddress: {},
    levelId: {},
    gender: {}
  };

  for (const obj of userList) {
    const { ipAddress, levelId, gender } = obj;

    // 统计 ipAddress 出现次数
    if (ipAddress) {
      if (counts.ipAddress[ipAddress]) {
        counts.ipAddress[ipAddress]++;
      } else {
        counts.ipAddress[ipAddress] = 1;
      }
    }

    // 统计 levelId 出现次数
    if (levelId) {
      if (counts.levelId[levelId]) {
        counts.levelId[levelId]++;
      } else {
        counts.levelId[levelId] = 1;
      }
    }

    // 统计 gender 出现次数
    if (gender !== undefined) {
      if (counts.gender[gender]) {
        counts.gender[gender]++;
      } else {
        counts.gender[gender] = 1;
      }
    }
  }

  // 转换成所需的格式
  const ipAddressResult = [];

  // ipAddress按倒序排列
  const sortIpList = Object.entries(counts.ipAddress).sort((a, b) => b[1] - a[1]);

  for (const item of sortIpList) {
    ipAddressResult.push({ name: item[0], value: item[1] });
  }

  counts.ipAddress = ipAddressResult;

  return counts;
}

export async function handlePromises(promises, maxConcurrent = 100, delay = 1000) {
  const results = [];
  for (let i = 0; i < promises.length; i += maxConcurrent) {
      const chunk = promises.slice(i, i + maxConcurrent);
      results.push(...await Promise.all(chunk));
      if (i + maxConcurrent < promises.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
      }
  }
  return results;
}

export function mergeCounters(array) {
  let result = {
      emojicounter: {},
      emoticonCounter: {},
      userAttributesCount: {
          ipAddress: [],
          levelId: {},
          gender: {}
      },
      timeLine: []
  };

  array.forEach(item => {
      // Merge emojicounter
      for (let emoji in item.emojicounter) {
          if (result.emojicounter[emoji]) {
              result.emojicounter[emoji] += item.emojicounter[emoji];
          } else {
              result.emojicounter[emoji] = item.emojicounter[emoji];
          }
      }

      // Merge emoticonCounter
      for (let emoticon in item.emoticonCounter) {
          if (result.emoticonCounter[emoticon]) {
              result.emoticonCounter[emoticon] += item.emoticonCounter[emoticon];
          } else {
              result.emoticonCounter[emoticon] = item.emoticonCounter[emoticon];
          }
      }

      // Merge userAttributesCount.ipAddress
      item.userAttributesCount.ipAddress.forEach(ip => {
          let index = result.userAttributesCount.ipAddress.findIndex(i => i.name === ip.name);
          if (index !== -1) {
              result.userAttributesCount.ipAddress[index].value += ip.value;
          } else {
              result.userAttributesCount.ipAddress.push({ ...ip });
          }
      });

      // Merge userAttributesCount.levelId
      for (let level in item.userAttributesCount.levelId) {
          if (result.userAttributesCount.levelId[level]) {
              result.userAttributesCount.levelId[level] += item.userAttributesCount.levelId[level];
          } else {
              result.userAttributesCount.levelId[level] = item.userAttributesCount.levelId[level];
          }
      }

      // Merge userAttributesCount.gender
      for (let gender in item.userAttributesCount.gender) {
          if (result.userAttributesCount.gender[gender]) {
              result.userAttributesCount.gender[gender] += item.userAttributesCount.gender[gender];
          } else {
              result.userAttributesCount.gender[gender] = item.userAttributesCount.gender[gender];
          }
      }

      // Merge timeLine
      result.timeLine = result.timeLine.concat(item.timeLine).sort((a, b) => a - b);
  });

  return result;
}
