import type { PbContent, User } from "tieba.js";

const TEXT_CONTENT_TYPES = new Set([0, 1, 4, 9, 18, 27, 40]);

export function toJsonRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object") return {};
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function normalizeId(value: unknown): string | null {
	const id = String(value ?? "").trim();
	return id && id !== "0" ? id : null;
}

export function unixSecondsToDate(value: unknown): Date | null {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;
	return new Date(seconds * 1000);
}

export function readAuthorName(author: User | null | undefined): string {
	return author?.nameShow || author?.name || "";
}

export function contentToText(content: PbContent[] | undefined): string {
	if (!content?.length) return "";

	return content
		.map((item) => {
			if (TEXT_CONTENT_TYPES.has(Number(item.type))) return item.text ?? "";
			if (item.type === 2 || item.type === 11)
				return item.c ? `#(${item.c})` : "";
			if (item.type === 3 || item.type === 20) return "[image]";
			if (item.type === 5) return "[video]";
			if (item.type === 10) return "[voice]";
			return (
				item.link ??
				item.src ??
				item.cdnSrc ??
				item.bigCdnSrc ??
				item.originSrc ??
				""
			);
		})
		.join("")
		.trim();
}

export function normalizeUser(user: User | null | undefined) {
	const id = normalizeId(user?.id);
	if (!id) return null;

	return {
		id,
		name: user?.name || null,
		nameShow: readAuthorName(user) || null,
		portrait: user?.portrait || null,
		tiebaUid: user?.tiebaUid || null,
		ipAddress: user?.ipAddress || null,
		levelId: user?.levelId || null,
		raw: toJsonRecord(user),
	};
}
