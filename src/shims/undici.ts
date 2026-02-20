type RequestOptions = {
	method?: string;
	headers?: HeadersInit;
	body?: BodyInit | null;
	dispatcher?: unknown;
};

type ResponseBody = {
	json: () => Promise<unknown>;
	arrayBuffer: () => Promise<ArrayBuffer>;
	text: () => Promise<string>;
	dump: () => Promise<void>;
};

type RequestResult = {
	statusCode: number;
	statusText: string;
	body: ResponseBody;
};

export type Dispatcher = unknown;

/**
 * Worker 侧兼容类：保留构造签名，运行时不做连接池逻辑。
 */
export class Agent {
	constructor(_options?: unknown) {}
}

export const FormData = globalThis.FormData;

/**
 * 兼容 undici.request 的最小返回结构，基于 fetch 实现。
 */
export async function request(
	url: string | URL,
	options: RequestOptions = {},
): Promise<RequestResult> {
	const response = await fetch(url, {
		method: options.method,
		headers: options.headers,
		body: options.body ?? undefined,
	});

	const body: ResponseBody = {
		json: () => response.clone().json(),
		arrayBuffer: () => response.clone().arrayBuffer(),
		text: () => response.clone().text(),
		dump: async () => {
			await response.arrayBuffer();
		},
	};

	return {
		statusCode: response.status,
		statusText: response.statusText,
		body,
	};
}
