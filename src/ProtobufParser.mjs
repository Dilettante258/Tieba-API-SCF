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
      r: params['sort'] || 'ASC',
      lz: params['only_thread_author'] || false,
      common: {
        _clientType: 2,
        _clientVersion: "12.59.1.0",
      }
    }
  };
  if (params.hasOwnProperty('with_comments')) {
    payload.data.common.BDUSS = process.env.BDUSS;
    payload.data.withFloor = true;
    payload.data.floorSortType = params.hasOwnProperty('CommentsSortByTime') ? false : true;
    payload.data.floorRn = params['comment_rn'] || '4';
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
      rn_need: params['rn'] > 0 ? params['rn'] : 1,
      is_good: params.hasOwnProperty('OnlyGood'),
      sort_type: params['sort'] || 'REPLY',
      common: {
        _clientType: 2,
        _clientVersion: "12.59.1.0",
      }
    }
  };
  const message = Proto.create(payload);
  const buffer = Proto.encode(message).finish()
  return Buffer.from(buffer);
}

export async function threadResDeserialize(buffer) {
  const Proto = root.lookupType("FrsPageResIdl");
  let decoded = Proto.decode(Buffer.from(buffer));
  return decoded.data;
}