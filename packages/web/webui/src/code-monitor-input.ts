import { parseGithubRepoUrl } from "../../src/github-repo-url.ts";

/** An explicit edit wins; an empty inferred selection asks the server for the default branch. */
export function monitorBranchesForUrl(url: string, selected?: string[]): string[] {
	if (selected !== undefined) return selected;
	try {
		const { branch } = parseGithubRepoUrl(url);
		return branch ? [branch] : [];
	} catch {
		// The server reports invalid addresses in the per-repository import result.
		return [];
	}
}
