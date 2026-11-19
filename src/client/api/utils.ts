import { AxiosError } from "axios";

/**
 * Extracts the HTTP status from an axios error, or undefined if not an HTTP response.
 * Falls back to a carried `.status`: handleApiError rewords axios failures
 * into plain Errors, so batched callers read the status back off those.
 */
export function getErrorStatus(error: unknown): number | undefined {
	return (
		(error as AxiosError)?.response?.status ??
		(error as { status?: number })?.status
	);
}

/**
 * Handles API errors with better context
 * @param error The error object from catch
 * @param message Optional context message
 * @returns Enhanced error with better context
 */
export function handleApiError(error: unknown, message: string): Error {
	// If it's an Axios error, we can get more context
	if (error instanceof Error) {
		const axiosError = error as AxiosError<{ error?: string }>;
		if (axiosError.response) {
			const status = axiosError.response.status;
			const responseData = axiosError.response.data;
			console.error(
				`${message}: ${JSON.stringify({ response: { status, data: responseData } })}`,
			);
			// Surface TestRail's own error body instead of the generic
			// "Request failed with status code NNN" axios message. The status
			// rides along as a property so batched callers can tell a 404
			// apart from a dead credential after the rewording.
			const apiMessage = responseData?.error;
			if (apiMessage) {
				return Object.assign(
					new Error(`${message}: ${apiMessage} (status ${status})`),
					{ status },
				);
			}
		} else {
			console.error(`${message}: ${error}`);
		}
		return error;
	}

	// For non-Error objects, create a new Error
	return new Error(`${message}: ${String(error)}`);
}
