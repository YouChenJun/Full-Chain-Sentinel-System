import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeMonitorManager } from "../src/code-monitor.ts";
import { CodeMonitorStore, codeMonitorDbPath } from "../src/code-monitor-store.ts";

const fixtures: { dir: string; store: CodeMonitorStore }[] = [];

afterEach(() => {
	for (const { dir, store } of fixtures.splice(0)) {
		store.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

function setup(defaultBranch = "master", missingBranch?: string) {
	const dir = mkdtempSync(join(tmpdir(), "sentinel-code-branches-"));
	const store = new CodeMonitorStore(codeMonitorDbPath(dir));
	fixtures.push({ dir, store });
	const paths: string[] = [];
	const fetchImpl = vi.fn<typeof fetch>(async (input) => {
		const path = new URL(String(input)).pathname;
		paths.push(path);
		if (path === "/repos/acme/app") return Response.json({ default_branch: defaultBranch });
		const prefix = "/repos/acme/app/branches/";
		if (path.startsWith(prefix)) {
			const branch = decodeURIComponent(path.slice(prefix.length));
			return branch === missingBranch
				? Response.json({ message: "Branch not found" }, { status: 404 })
				: Response.json({ name: branch, commit: { sha: `head-${branch}` } });
		}
		throw new Error(`Unexpected request: ${path}`);
	});
	const manager = new CodeMonitorManager(dir, store, {
		onChange: () => {},
		project: () => ({ id: "p1", name: "P", cwd: "/tmp", container: "c" }),
		ensureContainer: async () => true,
		createEngine: async () => "engine-1",
		notify: () => {},
		fetchImpl,
	});
	return { manager, store, paths };
}

describe("monitor branch selection", () => {
	it.each(["main", "develop", "release/1.x", "release%2F1.x", "%E5%8F%91%E5%B8%83"])(
		"creates directly from a tree/%s URL without listing branches",
		async (ref) => {
			const { manager, paths } = setup();
			const branch = decodeURIComponent(ref);
			const monitor = await manager.create({
				projectId: "p1",
				url: `https://github.com/acme/app/tree/${ref}?tab=readme#readme`,
				branches: [],
			});
			expect(monitor.repoUrl).toBe("https://github.com/acme/app");
			expect(monitor.branches).toEqual([branch]);
			expect(monitor.baselines).toEqual({ [branch]: `head-${branch}` });
			expect(paths).toEqual([`/repos/acme/app/branches/${encodeURIComponent(branch)}`]);
		},
	);

	it.each(["master", "develop"])("uses the actual default %s even when main exists", async (defaultBranch) => {
		const { manager, paths } = setup(defaultBranch);
		const monitor = await manager.create({ projectId: "p1", url: "https://github.com/acme/app", branches: [] });
		expect(monitor.branches).toEqual([defaultBranch]);
		expect(paths).toEqual(["/repos/acme/app", `/repos/acme/app/branches/${defaultBranch}`]);
	});

	it("keeps a manual override instead of reselecting the URL branch", async () => {
		const { manager, paths } = setup();
		const monitor = await manager.create({
			projectId: "p1",
			url: "https://github.com/acme/app/tree/develop",
			branches: ["release/2.x"],
		});
		expect(monitor.branches).toEqual(["release/2.x"]);
		expect(paths).toEqual(["/repos/acme/app/branches/release%2F2.x"]);
	});

	it.each(["main", "release/missing"])("does not silently replace an explicit missing %s", async (branch) => {
		const { manager, store, paths } = setup("master", branch);
		await expect(
			manager.create({ projectId: "p1", url: `https://github.com/acme/app/tree/${branch}`, branches: [] }),
		).rejects.toThrow("HTTP 404");
		expect(store.listMonitors()).toEqual([]);
		expect(paths).toEqual([`/repos/acme/app/branches/${encodeURIComponent(branch)}`]);
	});

	it("preserves an existing branch baseline on update and resolves a newly selected URL branch", async () => {
		const { manager, paths } = setup();
		const input = { projectId: "p1", url: "https://github.com/acme/app", branches: ["main"] };
		const created = await manager.create(input);
		const edited = await manager.update(created.id, { ...input, name: "Renamed" });
		expect(edited.baselines).toEqual({ main: "head-main" });
		expect(paths).toHaveLength(1);
		const changed = await manager.update(created.id, { ...input, url: `${input.url}/tree/develop`, branches: [] });
		expect(changed.branches).toEqual(["develop"]);
		expect(changed.baselines).toEqual({ develop: "head-develop" });
	});

	it("rejects an invalid inferred branch before making any request", async () => {
		const { manager, paths } = setup();
		await expect(
			manager.create({ projectId: "p1", url: "https://github.com/acme/app/tree/-bad", branches: [] }),
		).rejects.toThrow("分支名不合法");
		expect(paths).toEqual([]);
	});
});
