import protobuf from 'protobufjs';
import jsonDescriptor from './protobuf.json' assert { type: 'json' };
import { Buffer } from 'buffer';

const root = protobuf.Root.fromJSON(jsonDescriptor);

export async function userPostReqSerialize(userId, pn) {
  const Proto = root.lookupType("UserPostReqIdl");
  const payload = {
    data: {
      needContent: 1,
      userId: userId,
      pn: pn,
      common: {
        _clientVersion: "8.9.8.5",
      }
    }
  };
  const message = Proto.create(payload);
  const buffer = Proto.encode(message).finish();
  return Buffer.from(buffer);
}

export async function userPostResDeserialize(buffer) {
  const Proto = root.lookupType("UserPostResIdl");
  let decoded = Proto.decode(Buffer.from(buffer));
  let data = decoded.data.postList;
  return data;
}

export async function forumReqSerialize(forumId) {
  const Proto = root.lookupType("GetForumDetailReqIdl");
  const payload = {
    data: {
      forumId: forumId,
      common: {
        _clientVersion: "12.59.1.0",
      }
    }
  };
  const message = Proto.create(payload);
  const buffer = Proto.encode(message).finish();
  return Buffer.from(buffer);
}

export async function forumResDeserialize(buffer) {
  const Proto = root.lookupType("GetForumDetailResIdl");
  let decoded = Proto.decode(Buffer.from(buffer));
  let data = decoded.data.forumInfo;
  let forumName = data.forumName;
  return forumName;
}

export async function postReqSerialize(params) {
  const Proto = root.lookupType("PbPageReqIdl");
  const payload = {
    data: {
      kz: params['tid'],
      pn: params['page'] || 1,
      rn: params['rn'] || 50,
      // 1 时间倒序 2 热门排序 3及以上 时间正序
      r: params['sort'] || 3,
      lz: params['onlyThreadAuthor'] || false,
      common: {
        _clientType: 2,
        _clientVersion: "12.59.1.0",
      }
    }
  };
  if (params.hasOwnProperty('withComment')) {
    payload.data.common.BDUSS = process.env.BDUSS;
    payload.data.withFloor = true;
    payload.data.floorSortType = params.hasOwnProperty('CommentsSortByTime') ? false : true;
    payload.data.floorRn = params['commentRn'] || '4';
  }

  const message = Proto.create(payload);
  const buffer = Proto.encode(message).finish()
  return Buffer.from(buffer);
}

export async function postResDeserialize(buffer) {
  const Proto = root.lookupType("PbPageResIdl");
  let decoded = Proto.decode(Buffer.from(buffer));
  return decoded.data;
}

export async function threadReqSerialize(params) {
  const Proto = root.lookupType("FrsPageReqIdl");
  const payload = {
    data: {
      kw: params['fname'],
      pn: params['page'] || 1,
      rn: 105,
      rnNeed: params['rn'] > 0 ? params['rn'] : 30, // 最大100
      isGood: params.hasOwnProperty('OnlyGood'),
      // 对于有热门分区的贴吧 0热门排序(HOT) 1按发布时间(CREATE) 2关注的人(FOLLOW) 34热门排序(HOT) >=5是按回复时间(REPLY)
      // 对于无热门分区的贴吧 0按回复时间(REPLY) 1按发布时间(CREATE) 2关注的人(FOLLOW) >=3按回复时间(REPLY)
      sortType: params['sort'] || 1,
      common: {
        _clientType: 2,
        _clientVersion: "12.59.1.0",
      }
    }
  };
  const message = Proto.create(payload);
  const buffer = Proto.encode(message).finish()
  console.log(Proto.decode(Buffer.from(buffer)))  // debug;
  return Buffer.from(buffer);
}

export async function threadResDeserialize(buffer) {
  const Proto = root.lookupType("FrsPageResIdl");
  let decoded = Proto.decode(Buffer.from(buffer));
  return decoded.data;
}