import { promises as fs } from "node:fs";
import path from "node:path";
import { IdentityKit, KeyManager } from "@nuwa-ai/identity-kit";
import {
	createFastMcpServerFromEnv,
	type FastMcpServerOptions,
} from "@nuwa-ai/payment-kit";
import { z } from "zod";
import { resolveSunoConfig } from "./env.js";
import { SunoClient } from "./http.js";

const jsonPayload = z
	.record(z.any())
	.describe("Arbitrary JSON payload forwarded to the Suno API endpoint.");

const queryValue = z.union([z.string(), z.number(), z.boolean()]);
const queryRecord = z
	.record(queryValue.or(z.array(queryValue)))
	.describe("Query string parameters forwarded to the Suno API endpoint.");

const mockCallbackUrl = "https://mock.callback.local/placeholder";

const normalizeModelName = (value?: string): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.toUpperCase() : undefined;
};

const resolveCustomModeLimits = (
	model?: string,
): { prompt: number; style: number } => {
	const modelName = normalizeModelName(model);
	if (modelName && ["V4_5", "V4_5PLUS", "V5"].includes(modelName)) {
		return { prompt: 5000, style: 1000 };
	}

	return { prompt: 3000, style: 200 };
};

const PICO_USD_PER_CREDIT = 5_000_000_000n;
const PRICE_PICO_USD = {
	twelveCredits: PICO_USD_PER_CREDIT * 12n,
	twoCredits: PICO_USD_PER_CREDIT * 2n,
	tenCredits: PICO_USD_PER_CREDIT * 10n,
	fiftyCredits: PICO_USD_PER_CREDIT * 50n,
	halfCredit: (PICO_USD_PER_CREDIT * 5n) / 10n,
	fourTenthsCredit: (PICO_USD_PER_CREDIT * 4n) / 10n,
} as const;

const main = async (): Promise<void> => {
	const compactExtras = (extras?: Record<string, unknown>) => extras ?? {};

	const ensure = (condition: unknown, message: string) => {
		if (!condition) {
			throw new Error(message);
		}
	};

	const ensureMaxLength = (
		value: string | undefined,
		max: number,
		fieldName: string,
	) => {
		if (value !== undefined && value.length > max) {
			throw new Error(`${fieldName} must be at most ${max} characters.`);
		}
	};

	const config = resolveSunoConfig();

	const serviceKey = process.env.SERVICE_KEY || "";
	if (!serviceKey) throw new Error("SERVICE_KEY is required");

	const keyManager = await KeyManager.fromSerializedKey(serviceKey);
	const serviceDid = await keyManager.getDid();

	const env = await IdentityKit.bootstrap({
		method: "rooch",
		keyStore: keyManager.getStore(),
		vdrOptions: { network: "test" },
	});

	const parsePort = (value?: string): number | undefined => {
		if (!value) return undefined;
		const parsed = Number(value.trim());
		return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
	};

	const normalizeEndpoint = (value?: string): `/${string}` | undefined => {
		if (!value) return undefined;
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
		return normalized as `/${string}`;
	};

	const resolvedPort =
		parsePort(process.env.MCP_SERVER_PORT) ?? parsePort(process.env.PORT);
	const resolvedEndpoint =
		normalizeEndpoint(process.env.MCP_SERVER_ENDPOINT) ??
		normalizeEndpoint(process.env.MCP_ENDPOINT);

	const serverConfig: Omit<
		FastMcpServerOptions,
		"signer" | "rpcUrl" | "network"
	> = {
		serviceId: "suno-mcp-server",
		adminDid: serviceDid,
		...(resolvedPort ? { port: resolvedPort } : {}),
		...(resolvedEndpoint ? { endpoint: resolvedEndpoint } : {}),
	};

	const server = await createFastMcpServerFromEnv(env, serverConfig);

	const client = new SunoClient(config);

	server.freeTool({
		name: "fileBase64Upload",
		description:
			"Upload a temporary file using a Base64 or data URL payload. Pass the payload object with fields like base64/dataUrl, fileName, and uploadPath.",
		parameters: {
			payload: jsonPayload.describe(
				"JSON body forwarded to /api/file-base64-upload. Refer to the Suno documentation for supported fields such as base64 data, fileName, uploadPath, and mimeType.",
			),
		},
		async execute({ payload }) {
			return client.postJson("/api/file-base64-upload", payload);
		},
	});

	server.freeTool({
		name: "fileStreamUpload",
		description:
			"Upload a temporary file from disk via multipart form data. Set filePath and optional fileFieldName, fileName, and extra fields.",
		parameters: {
			filePath: z
				.string()
				.min(1, "Provide an absolute or relative file path to upload."),
			fileFieldName: z.string().min(1).optional(),
			fileName: z.string().optional(),
			fields: z
				.record(z.union([z.string(), z.number(), z.boolean()]))
				.optional()
				.describe(
					"Additional multipart fields such as uploadPath, fileName, or other metadata required by the endpoint.",
				),
		},
		async execute({ filePath, fileFieldName, fileName, fields }) {
			const buffer = await fs.readFile(filePath);
			const multipart = new FormData();
			multipart.append(
				fileFieldName && fileFieldName.length > 0 ? fileFieldName : "file",
				new Blob([buffer]),
				fileName ?? path.basename(filePath),
			);

			if (fields) {
				for (const [key, value] of Object.entries(fields)) {
					multipart.append(key, String(value));
				}
			}

			return client.postForm("/api/file-stream-upload", multipart);
		},
	});

	server.freeTool({
		name: "fileUrlUpload",
		description:
			"Upload a temporary file by asking the service to download it from a public URL. Provide payload fields such as fileUrl, fileName, and uploadPath.",
		parameters: {
			payload: jsonPayload.describe(
				"JSON body forwarded to /api/file-url-upload. Provide fields such as fileUrl, fileName, and uploadPath.",
			),
		},
		async execute({ payload }) {
			return client.postJson("/api/file-url-upload", payload);
		},
	});

	server.paidTool({
		name: "addInstrumental",
		description:
			"Create instrumental backing for an uploaded vocal track. Provide uploadUrl, title, tags, negativeTags, and any optional weights or model overrides.",
		pricePicoUSD: PRICE_PICO_USD.twelveCredits,
		parameters: {
			uploadUrl: z.string().min(1, "uploadUrl is required."),
			title: z.string().min(1, "title is required."),
			tags: z.string().min(1, "tags is required."),
			negativeTags: z.string().min(1, "negativeTags is required."),
			vocalGender: z.enum(["m", "f"]).optional(),
			styleWeight: z.number().min(0).max(1).optional(),
			weirdnessConstraint: z.number().min(0).max(1).optional(),
			audioWeight: z.number().min(0).max(1).optional(),
			model: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({
			uploadUrl,
			title,
			tags,
			negativeTags,
			vocalGender,
			styleWeight,
			weirdnessConstraint,
			audioWeight,
			model,
			extras,
		}) {
			return client.postJson("/api/v1/generate/add-instrumental", {
				uploadUrl,
				title,
				tags,
				negativeTags,
				callBackUrl: mockCallbackUrl,
				vocalGender,
				styleWeight,
				weirdnessConstraint,
				audioWeight,
				model,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "addVocals",
		description:
			"Generate vocals to layer onto an instrumental. Supply uploadUrl, prompt, style, title, negativeTags, plus optional tags, gender, weights, or model.",
		pricePicoUSD: PRICE_PICO_USD.twelveCredits,
		parameters: {
			uploadUrl: z.string().min(1, "uploadUrl is required."),
			prompt: z.string().min(1, "prompt is required."),
			title: z.string().min(1, "title is required."),
			style: z.string().min(1, "style is required."),
			negativeTags: z.string().min(1, "negativeTags is required."),
			tags: z.string().optional(),
			vocalGender: z.enum(["m", "f"]).optional(),
			styleWeight: z.number().min(0).max(1).optional(),
			weirdnessConstraint: z.number().min(0).max(1).optional(),
			audioWeight: z.number().min(0).max(1).optional(),
			model: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({
			uploadUrl,
			prompt,
			title,
			style,
			negativeTags,
			tags,
			vocalGender,
			styleWeight,
			weirdnessConstraint,
			audioWeight,
			model,
			extras,
		}) {
			return client.postJson("/api/v1/generate/add-vocals", {
				uploadUrl,
				prompt,
				style,
				title,
				negativeTags,
				callBackUrl: mockCallbackUrl,
				tags,
				vocalGender,
				styleWeight,
				weirdnessConstraint,
				audioWeight,
				model,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "boostStyle",
		description:
			"Refine or expand a style description for advanced models. Provide the content text plus any extra fields.",
		pricePicoUSD: PRICE_PICO_USD.fourTenthsCredit,
		parameters: {
			content: z.string().min(1, "content is required."),
			extras: jsonPayload.optional(),
		},
		async execute({ content, extras }) {
			return client.postJson("/api/v1/style/generate", {
				content,
				callBackUrl: mockCallbackUrl,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "convertToWav",
		description:
			"Convert a generated track to WAV format. Provide taskId or audioId, plus optional extra passthrough fields.",
		pricePicoUSD: PRICE_PICO_USD.fourTenthsCredit,
		parameters: {
			taskId: z.string().optional(),
			audioId: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({ taskId, audioId, extras }) {
			ensure(taskId || audioId, "Provide taskId or audioId.");

			return client.postJson("/api/v1/wav/generate", {
				taskId,
				audioId,
				callBackUrl: mockCallbackUrl,
				...compactExtras(extras),
			});
		},
	});

	server.freeTool({
		name: "generateCover",
		description:
			"Produce cover artwork for an existing music task. Supply taskId and any additional optional fields.",
		parameters: {
			taskId: z.string().min(1, "taskId is required."),
			extras: jsonPayload.optional(),
		},
		async execute({ taskId, extras }) {
			return client.postJson("/api/v1/suno/cover/generate", {
				taskId,
				callBackUrl: mockCallbackUrl,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "generateMusicVideo",
		description:
			"Render an MP4 music video for a generated track. Provide taskId, audioId, and optional author, domainName, or extra fields.",
		pricePicoUSD: PRICE_PICO_USD.twoCredits,
		parameters: {
			taskId: z.string().min(1, "taskId is required."),
			audioId: z.string().min(1, "audioId is required."),
			author: z.string().optional(),
			domainName: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({ taskId, audioId, author, domainName, extras }) {
			return client.postJson("/api/v1/mp4/generate", {
				taskId,
				audioId,
				author,
				domainName,
				callBackUrl: mockCallbackUrl,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "extendMusic",
		description:
			"Extend an existing generated track. Always set audioId; when defaultParamFlag is true also include prompt, style, title, and continueAt. Extra parameters are optional.",
		pricePicoUSD: PRICE_PICO_USD.twelveCredits,
		parameters: {
			audioId: z.string().min(1, "audioId is required."),
			defaultParamFlag: z.boolean().optional(),
			prompt: z.string().optional(),
			style: z.string().optional(),
			title: z.string().optional(),
			continueAt: z.number().positive().optional(),
			tags: z.string().optional(),
			negativeTags: z.string().optional(),
			model: z.string().optional(),
			instrumental: z.boolean().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({
			audioId,
			defaultParamFlag,
			prompt,
			style,
			title,
			continueAt,
			tags,
			negativeTags,
			model,
			instrumental,
			extras,
		}) {
			if (defaultParamFlag) {
				ensure(prompt, "prompt is required when defaultParamFlag is true.");
				ensure(style, "style is required when defaultParamFlag is true.");
				ensure(title, "title is required when defaultParamFlag is true.");
				ensure(
					continueAt !== undefined,
					"continueAt is required when defaultParamFlag is true.",
				);
			}

			return client.postJson("/api/v1/generate/extend", {
				audioId,
				defaultParamFlag,
				prompt,
				style,
				title,
				continueAt,
				callBackUrl: mockCallbackUrl,
				tags,
				negativeTags,
				model,
				instrumental,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "generateLyrics",
		description:
			"Generate standalone lyrics text. Provide prompt and, if desired, title, style, tags, language, model, or extra fields.",
		pricePicoUSD: PRICE_PICO_USD.fourTenthsCredit,
		parameters: {
			prompt: z.string().min(1, "prompt is required."),
			title: z.string().optional(),
			style: z.string().optional(),
			tags: z.string().optional(),
			language: z.string().optional(),
			model: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({ prompt, title, style, tags, language, model, extras }) {
			return client.postJson("/api/v1/lyrics", {
				prompt,
				title,
				style,
				tags,
				language,
				callBackUrl: mockCallbackUrl,
				model,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "generateMusic",
		description:
			"Generate music. In customMode provide style/title (and prompt when non-instrumental) and respect prompt/style limits by model; in non-custom mode only prompt (<=500 chars) is accepted.",
		pricePicoUSD: PRICE_PICO_USD.twelveCredits,
		parameters: {
			prompt: z.string().optional(),
			style: z.string().optional(),
			tags: z.string().optional(),
			negativeTags: z.string().optional(),
			title: z.string().optional(),
			model: z.string().optional(),
			customMode: z.boolean().optional(),
			instrumental: z.boolean().optional(),
			continueClip: z.boolean().optional(),
			continueAt: z.number().positive().optional(),
			clipId: z.string().optional(),
			audioId: z.string().optional(),
			uploadUrl: z.string().optional(),
			coverUrl: z.string().optional(),
			imageUrl: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({
			prompt,
			style,
			tags,
			negativeTags,
			title,
			model,
			customMode,
			instrumental,
			continueClip,
			continueAt,
			clipId,
			audioId,
			uploadUrl,
			coverUrl,
			imageUrl,
			extras,
		}) {
			if (customMode) {
				const { prompt: promptLimit, style: styleLimit } =
					resolveCustomModeLimits(model);

				if (instrumental) {
					ensure(style, "style is required when customMode is true.");
					ensure(title, "title is required when customMode is true.");
				} else {
					ensure(
						prompt,
						"prompt is required when customMode is true and instrumental is false.",
					);
					ensure(style, "style is required when customMode is true.");
					ensure(title, "title is required when customMode is true.");
				}

				ensureMaxLength(prompt, promptLimit, "prompt");
				ensureMaxLength(style, styleLimit, "style");
				ensureMaxLength(title, 80, "title");
			} else {
				ensure(prompt, "prompt is required when customMode is false.");
				ensureMaxLength(prompt, 500, "prompt");

				const disallowed = Object.entries({
					style,
					tags,
					negativeTags,
					title,
					model,
					instrumental,
					continueClip,
					continueAt,
					clipId,
					audioId,
					uploadUrl,
					coverUrl,
					imageUrl,
					extras,
				})
					.filter(([, value]) => value !== undefined)
					.map(([key]) => key);

				if (disallowed.length > 0) {
					throw new Error(
						`The following parameters must be omitted when customMode is false: ${disallowed.join(
							", ",
						)}.`,
					);
				}
			}

			const payload = customMode
				? {
						prompt,
						style,
						tags,
						negativeTags,
						title,
						callBackUrl: mockCallbackUrl,
						model,
						customMode,
						instrumental,
						continueClip,
						continueAt,
						clipId,
						audioId,
						uploadUrl,
						coverUrl,
						imageUrl,
						...compactExtras(extras),
					}
				: {
						prompt,
						callBackUrl: mockCallbackUrl,
					};

			return client.postJson("/api/v1/generate", payload);
		},
	});

	const registerRecordInfoTool = (
		name: string,
		description: string,
		pathname: string,
	) => {
		server.freeTool({
			name,
			description,
			parameters: {
				taskId: z.string().min(1, "taskId is required."),
				query: queryRecord.optional(),
			},
			async execute({ taskId, query }) {
				return client.get(pathname, { taskId, ...(query ?? {}) });
			},
		});
	};

	registerRecordInfoTool(
		"getCoverRecord",
		"Fetch the latest status and details for a cover generation task using its taskId. Optional query parameters are forwarded.",
		"/api/v1/suno/cover/record-info",
	);

	registerRecordInfoTool(
		"getLyricsRecord",
		"Fetch the latest status and details for a lyrics generation task using its taskId. Optional query parameters are forwarded.",
		"/api/v1/lyrics/record-info",
	);

	registerRecordInfoTool(
		"getMusicRecord",
		"Fetch the latest status and details for a music generation task using its taskId. Optional query parameters are forwarded.",
		"/api/v1/generate/record-info",
	);

	registerRecordInfoTool(
		"getVideoRecord",
		"Fetch the latest status and details for a music video task using its taskId. Optional query parameters are forwarded.",
		"/api/v1/mp4/record-info",
	);

	server.freeTool({
		name: "getRemainingCredits",
		description:
			"Check remaining account credits. Optional query parameters are forwarded to the service.",
		parameters: {
			query: queryRecord.optional(),
		},
		async execute({ query }) {
			return client.get("/api/v1/generate/credit", query ?? {});
		},
	});

	server.paidTool({
		name: "getTimestampedLyrics",
		description:
			"Retrieve timestamped lyrics for a generated track. Provide taskId and optionally audioId or musicIndex plus extra passthrough fields.",
		pricePicoUSD: PRICE_PICO_USD.halfCredit,
		parameters: {
			taskId: z.string().min(1, "taskId is required."),
			audioId: z.string().optional(),
			musicIndex: z.number().int().nonnegative().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({ taskId, audioId, musicIndex, extras }) {
			return client.postJson("/api/v1/generate/get-timestamped-lyrics", {
				taskId,
				audioId,
				musicIndex,
				...compactExtras(extras),
			});
		},
	});

	registerRecordInfoTool(
		"getVocalRemovalRecord",
		"Fetch the latest status and details for a vocal separation task using its taskId. Optional query parameters are forwarded.",
		"/api/v1/vocal-removal/record-info",
	);

	registerRecordInfoTool(
		"getWavRecord",
		"Fetch the latest status and details for a WAV conversion task using its taskId. Optional query parameters are forwarded.",
		"/api/v1/wav/record-info",
	);

	server.paidTool({
		name: "separateVocal",
		description:
			"Start a vocal or multi-stem separation job. Provide taskId, audioId, choose a type, and any optional extra fields.",
		pricePicoUSD: PRICE_PICO_USD.tenCredits,
		parameters: {
			taskId: z.string().min(1, "taskId is required."),
			audioId: z.string().min(1, "audioId is required."),
			type: z.enum(["separate_vocal", "split_stem"]),
			extras: jsonPayload.optional(),
		},
		async execute({ taskId, audioId, type, extras }) {
			return client.postJson("/api/v1/vocal-removal/generate", {
				taskId,
				audioId,
				type,
				callBackUrl: mockCallbackUrl,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "uploadAndCover",
		description:
			"Upload audio and transform it into a new styled cover. Provide uploadUrl and follow the prompt/style/title requirements based on customMode and instrumental options.",
		pricePicoUSD: PRICE_PICO_USD.twelveCredits,
		parameters: {
			uploadUrl: z.string().min(1, "uploadUrl is required."),
			customMode: z.boolean().optional(),
			instrumental: z.boolean().optional(),
			prompt: z.string().optional(),
			style: z.string().optional(),
			title: z.string().optional(),
			tags: z.string().optional(),
			negativeTags: z.string().optional(),
			model: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({
			uploadUrl,
			customMode,
			instrumental,
			prompt,
			style,
			title,
			tags,
			negativeTags,
			model,
			extras,
		}) {
			if (customMode) {
				if (instrumental) {
					ensure(
						style,
						"style is required when customMode is true and instrumental is true.",
					);
					ensure(
						title,
						"title is required when customMode is true and instrumental is true.",
					);
				} else {
					ensure(
						prompt,
						"prompt is required when customMode is true and instrumental is false.",
					);
					ensure(style, "style is required when customMode is true.");
					ensure(title, "title is required when customMode is true.");
				}
			} else {
				ensure(prompt, "prompt is required when customMode is false.");
			}

			return client.postJson("/api/v1/generate/upload-cover", {
				uploadUrl,
				customMode,
				instrumental,
				prompt,
				style,
				title,
				callBackUrl: mockCallbackUrl,
				tags,
				negativeTags,
				model,
				...compactExtras(extras),
			});
		},
	});

	server.paidTool({
		name: "uploadAndExtend",
		description:
			"Upload audio and extend its duration with new material. Provide uploadUrl, configure defaultParamFlag and include the necessary prompt/style/title/continueAt fields when required.",
		pricePicoUSD: PRICE_PICO_USD.twelveCredits,
		parameters: {
			uploadUrl: z.string().min(1, "uploadUrl is required."),
			defaultParamFlag: z.boolean().optional(),
			instrumental: z.boolean().optional(),
			prompt: z.string().optional(),
			style: z.string().optional(),
			title: z.string().optional(),
			continueAt: z.number().positive().optional(),
			tags: z.string().optional(),
			negativeTags: z.string().optional(),
			model: z.string().optional(),
			extras: jsonPayload.optional(),
		},
		async execute({
			uploadUrl,
			defaultParamFlag,
			instrumental,
			prompt,
			style,
			title,
			continueAt,
			tags,
			negativeTags,
			model,
			extras,
		}) {
			if (defaultParamFlag) {
				if (instrumental) {
					ensure(
						style,
						"style is required when defaultParamFlag is true and instrumental is true.",
					);
					ensure(
						title,
						"title is required when defaultParamFlag is true and instrumental is true.",
					);
				} else {
					ensure(
						prompt,
						"prompt is required when defaultParamFlag is true and instrumental is false.",
					);
					ensure(style, "style is required when defaultParamFlag is true.");
					ensure(title, "title is required when defaultParamFlag is true.");
				}
				ensure(
					continueAt !== undefined,
					"continueAt is required when defaultParamFlag is true.",
				);
			} else {
				ensure(prompt, "prompt is required when defaultParamFlag is false.");
			}

			return client.postJson("/api/v1/generate/upload-extend", {
				uploadUrl,
				defaultParamFlag,
				instrumental,
				prompt,
				style,
				title,
				continueAt,
				callBackUrl: mockCallbackUrl,
				tags,
				negativeTags,
				model,
				...compactExtras(extras),
			});
		},
	});

	server.start();
};

void main().catch((error) => {
	console.error("Failed to start Suno MCP server:", error);
	process.exitCode = 1;
});
