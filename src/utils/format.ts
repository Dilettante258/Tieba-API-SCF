import { NotFoundError, type TiebaClient } from "@tieba/sdk";
import { Effect } from "effect";

export enum MethodEnum {
	uid = "uid",
	id = "id",
	un = "un",
}

/**
 * Convert between different user identifier types.
 */
export async function getParams(
	client: TiebaClient,
	method: string,
	id: string,
	need: MethodEnum,
): Promise<number | string> {
	const un2id = async (un: string) => {
		const res = await Effect.runPromise(client.getUserInfo(un));
		return Number(res.id);
	};
	const id2uid = async (id: number | string) => {
		const res = await Effect.runPromise(client.getProfile(Number(id)));
		return Number(res?.user?.tiebaUid);
	};

	let result = 0;
	switch (need) {
		case MethodEnum.uid:
			if (method === MethodEnum.uid) {
				result = Number(id);
			} else if (method === MethodEnum.un) {
				const id_ = await un2id(id);
				result = await id2uid(id_);
			} else if (id) {
				result = await id2uid(id);
			}
			if (result === 0) throw new NotFoundError("未找到用户");
			return result;
		case MethodEnum.id:
			if (method === MethodEnum.id) {
				return Number(id);
			} else if (method === MethodEnum.un) {
				result = await un2id(id);
			} else if (method === MethodEnum.uid) {
				const userdata = await Effect.runPromise(
					client.getUserByUid(Number(id)),
				);
				if (!userdata) throw new NotFoundError("未找到用户");
				result = Number(userdata?.id);
			}
			if (result === 0) throw new NotFoundError("未找到用户");
			return result;
		case MethodEnum.un:
			if (method === MethodEnum.un) {
				return id;
			} else if (method === MethodEnum.uid) {
				const userdata = await Effect.runPromise(
					client.getUserByUid(Number(id)),
				);
				return userdata?.name ?? "";
			} else if (method === MethodEnum.id) {
				const profile = await Effect.runPromise(client.getProfile(Number(id)));
				return profile?.user?.name ?? "";
			}
			throw new NotFoundError("用户不存在");
	}
}
