import protobuf from 'protobufjs';
import jsonDescriptor from './protobuf.json' assert { type: 'json' };
import { Buffer } from 'buffer';

const root = protobuf.Root.fromJSON(jsonDescriptor);

export async function postReqSerialize(userId, pn) {
  const Proto = root.lookupType("UserPostReqIdl");
  const payload = {
    data: {
      needContent: 1,
      userId: userId,
      pn: pn,
      common: {
        clientversion: "8.9.8.5",
      }
    }
  };
  const message = Proto.create(payload);
  const buffer = Proto.encode(message).finish();
  return Buffer.from(buffer);
}

export async function postResDeserialize(buffer) {
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
        clientversion: "12.57.0.1",
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