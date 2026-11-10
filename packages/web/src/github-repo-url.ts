/** Shared, browser-safe GitHub repository and branch URL parsing. */

/** A repository URL resolved to the pieces the REST API needs. */
export interface GithubRepoRef {
	/** Host only, e.g. `github.com` or `ghe.example.com`. */
	host: string;
	/** REST base without a trailing slash. */
	apiBaseUrl: string;
	owner: string;
	repo: string;
	/** Canonical HTTPS clone/browse URL. */
	repoUrl: string;
	/** Explicit branch from a /tree/<branch> URL; absent for a repository root. */
	branch?: string;
}

/** Validate the API override and strip a trailing slash. */
export function normalizeApiBase(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("API Base URL 无法解析");
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error("API Base URL 只支持 http / https");
	}
	return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** The REST base a GitHub host uses when the operator did not override it. */
export function defaultApiBase(host: string, scheme: string): string {
	if (host.toLowerCase() === "github.com") return "https://api.github.com";
	return `${scheme}://${host}/api/v3`;
}

/**
 * Parse an HTTPS, SSH or bare `host/owner/repo` address. For tree URLs, the
 * entire suffix is the branch name, including any slashes; directory paths
 * are not guessed into a different branch.
 *
 * The host is not restricted to github.com: GitHub Enterprise serves the same
 * REST API under `/api/v3`, and the operator can override the base entirely.
 */
export function parseGithubRepoUrl(raw: string, apiBaseUrl?: string): GithubRepoRef {
	const input = raw.trim();
	if (!input) throw new Error("Git 地址不能为空");
	let host = "";
	let path = "";
	let scheme = "https";

	const scp = /^(?:[A-Za-z0-9._-]+@)?([^:/\s]+):(.+)$/.exec(input);
	(() => {
		if (scp && !input.includes("://")) {
			host = scp[1] ?? "";
			path = scp[2] ?? "";
			scheme = "https";
			return;
		}
		let url: URL;
		const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
		try {
			url = new URL(withScheme);
		} catch {
			throw new Error("Git 地址无法解析");
		}
		if (url.protocol !== "https:" && url.protocol !== "http:" && url.protocol !== "ssh:") {
			throw new Error("只支持 https / http / ssh 形式的地址");
		}
		if (url.password) throw new Error("地址里不能带密码，请用访问令牌");
		host = url.hostname;
		path = url.pathname;
		// SSH is only used to name the repository; the REST API is HTTPS.
		scheme = url.protocol === "http:" ? "http" : "https";
	})();

	const segments = path.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
	if (segments.length < 2) throw new Error("地址里要包含 owner/repo");
	const owner = segments[0] ?? "";
	const repo = (segments[1] ?? "").replace(/\.git$/i, "");
	if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
		throw new Error("owner 或 repo 名不合法");
	}
	if (!host) throw new Error("地址里没有主机名");

	let branch: string | undefined;
	if (segments[2] === "tree") {
		try {
			branch = decodeURIComponent(segments.slice(3).join("/"));
		} catch {
			throw new Error("分支 URL 编码无效");
		}
		if (!branch) throw new Error("tree 地址里缺少分支名");
	}

	const override = apiBaseUrl?.trim() ? normalizeApiBase(apiBaseUrl) : "";
	return {
		host,
		apiBaseUrl: override || defaultApiBase(host, scheme),
		owner,
		repo,
		repoUrl: `${scheme}://${host}/${owner}/${repo}`,
		...(branch ? { branch } : {}),
	};
}
