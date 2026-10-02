import axios, {
	AxiosInstance,
	AxiosError,
	AxiosResponse,
	InternalAxiosRequestConfig,
} from "axios";

// TestRail Cloud allows 180 requests/minute on Professional and 300 on
// Enterprise; TestRail Server has no limit. Rather than model any of that, a
// 429 is retried using the delay the response itself reports.
const DEFAULT_MAX_RETRIES = 3;

// Longer than this and retrying stops being a favour to the caller: a tool
// call that blocks for minutes is worse than a rate-limit error it can act on.
export const MAX_RETRY_DELAY_MS = 60_000;

type RetryableConfig = InternalAxiosRequestConfig & { retryCount?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether a request body can be sent a second time.
 *
 * A stream body is consumed by the first attempt - addBdd posts a form-data
 * instance - so re-dispatching the same config would hang rather than retry.
 * Those requests surface the 429 immediately instead; the caller still has the
 * content and can rebuild the body.
 * @param data The request body axios was given
 * @returns True when the body is safe to resend
 */
function isReplayableBody(data: unknown): boolean {
	return (
		typeof (data as { pipe?: unknown } | null | undefined)?.pipe !== "function"
	);
}

/**
 * Works out how long a rate-limited request should wait before being retried.
 *
 * TestRail's docs say a 429 carries a Retry-After header, but instances have
 * been seen answering without one, and the error body states the delay too
 * ("Retry after 6 seconds"), so both are read before falling back to
 * exponential backoff.
 * @param response The 429 response
 * @param attempt Which retry this is, starting at 1
 * @returns Milliseconds to wait, uncapped - the caller decides what is too long
 */
export function retryDelayMs(
	response: Pick<AxiosResponse<{ error?: string }>, "headers" | "data">,
	attempt: number,
): number {
	// An empty or negative header is not a delay of zero; treating it as one
	// would retry with no wait at all and ignore the delay in the body.
	const rawHeader = response.headers?.["retry-after"];
	const header =
		typeof rawHeader === "string" || typeof rawHeader === "number"
			? String(rawHeader).trim()
			: "";
	if (header !== "") {
		const seconds = Number(header);
		// A Retry-After HTTP-date is legal but TestRail sends seconds, so
		// anything unparseable falls through rather than waiting NaN.
		if (Number.isFinite(seconds) && seconds >= 0) {
			return seconds * 1000;
		}
	}

	const bodySeconds = /retry after (\d+) second/i.exec(
		response.data?.error ?? "",
	);
	if (bodySeconds) {
		return Number(bodySeconds[1]) * 1000;
	}

	// Jitter keeps parallel callers from retrying in lockstep.
	return 2 ** (attempt - 1) * 1000 + Math.random() * 250;
}

// TestRail API client configuration interface
export interface TestRailClientConfig {
	baseURL: string;
	auth: {
		username: string;
		password: string;
	};
	timeout?: number;
	headers?: Record<string, string>;
	/** How many times to retry a rate-limited (429) request. Defaults to 3. */
	maxRetries?: number;
}

/**
 * Base TestRail API client that handles configuration and common functionality
 */
export class BaseTestRailClient {
	protected client: AxiosInstance;
	protected readonly maxRetries: number;

	constructor(config: TestRailClientConfig) {
		const headers = {
			"Content-Type": "application/json",
			...(config.headers || {}),
		};

		this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

		this.client = axios.create({
			baseURL: config.baseURL,
			headers,
			timeout: config.timeout ?? 30000,
			auth: config.auth,
		});

		// One interceptor covers every call, reads and writes alike. Retrying a
		// write is safe here because a 429 means TestRail rejected the request
		// outright, so nothing was half-applied.
		this.client.interceptors.response.use(undefined, (error: unknown) =>
			this.retryRateLimited(error),
		);
	}

	/**
	 * Retries a rate-limited request until maxRetries is reached, after which
	 * the original error is rethrown untouched.
	 * @param error The error an axios response interceptor was handed
	 * @returns The response from a successful retry
	 */
	private async retryRateLimited(error: unknown): Promise<AxiosResponse> {
		const axiosError = error as AxiosError<{ error?: string }>;
		const config = axiosError.config as RetryableConfig | undefined;

		if (axiosError.response?.status !== 429 || !config) {
			throw error;
		}

		if (!isReplayableBody(config.data)) {
			throw error;
		}

		const attempt = (config.retryCount ?? 0) + 1;
		if (attempt > this.maxRetries) {
			throw error;
		}

		// Waiting this long inside one call is worse than reporting the limit,
		// and the cap has to be checked per attempt or three long waits stack up.
		const delay = retryDelayMs(axiosError.response, attempt);
		if (delay > MAX_RETRY_DELAY_MS) {
			throw error;
		}

		config.retryCount = attempt;
		await sleep(delay);

		// Goes back through this interceptor, bounded by retryCount.
		return this.client.request(config);
	}

	/**
	 * Set a custom header
	 */
	setHeader(name: string, value: string): void {
		this.client.defaults.headers.common[name] = value;
	}
}
