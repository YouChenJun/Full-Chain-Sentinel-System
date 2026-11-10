import { describe, expect, it } from "vitest";
import { monitorBranchesForUrl } from "../webui/src/code-monitor-input.ts";

describe("pasted monitor addresses", () => {
	it("derives each batch row without loading branches or defaulting to main", () => {
		const urls = [
			"https://github.com/YouChenJun/Full-Chain-Sentinel-System/tree/main",
			"https://github.com/acme/app/tree/develop",
			"https://github.com/acme/other/tree/release/1.x",
			"https://github.com/acme/root",
		];
		expect(urls.map((url) => monitorBranchesForUrl(url))).toEqual([["main"], ["develop"], ["release/1.x"], []]);
	});

	it("recomputes the selection when a pasted address changes", () => {
		expect(monitorBranchesForUrl("https://github.com/acme/app/tree/master")).toEqual(["master"]);
		expect(monitorBranchesForUrl("https://github.com/acme/app/tree/release%2F2.x")).toEqual(["release/2.x"]);
	});

	it("preserves manual choices, including clearing a selection for form validation", () => {
		const url = "https://github.com/acme/app/tree/develop";
		expect(monitorBranchesForUrl(url, ["master", "release/1.x"])).toEqual(["master", "release/1.x"]);
		expect(monitorBranchesForUrl(url, [])).toEqual([]);
	});

	it("defers repository-root and SSH default-branch resolution to the server", () => {
		expect(monitorBranchesForUrl("https://github.com/acme/app")).toEqual([]);
		expect(monitorBranchesForUrl("git@github.com:acme/app.git")).toEqual([]);
	});

	it("allows incomplete textarea input without crashing the editor", () => {
		for (const url of [
			"https://github.com",
			"https://github.com/acme/app/tree/",
			"https://github.com/acme/app/tree/%ZZ",
		]) {
			expect(monitorBranchesForUrl(url)).toEqual([]);
		}
	});
});
