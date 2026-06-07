#!/usr/bin/env bun
// @ts-check
/**
 * Set a GitHub release's body from its matching CHANGELOG.md section, so release
 * notes always mirror the changelog: per-version npm badge + the section's
 * `### Added/Changed/Fixed` blocks + a uniform Full Changelog link.
 *
 * Invoked from `actions/github-script` (see .github/workflows/release-notes.yml).
 */
import pkg from '#pkg' with { type: 'json' };
import { error } from 'node:console';
import { readFile } from 'node:fs/promises';
import { argv, env, exit, stdout } from 'node:process';

const { name, version } = pkg;

/**
 * Parse `[version]: url` link-reference definitions into a map.
 * @param {string} changelog
 * @returns {Record<string, string>}
 */
function parseCompareLinks(changelog) {
	return Object.fromEntries(
		[...changelog.matchAll(/^\[([^\]]+)\]: (https?:\/\/\S+)$/gm)].map((m) => [m[1], m[2]]),
	);
}

/**
 * Extract the body of the `## [version] - date` section, minus link refs.
 * @param {string} changelog
 * @param {string} version
 * @returns {string | null}
 */
function extractSection(changelog, version) {
	const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`(?:^|\\n)## \\[${esc}\\](?: - \\S+)?\\n([\\s\\S]*?)(?=\\n## \\[|$)`);
	const captured = changelog.match(re)?.[1];
	if (captured == null) return null;

	return captured
		.split('\n')
		.filter((line) => !/^\[.+\]: https?:\/\//.test(line))
		.join('\n')
		.trim();
}

/**
 * Build the unified release body for a version, or null if no section exists.
 * @param {string} changelog
 * @param {string} version
 * @returns {string | null}
 */
export function buildNotes(changelog, version) {
	const section = extractSection(changelog, version);
	if (!section) return null;

	const badge = `\
[![NPM Version](https://img.shields.io/badge/npm-v${version}-black?logo=npm&labelColor=CB3837)]`
		+ `(https://www.npmjs.com/package/${name}/v/${version})`;

	let body = `\
${badge}

${section}`;
	const link = parseCompareLinks(changelog)[version];
	if (link) body += `\n\n**Full Changelog**: ${link}`;
	return `${body}\n`;
}

/**
 * github-script entrypoint: update the published release's notes from CHANGELOG.
 * @param {import('@actions/github-script').AsyncFunctionArguments} args
 */
export async function updateReleaseNotes({ github, context, core }) {
	const release = context.payload['release'];
	if (!release) {
		core.setFailed('No release object in event payload.');
		return;
	}

	const version = release.tag_name.replace(/^v/, '');
	const changelog = await readFile(`${env['GITHUB_WORKSPACE']}/CHANGELOG.md`, 'utf8');
	const body = buildNotes(changelog, version);

	if (!body) {
		core.warning(`No CHANGELOG.md section for ${version}; leaving release notes unchanged.`);
		return;
	}

	await github.rest.repos.updateRelease({
		owner: context.repo.owner,
		repo: context.repo.repo,
		release_id: release.id,
		body,
	});
	core.info(`Updated release notes for v${version} from CHANGELOG.md.`);

	await core.summary.addRaw(body).write();
}

// CLI: `node scripts/release-notes.mjs [version]` prints the rendered notes
// (defaults to package.json's version). Preview without touching any release.
if (import.meta.main) {
	const arg = argv[2];

	if (arg === '-h' || arg === '--help') {
		stdout.write(`\
Usage: ${import.meta.file} [version]

Render the GitHub release notes for a CHANGELOG.md version:
the npm badge, the [version] section, and a Full Changelog link.

Arguments:
  version       Version to render (default: package.json version, ${version}).

Options:
  -h, --help    Show this help.
`);
		exit(0);
	}

	const requested = arg ?? version;
	const root = new URL('../', import.meta.url);
	const notes = buildNotes(await readFile(new URL('CHANGELOG.md', root), 'utf8'), requested);
	if (notes == null) {
		error(`error: no CHANGELOG.md section for "${requested}". Pass an existing version (e.g. ${version}) or --help.`);
		exit(1);
	}
	stdout.write(notes);
}
