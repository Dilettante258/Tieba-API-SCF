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
        threadId: Number(post.threadId),
        postId: Number(content.postId),
        cid: Number(content.postId),
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

export const unpackSimplePost = async (posts) => {
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