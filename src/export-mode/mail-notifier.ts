import { ExportRepository } from "./repository.ts";

export type ExportMailEventType =
	| "started"
	| "progress"
	| "completed"
	| "failed";

interface ExportMailTargetSummary {
	forumName: string;
	status: string;
	pagesScanned: number;
	threadsFound: number;
	threadsStored: number;
}

interface ExportMailEventPayload {
	jobId: string;
	jobKey: string;
	jobName: string;
	eventType: ExportMailEventType;
	status: string;
	recipients: string[];
	summary: {
		forumsTotal: number;
		forumsDone: number;
		threadsFound: number;
		threadsStored: number;
		postsStored: number;
		subPostsStored: number;
	};
	estimate: {
		remainingForums: number;
		remainingForumPageTasks: number;
		remainingThreadTasks: number;
		remainingTasks: number;
		elapsedSeconds: number;
		estimatedRemainingSeconds: number | null;
		estimatedCompletionAt: string | null;
		basedOn: "history" | "progress" | "blended" | "insufficient_data";
		historySampleSize: number;
	};
	targets?: ExportMailTargetSummary[];
	errorMessage?: string;
	occurredAt: string;
}

export class ExportMailNotifier {
	constructor(
		private readonly repo: ExportRepository,
		private readonly instanceId: string,
		private readonly serviceUrl = process.env.MAIL_SERVICE_URL?.trim(),
		private readonly serviceToken = process.env.MAIL_SERVICE_TOKEN?.trim(),
	) {}

	private get enabled(): boolean {
		return !!this.serviceUrl && !!this.serviceToken;
	}

	async notifyStarted(jobId: string): Promise<void> {
		await this.send("started", jobId);
	}

	async notifyProgress(jobId: string): Promise<void> {
		await this.send("progress", jobId);
	}

	async notifyCompleted(jobId: string): Promise<void> {
		await this.send("completed", jobId, true);
	}

	async notifyFailed(jobId: string): Promise<void> {
		await this.send("failed", jobId, true);
	}

	private async send(
		eventType: ExportMailEventType,
		jobId: string,
		includeTargets = false,
	): Promise<void> {
		if (!this.enabled) return;

		try {
			const snapshot = await this.repo.getJobNotificationSnapshot(
				jobId,
				includeTargets,
			);
			if (!snapshot) return;

			const { notification } = snapshot;
			if (!notification.enabled || notification.recipients.length === 0) return;

			const now = new Date();
			const claimed = await this.repo.claimNotificationSend(
				jobId,
				eventType,
				this.instanceId,
				notification.progressIntervalMinutes,
			);
			if (!claimed) {
				return;
			}

			const payload: ExportMailEventPayload = {
				jobId: snapshot.jobId,
				jobKey: snapshot.jobKey,
				jobName: snapshot.jobName,
				eventType,
				status:
					eventType === "completed"
						? "completed"
						: eventType === "failed"
							? "failed"
							: snapshot.status,
				recipients: notification.recipients,
				summary: snapshot.summary,
				estimate: {
					...snapshot.estimate,
					estimatedCompletionAt:
						snapshot.estimate.estimatedCompletionAt?.toISOString() ?? null,
				},
				...(snapshot.errorMessage
					? { errorMessage: snapshot.errorMessage }
					: {}),
				...(includeTargets && snapshot.targets.length > 0
					? { targets: snapshot.targets }
					: {}),
				occurredAt: now.toISOString(),
			};

			const response = await fetch(
				`${this.serviceUrl}/internal/export-events`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${this.serviceToken}`,
					},
					body: JSON.stringify(payload),
				},
			);
			if (!response.ok) {
				throw new Error(
					`Mail service responded with ${response.status} ${response.statusText}`,
				);
			}

			await this.repo.markNotificationSent(
				jobId,
				eventType,
				this.instanceId,
				now,
			);
		} catch (error) {
			await this.repo.releaseNotificationClaim(
				jobId,
				eventType,
				this.instanceId,
			);
			console.error(
				`Failed to send export ${eventType} mail for job ${jobId}:`,
				error instanceof Error ? error.message : error,
			);
		}
	}
}
