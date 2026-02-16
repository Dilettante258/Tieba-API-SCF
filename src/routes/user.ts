import { zValidator } from "@hono/zod-validator";
import { Effect } from "effect";
import { Hono } from "hono";
import { z } from "zod";
import { getClient } from "../lib/sdk.ts";
import { getParams, MethodEnum } from "../utils/format.ts";

const methodSpec = z.object({
	method: z.enum(["uid", "id", "un"]),
	id: z.string(),
});

const methodWithPage = methodSpec.extend({
	page: z.string().optional().default("1"),
});

const methodWithRange = methodSpec.extend({
	fromP: z.string(),
	toP: z.string(),
});

export const userRoute = new Hono()
	.get("/info/:username", async (c) => {
		const username = c.req.param("username");
		const client = getClient();
		const res = await Effect.runPromise(client.getUserInfo(username));
		return c.json(res);
	})
	.get("/posts", zValidator("query", methodWithPage), async (c) => {
		const { method, id, page } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const res = await Effect.runPromise(
			client.getUserPost(userId, Number(page)),
		);
		return c.json(res);
	})
	.get("/postsBatch", zValidator("query", methodWithRange), async (c) => {
		const { method, id, fromP, toP } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const res = await Effect.runPromise(
			client.getUserPost(userId, [Number(fromP), Number(toP)]),
		);
		return c.json(res);
	})
	.get("/profile", zValidator("query", methodSpec), async (c) => {
		const { method, id } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const res = await Effect.runPromise(client.getProfile(userId));
		return c.json(res);
	})
	.get("/panel", zValidator("query", methodSpec), async (c) => {
		const { method, id } = c.req.valid("query");
		const client = getClient();
		const un = (await getParams(client, method, id, MethodEnum.un)) as string;
		const res = await Effect.runPromise(client.getPanel(un));
		return c.json(res);
	})
	.get("/likeForum", zValidator("query", methodSpec), async (c) => {
		const { method, id } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const res = await Effect.runPromise(client.getLikeForum(userId, "needAll"));
		return c.json(res);
	})
	.get("/condenseProfile", zValidator("query", methodSpec), async (c) => {
		const { method, id } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const profile = await Effect.runPromise(client.getProfile(userId));
		const name = profile?.user?.name ?? "";
		const panel = await Effect.runPromise(client.getPanel(name));
		return c.json({
			name,
			nickname: profile?.user?.nameShow,
			id: profile?.user?.id,
			uid: profile?.user?.tiebaUid,
			portrait: profile?.user?.portrait,
			fan: profile?.user?.fansNum,
			follow: profile?.user?.concernNum,
			sex: profile?.user?.sex,
			godData: profile?.user?.newGodData?.fieldName,
			ipAddress: profile?.user?.ipAddress,
			userGrowth: profile?.user?.userGrowth?.levelId,
			totalAgreeNum: profile?.userAgreeInfo?.totalAgreeNum,
			tbAge: profile?.user?.tbAge,
			postNum: String(profile?.user?.postNum),
			tbVip: panel.tb_vip,
			vip: panel.vipInfo
				? {
						level: panel.vipInfo.v_level ?? "0",
						status: panel.vipInfo.v_status ?? "0",
						expireTime: Number(panel.vipInfo.e_time ?? 0),
					}
				: undefined,
			manager: panel.honor?.manager,
		});
	})
	.get("/follow", zValidator("query", methodWithPage), async (c) => {
		const { method, id, page } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const res = await Effect.runPromise(
			client.getFollow(userId, page === "needAll" ? "needAll" : Number(page)),
		);
		return c.json(res);
	})
	.get("/fan", zValidator("query", methodWithPage), async (c) => {
		const { method, id, page } = c.req.valid("query");
		const client = getClient();
		const userId = (await getParams(
			client,
			method,
			id,
			MethodEnum.id,
		)) as number;
		const res = await Effect.runPromise(
			client.getFans(userId, page === "needAll" ? "needAll" : Number(page)),
		);
		return c.json(res);
	});
